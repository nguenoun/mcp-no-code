import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import type { ApiResponse } from '@mcpbuilder/shared'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'
import { triggerCfRedeploy } from '../services/cloudflare-service'
import {
  analyzeGithubRepo,
  type GithubAnalyzeResult,
} from '../services/github-import-service'

const router = Router({ mergeParams: true })

// ─── Schemas ──────────────────────────────────────────────────────────────────

const analyzeSchema = z.object({
  repoUrl: z
    .string()
    .url('Must be a valid URL')
    .refine((u) => {
      try {
        return new URL(u).hostname === 'github.com'
      } catch {
        return false
      }
    }, 'Only github.com repositories are supported'),
  branch: z.string().max(255).optional(),
  githubToken: z.string().max(200).optional(),
  baseUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
})

const jsonSchemaValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchemaValueSchema),
    z.record(jsonSchemaValueSchema),
  ]),
)

const jsonSchema7Schema: z.ZodType<Record<string, unknown>> = z
  .record(jsonSchemaValueSchema)
  .default({})

const toolSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
      'Name must contain only alphanumeric characters and hyphens',
    ),
  description: z.string().max(500).default(''),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  httpUrl: z.string().min(1).max(2048),
  parametersSchema: jsonSchema7Schema,
  headersConfig: z
    .array(
      z.object({
        key: z.string().min(1).max(256),
        value: z.string().max(2048),
        isSecret: z.boolean(),
      }),
    )
    .default([]),
  isEnabled: z.boolean().default(true),
})

const confirmSchema = z.object({
  tools: z.array(toolSchema).min(1).max(50),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getServerForUser(serverId: string, userId: string) {
  const server = await prisma.mcpServer.findFirst({
    where: { id: serverId, workspace: { userId } },
  })
  if (!server) throw AppError.notFound('Server')
  return server
}

// ─── POST /api/v1/servers/:serverId/import/analyze ────────────────────────────

router.post('/analyze', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    await getServerForUser(serverId!, req.user.sub)

    const body = analyzeSchema.parse(req.body)

    let result: GithubAnalyzeResult
    try {
      result = await analyzeGithubRepo({
        repoUrl: body.repoUrl,
        branch: body.branch,
        githubToken: body.githubToken,
        baseUrl: body.baseUrl,
      })
    } catch (err) {
      throw new AppError(
        'GITHUB_IMPORT_FAILED',
        err instanceof Error ? err.message : 'Failed to analyze repository',
        422,
      )
    }

    res.json({ success: true, data: result } satisfies ApiResponse<GithubAnalyzeResult>)
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/v1/servers/:serverId/import/confirm ───────────────────────────

router.post('/confirm', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    const server = await getServerForUser(serverId!, req.user.sub)

    const { tools } = confirmSchema.parse(req.body)

    // Skip tools whose name already exists in this server
    const existing = await prisma.mcpTool.findMany({
      where: { mcpServerId: serverId! },
      select: { name: true },
    })
    const existingNames = new Set(existing.map((t) => t.name))

    // Also deduplicate within the batch itself
    const seen = new Set<string>()
    const toCreate = tools.filter((t) => {
      if (existingNames.has(t.name) || seen.has(t.name)) return false
      seen.add(t.name)
      return true
    })

    const created = await prisma.$transaction(
      toCreate.map((tool) =>
        prisma.mcpTool.create({
          data: {
            mcpServerId: serverId!,
            name: tool.name,
            description: tool.description,
            httpMethod: tool.httpMethod,
            httpUrl: tool.httpUrl,
            parametersSchema: tool.parametersSchema,
            headersConfig: tool.headersConfig,
            isEnabled: tool.isEnabled,
          },
        }),
      ),
    )

    // Fire-and-forget Cloudflare redeploy
    if (server.runtimeMode === 'CLOUDFLARE') {
      triggerCfRedeploy(serverId!)
    }

    res.status(201).json({
      success: true,
      data: {
        created: created.length,
        skipped: tools.length - created.length,
        redeployTriggered: server.runtimeMode === 'CLOUDFLARE',
      },
    } satisfies ApiResponse<{ created: number; skipped: number; redeployTriggered: boolean }>)
  } catch (err) {
    next(err)
  }
})

export default router
