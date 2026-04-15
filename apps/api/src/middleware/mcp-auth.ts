import type { Request, Response, NextFunction } from 'express'
import { prisma } from '@mcpbuilder/db'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'

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

// ─── Cached server lookup ─────────────────────────────────────────────────────

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
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      })
      return
    }

    const apiKey = authHeader.slice(7)
    const server = await resolveApiKey(apiKey)

    if (!server) {
      await logAccess(serverId, ip, false, 'invalid-key')
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
      })
      return
    }

    // Verify the URL serverId matches the key's server
    if (req.params['serverId'] && server.serverId !== req.params['serverId']) {
      await logAccess(serverId, ip, false, 'serverId-mismatch')
      res.status(401).json({
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
