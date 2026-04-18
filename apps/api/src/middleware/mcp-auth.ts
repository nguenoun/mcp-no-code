import type { Request, Response, NextFunction } from 'express'
import { prisma } from '@mcpbuilder/db'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'
import { verifyOAuthAccessToken } from '../lib/oauth-jwt'

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_SECS = 5 * 60 // 5 minutes

// MCP clients can connect from any origin (Claude Desktop, IDEs, custom agents)
const MCP_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
}

// ─── Redis key helpers ────────────────────────────────────────────────────────

function apiKeyCacheKey(apiKey: string): string {
  return `mcp:auth:cache:${apiKey}`
}

function accessLogKey(serverId: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `mcp:access:${serverId}:${date}`
}

/** Cache du mode d'auth + statut d'un serveur (lookup par serverId). */
function serverModeCacheKey(serverId: string): string {
  return `mcp:server:mode:${serverId}`
}

/** Cache du statut de révocation d'un JTI OAuth. */
function jtiCacheKey(jti: string): string {
  return `mcp:oauth:jti:${jti}`
}

// ─── Access logging ───────────────────────────────────────────────────────────

async function logAccess(
  serverId: string,
  ip: string,
  success: boolean,
  reason: string,
): Promise<void> {
  const entry = JSON.stringify({
    ip,
    success,
    reason,
    timestamp: new Date().toISOString(),
  })
  const key = accessLogKey(serverId)
  await redis
    .pipeline()
    .rpush(key, entry)
    .ltrim(key, -1000, -1) // keep only the last 1 000 entries per server per day
    .expire(key, 60 * 60 * 24 * 30) // 30-day TTL
    .exec()
    .catch(() => undefined) // log silently; never block the request
}

// ─── Cached server lookup (API key path) ─────────────────────────────────────

interface CachedServer {
  serverId: string
  status: string
}

async function resolveApiKey(apiKey: string): Promise<CachedServer | null> {
  // 1. Try Redis cache first
  const cached = await redis.get(apiKeyCacheKey(apiKey)).catch(() => null)
  if (cached) {
    try {
      return JSON.parse(cached) as CachedServer
    } catch {
      // Corrupt entry — fall through to DB
    }
  }

  // 2. DB lookup
  const dbServer = await prisma.mcpServer.findUnique({
    where: { apiKey },
    select: { id: true, status: true },
  })
  if (!dbServer) return null

  // 3. Populate cache (fire-and-forget)
  redis
    .set(
      apiKeyCacheKey(apiKey),
      JSON.stringify({ serverId: dbServer.id, status: dbServer.status }),
      'EX',
      CACHE_TTL_SECS,
    )
    .catch(() => undefined)

  return { serverId: dbServer.id, status: dbServer.status }
}

// ─── Cached server lookup (OAuth path) ───────────────────────────────────────

interface ServerModeCache {
  authMode: string
  status: string
}

/**
 * Lookup d'un serveur par son ID pour récupérer authMode + status.
 * Utilisé sur le chemin OAuth pour éviter d'invalider le chemin API_KEY
 * qui résout par apiKey.
 */
async function resolveServerById(serverId: string): Promise<ServerModeCache | null> {
  const cached = await redis.get(serverModeCacheKey(serverId)).catch(() => null)
  if (cached) {
    try {
      return JSON.parse(cached) as ServerModeCache
    } catch {
      // Corrupt entry — fall through to DB
    }
  }

  const dbServer = await prisma.mcpServer.findUnique({
    where: { id: serverId },
    select: { authMode: true, status: true },
  })
  if (!dbServer) return null

  redis
    .set(serverModeCacheKey(serverId), JSON.stringify(dbServer), 'EX', CACHE_TTL_SECS)
    .catch(() => undefined)

  return { authMode: dbServer.authMode, status: dbServer.status }
}

/**
 * Vérifie si un JTI OAuth est révoqué.
 * Cache Redis 5 min : "valid" | "revoked".
 * La fenêtre de 5 min est acceptable (standard pour les OAuth AS).
 */
async function isJtiRevoked(jti: string, mcpServerId: string): Promise<boolean> {
  const cached = await redis.get(jtiCacheKey(jti)).catch(() => null)
  if (cached === 'revoked') return true
  if (cached === 'valid') return false

  const token = await prisma.oAuthToken.findFirst({
    where: { jti, mcpServerId },
    select: { revokedAt: true },
  })

  // Introuvable ou déjà révoqué → revoked
  if (!token || token.revokedAt !== null) {
    redis.set(jtiCacheKey(jti), 'revoked', 'EX', CACHE_TTL_SECS).catch(() => undefined)
    return true
  }

  redis.set(jtiCacheKey(jti), 'valid', 'EX', CACHE_TTL_SECS).catch(() => undefined)
  return false
}

