import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import type { ApiResponse } from '@mcpbuilder/shared'
import { decrypt, getMasterKey } from '@mcpbuilder/mcp-runtime'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'

const router = Router({ mergeParams: true })

// ─── Schemas ──────────────────────────────────────────────────────────────────

const basicAuthValueSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const createCredentialSchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string().min(1).max(100),
    type: z.literal('API_KEY'),
    value: z.string().min(1, 'API key value is required'),
  }),
  z.object({
    name: z.string().min(1).max(100),
    type: z.literal('BEARER'),
    value: z.string().min(1, 'Bearer token value is required'),
  }),
  z.object({
    name: z.string().min(1).max(100),
    type: z.literal('BASIC_AUTH'),
    value: basicAuthValueSchema,
  }),
])

const testCredentialSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .refine((u) => u.startsWith('https://') || u.startsWith('http://'), 'Must be an HTTP/HTTPS URL'),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Serialize credential value to a plaintext string before encryption */
function serializeValue(
  type: 'API_KEY' | 'BEARER' | 'BASIC_AUTH',
  value: string | { username: string; password: string },
): string {
  if (type === 'BASIC_AUTH' && typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value as string
}

/** Build the Authorization header value from a decrypted credential payload */
function buildAuthHeader(
  type: string,
  plaintext: string,
): { header: string; value: string } {
  switch (type) {
    case 'BEARER':
      return { header: 'Authorization', value: `Bearer ${plaintext}` }
    case 'API_KEY':
      return { header: 'X-API-Key', value: plaintext }
    case 'BASIC_AUTH': {
      const { username, password } = JSON.parse(plaintext) as {
        username: string
        password: string
      }
      const encoded = Buffer.from(`${username}:${password}`).toString('base64')
      return { header: 'Authorization', value: `Basic ${encoded}` }
    }
    default:
      return { header: 'Authorization', value: plaintext }
  }
}

/** Verify workspace belongs to the authenticated user */
async function getWorkspaceForUser(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  })
  if (!workspace) throw AppError.notFound('Workspace')
  return workspace
}

// ─── Safe credential shape (no encrypted value) ───────────────────────────────

const SAFE_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  type: true,
  createdAt: true,
} as const

// ─── GET /api/v1/workspaces/:workspaceId/credentials ─────────────────────────

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId } = req.params
    await getWorkspaceForUser(workspaceId, req.user.sub)

    const credentials = await prisma.credential.findMany({
      where: { workspaceId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    })

    res.json({ success: true, data: credentials })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/v1/workspaces/:workspaceId/credentials ────────────────────────

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId } = req.params
    await getWorkspaceForUser(workspaceId, req.user.sub)

    const body = createCredentialSchema.parse(req.body)
    // Pass the plaintext to Prisma — the encryption middleware in packages/db
    // automatically encrypts it and adds the "enc:" prefix before storing.
    const encryptedValue = serializeValue(body.type, body.value)

    const credential = await prisma.credential.create({
      data: {
        workspaceId,
        name: body.name,
        type: body.type,
        encryptedValue,
      },
      select: SAFE_SELECT,
    })

    res.status(201).json({ success: true, data: credential } satisfies ApiResponse<typeof credential>)
  } catch (err) {
    next(err)
  }
})

// ─── DELETE /api/v1/workspaces/:workspaceId/credentials/:credentialId ─────────

router.delete('/:credentialId', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId, credentialId } = req.params
    await getWorkspaceForUser(workspaceId, req.user.sub)

    const credential = await prisma.credential.findFirst({
      where: { id: credentialId, workspaceId },
    })
    if (!credential) throw AppError.notFound('Credential')

    await prisma.credential.delete({ where: { id: credentialId } })

    res.json({ success: true, data: { deleted: true } } satisfies ApiResponse<{ deleted: boolean }>)
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/v1/workspaces/:workspaceId/credentials/:credentialId/test ──────
//
// Decrypts the credential and fires a GET request to the provided URL.
// Returns success/failure without ever exposing the decrypted value.

router.post('/:credentialId/test', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId, credentialId } = req.params
    await getWorkspaceForUser(workspaceId, req.user.sub)

    const { url } = testCredentialSchema.parse(req.body)

    const credential = await prisma.credential.findFirst({
      where: { id: credentialId, workspaceId },
    })
    if (!credential) throw AppError.notFound('Credential')

    const masterKey = getMasterKey()
    const plaintext = decrypt(credential.encryptedValue, masterKey)
    const { header, value } = buildAuthHeader(credential.type, plaintext)

    const startMs = Date.now()
    let success = false
    let statusCode: number | null = null
    let errorMessage: string | null = null

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { [header]: value },
        signal: AbortSignal.timeout(10_000), // 10s timeout
      })
      statusCode = response.status
      // Treat 2xx and 3xx as success — the credential was accepted
      success = response.status < 400
      if (!success) {
        errorMessage = `HTTP ${response.status} ${response.statusText}`
      }
    } catch (fetchErr) {
      errorMessage =
        fetchErr instanceof Error ? fetchErr.message : 'Network error'
    }

    res.json({
      success: true,
      data: {
        ok: success,
        statusCode,
        latencyMs: Date.now() - startMs,
        error: errorMessage,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
