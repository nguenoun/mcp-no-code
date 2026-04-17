import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import type { ApiResponse } from '@mcpbuilder/shared'
import { generateApiKey } from '@mcpbuilder/mcp-runtime'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'
import { runtimeManager } from '../services/runtime-manager'
import { getCfDeployer, isCfConfigured, triggerCfRedeploy } from '../services/cloudflare-service'

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
  runtimeMode: z.enum(['LOCAL', 'CLOUDFLARE']).default('LOCAL'),
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

// ─── GET /api/v1/servers/runtime-config ──────────────────────────────────────
//
// Returns whether CF credentials are configured and the default runtime mode.
// Must be defined before /:serverId routes to avoid being swallowed by the param.

router.get('/runtime-config', authMiddleware, (_req, res) => {
  const defaultMode = process.env['MCP_RUNTIME_MODE'] === 'cloudflare' ? 'CLOUDFLARE' : 'LOCAL'
  res.json({
    success: true,
    data: {
      cloudflareConfigured: isCfConfigured(),
      defaultRuntimeMode: defaultMode,
    },
  })
})

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
      runtimeMode: body.runtimeMode,
      ...(body.description !== undefined && { description: body.description }),
    }

    const server = await prisma.mcpServer.create({ data: createData })

    if (body.runtimeMode === 'CLOUDFLARE') {
      // Cloudflare Workers have no tools yet at creation time — nothing to deploy
      // The Worker will be deployed on first tool save.
    } else {
      // Start the local runtime in the background — don't block the response
      runtimeManager.startServer(server.id).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        void prisma.mcpServer
          .update({ where: { id: server.id }, data: { status: 'ERROR' } })
          .catch(() => undefined)
        console.error(`[RuntimeManager] Failed to start server ${server.id}: ${msg}`)
      })
    }

    res.status(201).json({ success: true, data: server } satisfies ApiResponse<typeof server>)
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/v1/servers/:serverId/deployment-status ─────────────────────────

router.get('/:serverId/deployment-status', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    await getServerForUser(serverId, req.user.sub)

    const dbServer = await prisma.mcpServer.findUnique({
      where: { id: serverId },
      select: { status: true, endpointUrl: true, runtimeMode: true },
    })
    if (!dbServer) throw AppError.notFound('Server')

    if (dbServer.runtimeMode === 'CLOUDFLARE') {
      const deployer = getCfDeployer()
      const workerName = deployer?.getWorkerName(serverId) ?? null

      // Worker API status
      let workerApiStatus: string = 'unknown'
      if (deployer) {
        try {
          workerApiStatus = await deployer.getWorkerStatus(serverId)
        } catch {
          workerApiStatus = 'error'
        }
      }

      // HTTP health check against the Worker URL
      let healthCheck: { ok: boolean; latencyMs: number; toolCount: number } | null = null
      if (dbServer.endpointUrl) {
        const startMs = Date.now()
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 5_000)
          const r = await fetch(`${dbServer.endpointUrl}/health`, { signal: controller.signal })
          clearTimeout(timer)
          const latencyMs = Date.now() - startMs
          let toolCount = 0
          if (r.ok) {
            try {
              const body = await r.json() as Record<string, unknown>
              toolCount = typeof body['toolCount'] === 'number' ? body['toolCount'] : 0
            } catch { /* non-JSON health response */ }
          }
          healthCheck = { ok: r.ok, latencyMs, toolCount }
        } catch {
          healthCheck = { ok: false, latencyMs: Date.now() - startMs, toolCount: 0 }
        }
      }

      return res.json({
        success: true,
        data: {
          status: dbServer.status,
          endpointUrl: dbServer.endpointUrl,
          workerName,
          workerApiStatus,
          healthCheck,
        },
      })
    }

    // Local mode — return runtimeManager status
    const runtimeInfo = runtimeManager.getStatusInfo(serverId)
    return res.json({
      success: true,
      data: {
        status: dbServer.status,
        endpointUrl: dbServer.endpointUrl,
        workerName: null,
        workerApiStatus: null,
        healthCheck: null,
        ...runtimeInfo,
      },
    })
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

    const server = await getServerForUser(serverId, req.user.sub)

    if (server.runtimeMode === 'CLOUDFLARE') {
      triggerCfRedeploy(serverId)
      res.json({ success: true, data: { serverId, endpointUrl: server.endpointUrl } })
    } else {
      const endpointUrl = await runtimeManager.restartServer(serverId)
      res.json({ success: true, data: { serverId, endpointUrl } })
    }
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

    let redeployTriggered = false

    if (updated.runtimeMode === 'CLOUDFLARE') {
      if (updated.status === 'RUNNING') {
        triggerCfRedeploy(serverId)
        redeployTriggered = true
      }
    } else {
      // Local mode — restart in-process runtime if running
      if (runtimeManager.getPort(serverId) !== null) {
        runtimeManager.restartServer(serverId).catch((err: unknown) => {
          console.error(`[RuntimeManager] Restart after update failed for ${serverId}: ${String(err)}`)
        })
      }
    }

    res.json({ success: true, data: { ...updated, redeployTriggered } } satisfies ApiResponse<typeof updated & { redeployTriggered: boolean }>)
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/v1/servers/:serverId/deployment-verify ─────────────────────────
//
// Vérifie que le worker Cloudflare déployé est synchronisé avec la DB.
// Compare : server ID, authMode, liste des tools actifs, et teste le rejet auth.