// ─── WWW-Authenticate builder ─────────────────────────────────────────────────

/**
 * Construit le header WWW-Authenticate RFC 6750 + MCP spec.
 * Le client MCP lit `as_uri` pour découvrir les métadonnées OAuth via
 * GET {as_uri}/.well-known/oauth-authorization-server
 */
function wwwAuthenticateHeader(req: Request, serverId: string): string {
  const apiBase =
    process.env['API_URL'] ??
    `${req.protocol}://${req.get('host')}`
  const asUri = `${apiBase}/mcp/${serverId}`
  return `Bearer realm="MCPBuilder", as_uri="${asUri}"`
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function mcpAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Apply CORS headers for all MCP responses
  Object.entries(MCP_CORS_HEADERS).forEach(([k, v]) => res.set(k, v))

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const serverId = req.params['serverId'] ?? 'unknown'
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown'

  try {
    // Extract Bearer token
    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bearer ')) {
      await logAccess(serverId, ip, false, 'missing-token')
      // WWW-Authenticate is required by RFC 6750 and the MCP OAuth spec so that
      // clients can discover the authorization server and initiate the OAuth flow.
      res
        .status(401)
        .set('WWW-Authenticate', wwwAuthenticateHeader(req, serverId))
        .json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
        })
      return
    }

    const token = authHeader.slice(7)

    // ── Chemin OAuth JWT ──────────────────────────────────────────────────────
    //
    // On vérifie d'abord la signature JWT (O(1), pas de I/O).
    // Si le token est un JWT valide (signé avec OAUTH_SIGNING_KEY) :
    //   1. Vérification sid === serverId (claim du JWT)
    //   2. Vérification authMode du serveur === 'OAUTH'
    //   3. Vérification jti non révoqué (DB/cache Redis)
    //
    // Si le JWT est invalide (mauvaise signature, expiré, format incorrect) :
    //   → on tombe sur le chemin API_KEY ci-dessous, inchangé.

    const oauthPayload = verifyOAuthAccessToken(token)
    if (oauthPayload !== null) {
      // Vérifie que le JWT cible bien ce serveur
      if (oauthPayload.sid !== serverId) {
        await logAccess(serverId, ip, false, 'oauth-sid-mismatch')
        res
          .status(401)
          .set('WWW-Authenticate', wwwAuthenticateHeader(req, serverId))
          .json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Token not valid for this server' },
          })
        return
      }

      // Vérifie que le serveur attend bien des tokens OAuth
      const serverInfo = await resolveServerById(serverId)
      if (!serverInfo || serverInfo.authMode !== 'OAUTH') {
        await logAccess(serverId, ip, false, 'oauth-token-on-apikey-server')
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'This server does not accept OAuth tokens' },
        })
        return
      }

      if (serverInfo.status === 'STOPPED') {
        await logAccess(serverId, ip, false, 'server-stopped')
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'MCP server is stopped' },
        })
        return
      }

      // Vérifie que le JTI n'a pas été révoqué
      const revoked = await isJtiRevoked(oauthPayload.jti, serverId)
      if (revoked) {
        await logAccess(serverId, ip, false, 'oauth-token-revoked')
        res
          .status(401)
          .set('WWW-Authenticate', wwwAuthenticateHeader(req, serverId))
          .json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Token has been revoked' },
          })
        return
      }

      await logAccess(serverId, ip, true, 'ok')
      next()
      return
    }

    // ── Chemin API_KEY (inchangé) ─────────────────────────────────────────────

    const apiKey = token
    const server = await resolveApiKey(apiKey)

    if (!server) {
      await logAccess(serverId, ip, false, 'invalid-key')
      res
        .status(401)
        .set('WWW-Authenticate', wwwAuthenticateHeader(req, serverId))
        .json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        })
      return
    }

    // Verify the URL serverId matches the key's server
    if (req.params['serverId'] && server.serverId !== req.params['serverId']) {
      await logAccess(serverId, ip, false, 'serverId-mismatch')
      res
        .status(401)
        .set('WWW-Authenticate', wwwAuthenticateHeader(req, serverId))
        .json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        })
      return
    }

    if (server.status === 'STOPPED') {
      await logAccess(server.serverId, ip, false, 'server-stopped')
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'MCP server is stopped' },
      })
      return
    }

    await logAccess(server.serverId, ip, true, 'ok')
    next()
  } catch (err) {
    logger.error({ err }, 'MCP auth middleware error')
    next(err)
  }
}
