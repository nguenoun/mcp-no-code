import type { Request, Response, NextFunction } from 'express'
import { prisma } from '@mcpbuilder/db'
import { redis } from '../lib/redis'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function rateLimit(
  key: string,
  limit: number,
  res: Response,
  next: NextFunction,
): Promise<boolean> {
  try {
    const count = await redis.incr(key)
    if (count === 1) redis.expire(key, 60).catch(() => undefined)
    if (count > limit) {
      res.set('Retry-After', '60')
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded. Try again in 60 seconds.' },
      })
      return true // blocked
    }
    return false
  } catch (err) {
    // Redis failure — fail open (don't block the request)
    logger.warn({ err }, 'Rate limiter Redis error — failing open')
    return false
  }
}

// ─── IP rate limiter: 100 req/min per IP ─────────────────────────────────────

export async function ipRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown'
  const minute = Math.floor(Date.now() / 60_000)
  const key = `rate:ip:${ip}:${minute}`
  const blocked = await rateLimit(key, 100, res, next)
  if (!blocked) next()
}

// ─── Workspace rate limiter: 300 req/min per workspaceId ─────────────────────

export async function workspaceRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const workspaceId = req.params['workspaceId']
  if (!workspaceId) { next(); return }
  const minute = Math.floor(Date.now() / 60_000)
  const key = `rate:ws:${workspaceId}:${minute}`
  const blocked = await rateLimit(key, 300, res, next)
  if (!blocked) next()
}

// ─── MCP proxy rate limiter: 60 req/min per serverId ─────────────────────────

export async function mcpRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const serverId = req.params['serverId']
  if (!serverId) { next(); return }
  const minute = Math.floor(Date.now() / 60_000)
  const key = `rate:mcp:${serverId}:${minute}`
  const blocked = await rateLimit(key, 60, res, next)
  if (!blocked) next()
}

// ─── Ownership validation ─────────────────────────────────────────────────────
//
// Factory that returns a middleware verifying the requested resource belongs
// to the authenticated user. Must be used AFTER authMiddleware.
//
// Usage: router.get('/:serverId/...', authMiddleware, requireOwnership('server'), handler)

export function requireOwnership(resourceType: 'server' | 'workspace' | 'credential') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (req as any).user?.sub as string | undefined
      if (!userId) {
        next(AppError.unauthorized())
        return
      }

      switch (resourceType) {
        case 'server': {
          const serverId = req.params['serverId']
          if (!serverId) { next(); return }
          const record = await prisma.mcpServer.findFirst({
            where: { id: serverId, workspace: { userId } },
            select: { id: true },
          })
          if (!record) throw AppError.forbidden('Access denied — server not found in your workspace')
          break
        }
        case 'workspace': {
          const workspaceId = req.params['workspaceId']
          if (!workspaceId) { next(); return }
          const record = await prisma.workspace.findFirst({
            where: { id: workspaceId, userId },
            select: { id: true },
          })
          if (!record) throw AppError.forbidden('Access denied — workspace not found')
          break
        }
        case 'credential': {
          const { workspaceId, credentialId } = req.params
          if (!workspaceId || !credentialId) { next(); return }
          const record = await prisma.credential.findFirst({
            where: { id: credentialId, workspaceId, workspace: { userId } },
            select: { id: true },
          })
          if (!record) throw AppError.forbidden('Access denied — credential not found in your workspace')
          break
        }
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

// ─── Audit logger ─────────────────────────────────────────────────────────────
//
// Logs all mutations (POST/PUT/PATCH/DELETE) to Redis with a 30-day TTL.
// Sensitive fields are redacted before storage.

const SENSITIVE_KEYS = new Set([
  'password', 'encryptedvalue', 'apikey', 'token', 'secret',
  'value', 'accesstoken', 'refreshtoken', 'authorization',
])

function redactSensitive(body: unknown, depth = 0): unknown {
  if (depth > 5 || !body || typeof body !== 'object') return body
  if (Array.isArray(body)) return body.map((item) => redactSensitive(item, depth + 1))
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redactSensitive(v, depth + 1)
  }
  return result
}

const AUDIT_TTL = 60 * 60 * 24 * 30 // 30 days

export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next()
    return
  }

  res.on('finish', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.sub ?? 'anonymous'
    const pathParts = req.path.split('/').filter(Boolean)
    const resourceType = pathParts[0] ?? 'unknown'
    const resourceId =
      req.params['serverId'] ??
      req.params['workspaceId'] ??
      req.params['credentialId'] ??
      req.params['toolId'] ??
      null

    const entry = JSON.stringify({
      userId,
      action: req.method,
      resourceType,
      resourceId,
      ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
      timestamp: new Date().toISOString(),
      statusCode: res.statusCode,
      body: redactSensitive(req.body),
    })

    const key = `audit:${Date.now()}:${userId}`
    redis.set(key, entry, 'EX', AUDIT_TTL).catch((err: unknown) => {
      logger.error({ err }, 'Failed to write audit log entry')
    })
  })

  next()
}

// ─── Input sanitization ───────────────────────────────────────────────────────
//
// Strips ASCII control characters (except \t, \n, \r) from all string values
// in the request body. Body size is already capped at 1 MB by express.json().

const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return value
  if (typeof value === 'string') return value.replace(CONTROL_CHAR_RE, '')
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeValue(v, depth + 1)
    }
    return result
  }
  return value
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body !== undefined) req.body = sanitizeValue(req.body)
  next()
}
