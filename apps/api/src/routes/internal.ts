import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'

const router = Router()

const workerLogSchema = z.object({
  serverId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(['SUCCESS', 'ERROR']),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  timestamp: z.string().datetime(),
})

/**
 * POST /api/internal/worker-log
 *
 * Receives a tool execution metric from a Cloudflare Worker.
 * Auth: X-Internal-Secret header — machine-to-machine, no JWT.
 */
router.post('/worker-log', async (req, res, next) => {
  try {
    // ─── Auth ─────────────────────────────────────────────────────────────────
    const internalSecret = process.env['INTERNAL_SECRET']
    if (!internalSecret) {
      res.status(503).json({ success: false, error: { message: 'Internal logging not configured' } })
      return
    }

    const provided = req.headers['x-internal-secret']
    if (!provided || provided !== internalSecret) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
      return
    }

    // ─── Validation ───────────────────────────────────────────────────────────
    const parsed = workerLogSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { message: 'Invalid body', details: parsed.error.flatten() } })
      return
    }

    const { serverId, toolName, status, latencyMs, errorMessage } = parsed.data

    // ─── Persist CallLog ──────────────────────────────────────────────────────
    await prisma.callLog.create({
      data: {
        mcpServerId: serverId,
        toolName,
        status,
        latencyMs: latencyMs ?? null,
        errorMessage: errorMessage ?? null,
      },
    })

    // ─── Increment Redis monthly counter ──────────────────────────────────────
    try {
      const server = await prisma.mcpServer.findUnique({
        where: { id: serverId },
        select: { workspaceId: true },
      })

      if (server) {
        const now = new Date()
        const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
        const redisKey = `calls:${server.workspaceId}:${month}`
        await redis.incr(redisKey)
      }
    } catch (redisErr) {
      // Non-fatal — log but do not fail the request
      logger.warn({ serverId, err: redisErr }, 'Failed to increment Redis monthly counter')
    }

    res.status(201).json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
