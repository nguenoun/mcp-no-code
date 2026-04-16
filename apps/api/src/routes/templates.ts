import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import { generateApiKey, getServerTemplateById, serverTemplates } from '@mcpbuilder/mcp-runtime'
import type { ApiResponse } from '@mcpbuilder/shared'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'
import { runtimeManager } from '../services/runtime-manager'
import { triggerCfRedeploy } from '../services/cloudflare-service'

const router = Router({ mergeParams: true })

const createFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  serverName: z.string().min(1).max(100),
  credentialId: z.string().cuid().optional(),
  runtimeMode: z.enum(['LOCAL', 'CLOUDFLARE']).default('LOCAL'),
})

async function getWorkspaceForUser(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  })
  if (!workspace) throw AppError.notFound('Workspace')
  return workspace
}

router.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const templateSummaries = serverTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      icon: template.icon,
      baseUrl: template.baseUrl,
      authType: template.authType,
      authHelpUrl: template.authHelpUrl,
      toolCount: template.tools.length,
    }))

    res.json({ success: true, data: templateSummaries } satisfies ApiResponse<typeof templateSummaries>)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params
    if (!id) {
      next()
      return
    }

    const template = getServerTemplateById(id)
    if (!template) throw AppError.notFound('Template')

    res.json({ success: true, data: template } satisfies ApiResponse<typeof template>)
  } catch (err) {
    next(err)
  }
})

router.post('/from-template', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId } = req.params
    if (!workspaceId) {
      next()
      return
    }

    await getWorkspaceForUser(workspaceId, req.user.sub)

    const body = createFromTemplateSchema.parse(req.body)
    const template = getServerTemplateById(body.templateId)
    if (!template) throw AppError.notFound('Template')

    if (template.authType !== 'NONE' && !body.credentialId) {
      throw AppError.validation(`Template "${template.name}" requires a credential`)
    }

    if (body.credentialId) {
      const credential = await prisma.credential.findFirst({
        where: { id: body.credentialId, workspaceId },
      })
      if (!credential) throw AppError.notFound('Credential')

      if (template.authType !== 'NONE' && credential.type !== template.authType) {
        throw AppError.validation(
          `Credential type mismatch: expected ${template.authType}, got ${credential.type}`,
        )
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const server = await tx.mcpServer.create({
        data: {
          workspaceId,
          name: body.serverName,
          description: `Server generated from template: ${template.name}`,
          status: 'STOPPED',
          runtimeMode: body.runtimeMode,
          apiKey: generateApiKey(),
          ...(body.credentialId ? { credentialId: body.credentialId } : {}),
        },
      })

      await tx.mcpTool.createMany({
        data: template.tools.map((tool) => ({
          mcpServerId: server.id,
          name: tool.name,
          description: tool.description,
          httpMethod: tool.httpMethod,
          httpUrl: `${template.baseUrl.replace(/\/$/, '')}${tool.httpUrl.startsWith('/') ? '' : '/'}${tool.httpUrl}`,
          parametersSchema: tool.parametersSchema as object,
          headersConfig: tool.headersConfig as object,
          isEnabled: tool.isEnabled,
        })),
      })

      const withTools = await tx.mcpServer.findUnique({
        where: { id: server.id },
        include: {
          tools: true,
          credential: { select: { id: true, name: true, type: true } },
        },
      })
      if (!withTools) throw AppError.notFound('Server')
      return withTools
    })

    if (body.runtimeMode === 'CLOUDFLARE') {
      triggerCfRedeploy(created.id)
    } else {
      runtimeManager.startServer(created.id).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        void prisma.mcpServer.update({ where: { id: created.id }, data: { status: 'ERROR' } })
        console.error(`[RuntimeManager] Failed to start template server ${created.id}: ${message}`)
      })
    }

    res.status(201).json({ success: true, data: created } satisfies ApiResponse<typeof created>)
  } catch (err) {
    next(err)
  }
})

export default router
