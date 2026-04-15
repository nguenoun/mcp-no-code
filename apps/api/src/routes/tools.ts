import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import type { ApiResponse } from '@mcpbuilder/shared'
import { decrypt, getMasterKey } from '@mcpbuilder/mcp-runtime'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'

const router = Router({ mergeParams: true })

// ─── Schemas ──────────────────────────────────────────────────────────────────

// Recursive JSON Schema validator (validates structure, not semantics)
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

const jsonSchema7Schema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z
    .object({
      $schema: z.string().optional(),
      $defs: z.record(jsonSchema7Schema).optional(),
      type: z
        .union([
          z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']),
          z.array(z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'])),
        ])
        .optional(),
      properties: z.record(jsonSchema7Schema).optional(),
      items: z.union([jsonSchema7Schema, z.array(jsonSchema7Schema)]).optional(),
      required: z.array(z.string()).optional(),
      description: z.string().optional(),
      enum: z.array(jsonSchemaValueSchema).optional(),
      format: z.string().optional(),
      default: jsonSchemaValueSchema.optional(),
      allOf: z.array(jsonSchema7Schema).optional(),
      anyOf: z.array(jsonSchema7Schema).optional(),
      oneOf: z.array(jsonSchema7Schema).optional(),
      additionalProperties: z.union([z.boolean(), jsonSchema7Schema]).optional(),
      title: z.string().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
    })
    .passthrough(),
)

const headerConfigSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.string().max(2048),
  isSecret: z.boolean(),
})

// alphanum + hyphens, cannot start or end with hyphen
const TOOL_NAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/

const createToolSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      TOOL_NAME_REGEX,
      'Name must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen',
    ),
  description: z.string().max(500).default(''),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  httpUrl: z.string().min(1).max(2048),
  parametersSchema: jsonSchema7Schema.default({}),
  headersConfig: z.array(headerConfigSchema).default([]),
  isEnabled: z.boolean().default(true),
})

const updateToolSchema = createToolSchema.partial()

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getServerForUser(serverId: string, userId: string) {
  const server = await prisma.mcpServer.findFirst({
    where: {
      id: serverId,
      workspace: { userId },
    },
  })
  if (!server) {
    throw AppError.notFound('Server')
  }
  return server
}