router.get('/:serverId/deployment-verify', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    const server = await getServerForUser(serverId!, req.user.sub)

    if (server.runtimeMode !== 'CLOUDFLARE' || !server.endpointUrl) {
      res.json({
        success: true,
        data: { applicable: false, reason: 'Server is not a Cloudflare deployment' },
      })
      return
    }

    const baseUrl = server.endpointUrl.replace(/\/$/, '')
    const healthUrl = `${baseUrl}/health`
    const mcpUrl = `${baseUrl}/mcp`

    // ── 1. Health check ───────────────────────────────────────────────────────
    type HealthPayload = {
      status: string
      serverId: string
      authMode: string
      toolCount: number
      tools: string[]
    }

    let health: HealthPayload | null = null
    let workerReachable = false
    let healthLatencyMs: number | null = null

    try {
      const t0 = Date.now()
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) })
      healthLatencyMs = Date.now() - t0
      if (r.ok) {
        health = (await r.json()) as HealthPayload
        workerReachable = true
      }
    } catch {
      workerReachable = false
    }

    // ── 2. DB state ───────────────────────────────────────────────────────────
    const dbTools = await prisma.mcpTool.findMany({
      where: { mcpServerId: serverId!, isEnabled: true },
      select: { name: true },
      orderBy: { createdAt: 'asc' },
    })
    const dbToolNames = dbTools.map((t) => t.name)
    const dbAuthMode = server.authMode ?? 'API_KEY'

    // ── 3. Auth rejection test ─────────────────────────────────────────────────
    // An unauthenticated POST to /mcp must return 401.
    let authRejectionStatus: 'ok' | 'fail' | 'unknown' = 'unknown'
    if (workerReachable) {
      try {
        const r = await fetch(mcpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
          signal: AbortSignal.timeout(8000),
        })
        authRejectionStatus = r.status === 401 ? 'ok' : 'fail'
      } catch {
        authRejectionStatus = 'unknown'
      }
    }

    // ── 4. Build diff ─────────────────────────────────────────────────────────
    // Only compute diffs when the worker is reachable — otherwise everything
    // is 'unknown' and showing a false mismatch would be misleading.
    const workerToolNames: string[] = workerReachable ? (health?.tools ?? []) : []
    const missingFromWorker = workerReachable
      ? dbToolNames.filter((n) => !workerToolNames.includes(n))
      : []
    const extraInWorker = workerReachable
      ? workerToolNames.filter((n) => !dbToolNames.includes(n))
      : []

    const checks = {
      serverId: {
        status: !workerReachable
          ? ('unknown' as const)
          : health?.serverId === serverId
            ? ('ok' as const)
            : ('mismatch' as const),
        worker: health?.serverId ?? null,
        expected: serverId!,
      },
      authMode: {
        status: !workerReachable
          ? ('unknown' as const)
          : health?.authMode === dbAuthMode
            ? ('ok' as const)
            : ('mismatch' as const),
        worker: health?.authMode ?? null,
        expected: dbAuthMode,
      },
      toolCount: {
        status: !workerReachable
          ? ('unknown' as const)
          : health?.toolCount === dbToolNames.length
            ? ('ok' as const)
            : ('mismatch' as const),
        worker: health?.toolCount ?? null,
        expected: dbToolNames.length,
      },
      tools: {
        status: !workerReachable
          ? ('unknown' as const)
          : missingFromWorker.length === 0 && extraInWorker.length === 0
            ? ('ok' as const)
            : ('mismatch' as const),
        missingFromWorker,
        extraInWorker,
      },
      authRejection: { status: authRejectionStatus },
    }

    const hasMismatch = Object.values(checks).some((c) => c.status === 'mismatch')
    const hasFail = checks.authRejection.status === 'fail'
    const overallStatus = !workerReachable
      ? 'error'
      : hasMismatch || hasFail
        ? 'degraded'
        : 'ok'

    res.json({
      success: true,
      data: {
        applicable: true,
        workerReachable,
        healthLatencyMs,
        endpointUrl: server.endpointUrl,
        checks,
        overallStatus,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── DELETE /api/v1/servers/:serverId ────────────────────────────────────────

router.delete('/:serverId', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    if (!serverId) { next(); return }

    const server = await getServerForUser(serverId, req.user.sub)

    // Stop local runtime (ignoring errors — we still delete from DB)
    await runtimeManager.stopServer(serverId).catch(() => undefined)

    // Delete Cloudflare worker if applicable (fire-and-forget on error)
    if (server.runtimeMode === 'CLOUDFLARE' && isCfConfigured()) {
      await getCfDeployer().deleteWorker(serverId).catch(() => undefined)
    }

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
