import { Router } from 'express'
import { prisma } from '@mcpbuilder/db'
import type { ApiResponse } from '@mcpbuilder/shared'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'

const router = Router({ mergeParams: true })

// ─── GET /api/v1/workspaces ───────────────────────────────────────────────────
// List all workspaces belonging to the authenticated user.

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ success: true, data: workspaces } satisfies ApiResponse<typeof workspaces>)
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/v1/workspaces/:workspaceId/stats ───────────────────────────────
// Aggregate CallLog data for the last 24 hours.

router.get('/:workspaceId/stats', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId } = req.params

    // Verify ownership
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: req.user.sub },
    })
    if (!workspace) throw AppError.notFound('Workspace')

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
      activeServers,
      callsToday,
      errorsToday,
      latencyData,
    ] = await Promise.all([
      prisma.mcpServer.count({
        where: { workspaceId, status: 'RUNNING' },
      }),
      prisma.callLog.count({
        where: {
          mcpServer: { workspaceId },
          createdAt: { gte: since },
        },
      }),
      prisma.callLog.count({
        where: {
          mcpServer: { workspaceId },
          status: 'ERROR',
          createdAt: { gte: since },
        },
      }),
      prisma.callLog.aggregate({
        where: {
          mcpServer: { workspaceId },
          createdAt: { gte: since },
          latencyMs: { not: null },
        },
        _avg: { latencyMs: true },
      }),
    ])

    res.json({
      success: true,
      data: {
        activeServers,
        callsToday,
        errorsToday,
        avgLatencyMs: Math.round(latencyData._avg.latencyMs ?? 0),
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
