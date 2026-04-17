import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import type { ApiResponse } from '@mcpbuilder/shared'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'
import { generateClientId, generateClientSecret, hashClientSecret, isValidRedirectUri } from '../lib/oauth-client'

const router = Router({ mergeParams: true })

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createOAuthAppSchema = z.object({
  name: z.string().min(1).max(100),
  redirectUris: z.array(z.string().url()).min(1).max(10),
})

const authModeSchema = z.object({
  mode: z.enum(['API_KEY', 'OAUTH']),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getServerForUser(serverId: string, userId: string) {
  const server = await prisma.mcpServer.findFirst({
    where: { id: serverId, workspace: { userId } },
  })
  if (!server) throw AppError.notFound('Server')
  return server
}

// ─── B1. POST /api/v1/servers/:serverId/oauth/apps ────────────────────────────
//
// Crée une nouvelle OAuth App. Génère clientId + clientSecret (affiché une seule
// fois). Stocke clientSecretHash. Valide que les redirectUris sont des URLs HTTPS.

router.post('/oauth/apps', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    await getServerForUser(serverId!, req.user.sub)

    const parsed = createOAuthAppSchema.safeParse(req.body)
    if (!parsed.success) {
      throw AppError.validation('Invalid request body', parsed.error.flatten())
    }
    const { name, redirectUris } = parsed.data

    const invalidUris = redirectUris.filter((uri) => !isValidRedirectUri(uri))
    if (invalidUris.length > 0) {
      throw AppError.validation('Invalid redirect URIs — HTTPS required (except localhost)', {
        invalidUris,
      })
    }

    const clientId = generateClientId()
    const clientSecret = generateClientSecret()
    const clientSecretHash = await hashClientSecret(clientSecret)

    const app = await prisma.oAuthApp.create({
      data: {
        mcpServerId: serverId!,
        name,
        clientId,
        clientSecretHash,
        redirectUris,
      },
      select: {
        id: true,
        mcpServerId: true,
        name: true,
        clientId: true,
        redirectUris: true,
        createdAt: true,
      },
    })

    const response: ApiResponse<typeof app & { clientSecret: string }> = {
      success: true,
      data: { ...app, clientSecret },
    }
    res.status(201).json(response)
  } catch (err) {
    next(err)
  }
})

// ─── B2. GET /api/v1/servers/:serverId/oauth/apps ─────────────────────────────
//
// Liste les apps enregistrées avec le nombre de tokens actifs. Jamais de hash.

router.get('/oauth/apps', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    await getServerForUser(serverId!, req.user.sub)

    const now = new Date()
    const apps = await prisma.oAuthApp.findMany({
      where: { mcpServerId: serverId! },
      select: {
        id: true,
        mcpServerId: true,
        name: true,
        clientId: true,
        redirectUris: true,
        createdAt: true,
        tokens: {
          where: { revokedAt: null, expiresAt: { gt: now } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = apps.map(({ tokens, ...app }) => ({
      ...app,
      activeTokenCount: tokens.length,
    }))

    const response: ApiResponse<typeof data> = { success: true, data }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// ─── B3. DELETE /api/v1/servers/:serverId/oauth/apps/:appId ──────────────────
//
// Révoque d'abord tous les tokens associés (revokedAt = now), puis supprime l'app
// (la cascade DB supprime les lignes tokens).

router.delete('/oauth/apps/:appId', authMiddleware, async (req, res, next) => {
  try {
    const { serverId, appId } = req.params
    await getServerForUser(serverId!, req.user.sub)

    const app = await prisma.oAuthApp.findFirst({
      where: { id: appId!, mcpServerId: serverId! },
    })
    if (!app) throw AppError.notFound('OAuth App')

    // Révocation explicite avant suppression (cohérence métier / audit)
    await prisma.oAuthToken.updateMany({
      where: { clientId: appId!, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await prisma.oAuthApp.delete({ where: { id: appId! } })

    const response: ApiResponse<{ deleted: true }> = {
      success: true,
      data: { deleted: true },
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// ─── B4. GET /api/v1/servers/:serverId/oauth/sessions ────────────────────────
//
// Liste les tokens actifs (non révoqués, non expirés).
// Retourne : userId, email, appName, scopes, createdAt, expiresAt.

router.get('/oauth/sessions', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    await getServerForUser(serverId!, req.user.sub)

    const now = new Date()
    const tokens = await prisma.oAuthToken.findMany({
      where: {
        mcpServerId: serverId!,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        scopes: true,
        createdAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = tokens.map((t) => ({
      id: t.id,
      userId: t.user.id,
      email: t.user.email,
      appName: t.client.name,
      scopes: t.scopes,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
    }))

    const response: ApiResponse<typeof data> = { success: true, data }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// ─── B5. DELETE /api/v1/servers/:serverId/oauth/sessions/:tokenId ─────────────
//
// Révoque un token spécifique (access + refresh token sur la même ligne).

router.delete('/oauth/sessions/:tokenId', authMiddleware, async (req, res, next) => {
  try {
    const { serverId, tokenId } = req.params
    await getServerForUser(serverId!, req.user.sub)

    const token = await prisma.oAuthToken.findFirst({
      where: { id: tokenId!, mcpServerId: serverId!, revokedAt: null },
    })
    if (!token) throw AppError.notFound('Session')

    await prisma.oAuthToken.update({
      where: { id: tokenId! },
      data: { revokedAt: new Date() },
    })

    const response: ApiResponse<{ revoked: true }> = {
      success: true,
      data: { revoked: true },
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// ─── B6. PUT /api/v1/servers/:serverId/auth-mode ─────────────────────────────
//
// Change le mode d'auth. Si passage en API_KEY : révoque tous les tokens OAuth
// actifs. Si OAUTH : aucune action sur les tokens existants.

router.put('/auth-mode', authMiddleware, async (req, res, next) => {
  try {
    const { serverId } = req.params
    await getServerForUser(serverId!, req.user.sub)

    const parsed = authModeSchema.safeParse(req.body)
    if (!parsed.success) {
      throw AppError.validation('Invalid request body', parsed.error.flatten())
    }
    const { mode } = parsed.data

    const server = await prisma.mcpServer.update({
      where: { id: serverId! },
      data: { authMode: mode },
      select: { id: true, authMode: true },
    })

    if (mode === 'API_KEY') {
      await prisma.oAuthToken.updateMany({
        where: { mcpServerId: serverId!, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }

    const response: ApiResponse<typeof server> = { success: true, data: server }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

export default router