// ─── GET /api/v1/servers/:serverId/tools ─────────────────────────────────────

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    const { page, limit } = paginationSchema.parse(req.query)
    const skip = (page - 1) * limit

    await getServerForUser(serverId, req.user.sub)

    const [tools, total] = await prisma.$transaction([
      prisma.mcpTool.findMany({
        where: { mcpServerId: serverId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.mcpTool.count({ where: { mcpServerId: serverId } }),
    ])

    res.json({
      success: true,
      data: {
        tools,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/v1/servers/:serverId/tools ────────────────────────────────────

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    const body = createToolSchema.parse(req.body)

    await getServerForUser(serverId, req.user.sub)

    const existing = await prisma.mcpTool.findFirst({
      where: { mcpServerId: serverId, name: body.name },
    })
    if (existing) {
      throw AppError.conflict(`A tool named "${body.name}" already exists on this server`)
    }

    const tool = await prisma.mcpTool.create({
      data: {
        mcpServerId: serverId,
        name: body.name,
        description: body.description,
        httpMethod: body.httpMethod,
        httpUrl: body.httpUrl,
        parametersSchema: body.parametersSchema as object,
        headersConfig: body.headersConfig as object,
        isEnabled: body.isEnabled,
      },
    })

    res.status(201).json({ success: true, data: tool } satisfies ApiResponse<typeof tool>)
  } catch (err) {
    next(err)
  }
})

// ─── PUT /api/v1/servers/:serverId/tools/:toolId ─────────────────────────────

router.put('/:toolId', authMiddleware, async (req, res, next) => {
  try {
    const { serverId, toolId } = req.params
    const body = updateToolSchema.parse(req.body)

    await getServerForUser(serverId, req.user.sub)

    const existingTool = await prisma.mcpTool.findFirst({
      where: { id: toolId, mcpServerId: serverId },
    })
    if (!existingTool) {
      throw AppError.notFound('Tool')
    }

    if (body.name !== undefined && body.name !== existingTool.name) {
      const nameConflict = await prisma.mcpTool.findFirst({
        where: { mcpServerId: serverId, name: body.name, id: { not: toolId } },
      })
      if (nameConflict) {
        throw AppError.conflict(`A tool named "${body.name}" already exists on this server`)
      }
    }

    const updated = await prisma.mcpTool.update({
      where: { id: toolId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.httpMethod !== undefined && { httpMethod: body.httpMethod }),
        ...(body.httpUrl !== undefined && { httpUrl: body.httpUrl }),
        ...(body.parametersSchema !== undefined && {
          parametersSchema: body.parametersSchema as object,
        }),
        ...(body.headersConfig !== undefined && { headersConfig: body.headersConfig as object }),
        ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
      },
    })

    res.json({ success: true, data: updated } satisfies ApiResponse<typeof updated>)
  } catch (err) {
    next(err)
  }
})

// ─── DELETE /api/v1/servers/:serverId/tools/:toolId ──────────────────────────
//
// Without ?confirm=true  → soft delete (isEnabled = false)
// With    ?confirm=true  → hard delete (removes the record)

router.delete('/:toolId', authMiddleware, async (req, res, next) => {
  try {
    const { serverId, toolId } = req.params
    const confirm = req.query['confirm'] === 'true'

    await getServerForUser(serverId, req.user.sub)

    const tool = await prisma.mcpTool.findFirst({
      where: { id: toolId, mcpServerId: serverId },
    })
    if (!tool) {
      throw AppError.notFound('Tool')
    }

    if (confirm) {
      await prisma.mcpTool.delete({ where: { id: toolId } })
      res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: boolean }>)
    } else {
      const disabled = await prisma.mcpTool.update({
        where: { id: toolId },
        data: { isEnabled: false },
      })
      res.json({ success: true, data: disabled } satisfies ApiResponse<typeof disabled>)
    }
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/v1/servers/:serverId/tools/:toolId/test ──────────────────────
//
// Execute the tool with the provided args, log to CallLog, return response.
// Body: { args: Record<string, unknown> }

router.post('/:toolId/test', authMiddleware, async (req, res, next) => {
  try {
    const { serverId, toolId } = req.params

    const server = await getServerForUser(serverId, req.user.sub)

    const tool = await prisma.mcpTool.findFirst({
      where: { id: toolId, mcpServerId: serverId },
    })
    if (!tool) throw AppError.notFound('Tool')

    const args = ((req.body as Record<string, unknown>)['args'] ?? {}) as Record<string, unknown>

    // ── Build credential header ──────────────────────────────────────────────
    let credentialHeader: { name: string; value: string } | null = null
    if (server.credentialId) {
      const cred = await prisma.credential.findUnique({ where: { id: server.credentialId } })
      if (cred) {
        try {
          const masterKey = getMasterKey()
          const plaintext = decrypt(cred.encryptedValue, masterKey)
          switch (cred.type) {
            case 'BEARER':
              credentialHeader = { name: 'Authorization', value: `Bearer ${plaintext}` }
              break
            case 'API_KEY':
              credentialHeader = { name: 'X-API-Key', value: plaintext }
              break
            case 'BASIC_AUTH': {
              const { username, password } = JSON.parse(plaintext) as { username: string; password: string }
              const encoded = Buffer.from(`${username}:${password}`).toString('base64')
              credentialHeader = { name: 'Authorization', value: `Basic ${encoded}` }
              break
            }
          }
        } catch {
          // Decryption failure — proceed without credential
        }
      }
    }

    // ── Fill path params ─────────────────────────────────────────────────────
    const remaining = { ...args }
    const url = tool.httpUrl.replace(/\{([^}]+)\}/g, (_: string, key: string) => {
      const val = remaining[key]
      delete remaining[key]
      return val !== undefined && val !== null ? String(val) : ''
    })

    // ── Build headers ────────────────────────────────────────────────────────
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const staticHeaders = tool.headersConfig as Array<{ key: string; value: string }>
    for (const h of staticHeaders) {
      headers[h.key] = h.value
    }
    if (credentialHeader) {
      headers[credentialHeader.name] = credentialHeader.value
    }

    // ── Build request ────────────────────────────────────────────────────────
    const method = tool.httpMethod.toUpperCase()
    let finalUrl = url
    let body: string | undefined

    if (method === 'GET' || method === 'DELETE' || method === 'HEAD') {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(remaining)) {
        if (v !== undefined && v !== null) qs.set(k, String(v))
      }
      const qsStr = qs.toString()
      if (qsStr) finalUrl += (finalUrl.includes('?') ? '&' : '?') + qsStr
    } else if (Object.keys(remaining).length > 0) {
      body = JSON.stringify(remaining)
    }

    // ── Execute + time ───────────────────────────────────────────────────────
    const startMs = Date.now()
    let responseText: string
    let httpStatus: number
    let callStatus: 'SUCCESS' | 'ERROR'

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30_000)
      const response = await fetch(finalUrl, {
        method,
        headers,
        ...(body !== undefined && { body }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      const latencyMs = Date.now() - startMs
      httpStatus = response.status
      const ct = response.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) {
        responseText = JSON.stringify(await response.json())
      } else {
        responseText = await response.text()
      }
      callStatus = response.ok ? 'SUCCESS' : 'ERROR'

      await prisma.callLog.create({
        data: {
          mcpServerId: serverId,
          toolName: tool.name,
          status: callStatus,
          latencyMs,
          ...(callStatus === 'ERROR' && { errorMessage: `HTTP ${httpStatus}` }),
        },
      })

      return res.json({
        success: true,
        data: { httpStatus, latencyMs, body: responseText, status: callStatus },
      })
    } catch (err) {
      const latencyMs = Date.now() - startMs
      const message = err instanceof Error ? err.message : String(err)
      await prisma.callLog.create({
        data: {
          mcpServerId: serverId,
          toolName: tool.name,
          status: 'ERROR',
          latencyMs,
          errorMessage: message,
        },
      })
      return res.json({
        success: true,
        data: { httpStatus: 0, latencyMs, body: null, status: 'ERROR', error: message },
      })
    }
  } catch (err) {
    next(err)
  }
})

export default router
