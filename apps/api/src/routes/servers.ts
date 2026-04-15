import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import type { ApiResponse } from '@mcpbuilder/shared'
import { generateApiKey } from '@mcpbuilder/mcp-runtime'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'
import { runtimeManager } from '../services/runtime-manager'

// ─── Shared query schemas ─────────────────────────────────────────────────────

const logsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['SUCCESS', 'ERROR']).optional(),
  toolName: z.string().optional(),
})

const router = Router({ mergeParams: true })

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  // null explicitly detaches the credential; undefined = no change
  credentialId: z.string().cuid().nullable().optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getWorkspaceForUser(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  })
  if (!workspace) throw AppError.notFound('Workspace')
  return workspace
}

async function getServerForUser(serverId: string, userId: string) {
  const server = await prisma.mcpServer.findFirst({
    where: { id: serverId, workspace: { userId } },
  })
  if (!server) throw AppError.notFound('Server')
  return server
}

// ─── GET /api/v1/workspaces/:workspaceId/servers ──────────────────────────────

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId } = req.params
    if (!workspaceId) { next(); return }

    await getWorkspaceForUser(workspaceId, req.user.sub)

    const servers = await prisma.mcpServer.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        credential: { select: { id: true, name: true, type: true } },
        _count: { select: { tools: { where: { isEnabled: true } } } },
      },
    })

    res.json({ success: true, data: servers })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/v1/workspaces/:workspaceId/servers ─────────────────────────────

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId } = req.params
    if (!workspaceId) { next(); return }

    await getWorkspaceForUser(workspaceId, req.user.sub)

    const body = createServerSchema.parse(req.body)
    const apiKey = generateApiKey()

    const createData: Parameters<typeof prisma.mcpServer.create>[0]['data'] = {
      workspaceId,
      name: body.name,
      apiKey,
      status: 'STOPPED',
      ...(body.description !== undefined && { description: body.description }),
    }

    const server = await prisma.mcpServer.create({ data: createData })

    // Start the runtime in the background — don't block the response
    runtimeManager.startServer(server.id).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      void prisma.mcpServer
        .update({ where: { id: server.id }, data: { status: 'ERROR' } })
        .catch(() => undefined)
      console.error(`[RuntimeManager] Failed to start server ${server.id}: ${msg}`)
    })

    res.status(201).json({ success: true, data: server } satisfies ApiResponse<typeof server>)
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/v1/servers/:serverId ──────────────────────────────────────────

router.get('/:serverId', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    const server = await prisma.mcpServer.findFirst({
      where: { id: serverId, workspace: { userId: req.user.sub } },
      include: {
        credential: { select: { id: true, name: true, type: true } },
        _count: { select: { tools: { where: { isEnabled: true } } } },
      },
    })
    if (!server) throw AppError.notFound('Server')

    res.json({ success: true, data: server })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/v1/servers/:serverId/status ────────────────────────────────────

router.get('/:serverId/status', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    await getServerForUser(serverId, req.user.sub)

    const dbServer = await prisma.mcpServer.findUnique({
      where: { id: serverId },
      select: { status: true, endpointUrl: true },
    })

    const runtimeInfo = runtimeManager.getStatusInfo(serverId)

    res.json({
      success: true,
      data: {
        serverId,
        dbStatus: dbServer?.status ?? 'STOPPED',
        endpointUrl: dbServer?.endpointUrl ?? null,
        ...runtimeInfo,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/v1/servers/:serverId/restart ───────────────────────────────────

router.post('/:serverId/restart', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    await getServerForUser(serverId, req.user.sub)

    const endpointUrl = await runtimeManager.restartServer(serverId)

    res.json({ success: true, data: { serverId, endpointUrl } })
  } catch (err) {
    next(err)
  }
})

// ─── PUT /api/v1/servers/:serverId ────────────────────────────────────────────
//
// Partial update — supports name, description, and credentialId attachment.

router.put('/:serverId', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    const body = updateServerSchema.parse(req.body)

    await getServerForUser(serverId, req.user.sub)

    // When attaching a credential, verify it belongs to the same workspace
    if (body.credentialId) {
      const server = await prisma.mcpServer.findUnique({
        where: { id: serverId },
        select: { workspaceId: true },
      })
      const credential = await prisma.credential.findFirst({
        where: { id: body.credentialId, workspaceId: server!.workspaceId },
      })
      if (!credential) throw AppError.notFound('Credential')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {}
    if (body.name !== undefined) updateData['name'] = body.name
    if (body.description !== undefined) updateData['description'] = body.description
    if ('credentialId' in body) updateData['credentialId'] = body.credentialId

    const updated = await prisma.mcpServer.update({
      where: { id: serverId },
      data: updateData,
      include: { credential: { select: { id: true, name: true, type: true } } },
    })

    // If server is running, restart it to pick up the config change
    if (runtimeManager.getPort(serverId) !== null) {
      runtimeManager.restartServer(serverId).catch((err: unknown) => {
        console.error(`[RuntimeManager] Restart after update failed for ${serverId}: ${String(err)}`)
      })
    }

    res.json({ success: true, data: updated } satisfies ApiResponse<typeof updated>)
  } catch (err) {
    next(err)
  }
})

// ─── DELETE /api/v1/servers/:serverId ────────────────────────────────────────

router.delete('/:serverId', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    await getServerForUser(serverId, req.user.sub)

    // Stop runtime first (ignoring errors — we still delete from DB)
    await runtimeManager.stopServer(serverId).catch(() => undefined)

    await prisma.mcpServer.delete({ where: { id: serverId } })

    res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: boolean }>)
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/v1/servers/:serverId/logs ─────────────────────────────────────

router.get('/:serverId/logs', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    await getServerForUser(serverId, req.user.sub)

    const { page, limit, status, toolName } = logsQuerySchema.parse(req.query)
    const skip = (page - 1) * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { mcpServerId: serverId }
    if (status) where['status'] = status
    if (toolName) where['toolName'] = toolName

    const [logs, total] = await prisma.$transaction([
      prisma.callLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.callLog.count({ where }),
    ])

    res.json({
      success: true,
      data: {
        logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/v1/servers/:serverId/rotate-key ──────────────────────────────

router.post('/:serverId/rotate-key', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    await getServerForUser(serverId, req.user.sub)

    const newApiKey = generateApiKey()
    await prisma.mcpServer.update({
      where: { id: serverId },
      data: { apiKey: newApiKey },
    })

    res.json({ success: true, data: { apiKey: newApiKey } } satisfies ApiResponse<{ apiKey: string }>)
  } catch (err) {
    next(err)
  }
})

export default router
