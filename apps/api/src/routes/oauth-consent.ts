/**
 * C3. POST /api/v1/oauth/consent
 *
 * Appelée par le frontend après que l'utilisateur a cliqué "Autoriser" ou "Refuser"
 * sur la page de consentement (/app/oauth/authorize).
 *
 * Requiert un dashboard JWT valide (authMiddleware) — c'est l'utilisateur connecté
 * qui consent à l'accès d'une OAuth App à son serveur MCP.
 *
 * Retourne { redirectUrl } que le frontend doit suivre pour renvoyer le code
 * (ou l'erreur) à l'application cliente.
 */

import { Router } from 'express'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '@mcpbuilder/db'
import type { ApiResponse } from '@mcpbuilder/shared'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'
import { matchesRegisteredUri } from '../lib/oauth-client'

const router = Router()

// ─── Schema ───────────────────────────────────────────────────────────────────

const consentBodySchema = z.object({
  serverId: z.string().cuid(),
  clientId: z.string().min(1),  // OAuth client_id string (mcp_cid_...)
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).default([]),
  codeChallenge: z.string().min(43).max(128),
  state: z.string().default(''),
  approved: z.boolean(),
})

// ─── C3. POST /consent ────────────────────────────────────────────────────────

router.post('/consent', authMiddleware, async (req, res, next) => {
  try {
    const parsed = consentBodySchema.safeParse(req.body)
    if (!parsed.success) {
      throw AppError.validation('Invalid request body', parsed.error.flatten())
    }
    const { serverId, clientId, redirectUri, scopes, codeChallenge, state, approved } = parsed.data

    // Vérifie que le serveur appartient bien à l'utilisateur connecté
    const server = await prisma.mcpServer.findFirst({
      where: { id: serverId, workspace: { userId: req.user.sub } },
    })
    if (!server) throw AppError.notFound('Server')

    // Vérifie que l'OAuth App existe pour ce serveur
    const app = await prisma.oAuthApp.findFirst({
      where: { clientId, mcpServerId: serverId },
    })
    if (!app) throw AppError.notFound('OAuth App')

    // Vérifie que redirectUri est enregistrée pour ce client
    if (!matchesRegisteredUri(redirectUri, app.redirectUris)) {
      throw AppError.validation('redirect_uri not registered for this client')
    }

    // Construit l'URL de retour vers le client OAuth
    const redirectUrl = buildRedirectUrl(redirectUri, approved, state, async () => {
      // Crée l'authorization code (TTL 5 min)
      const code = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

      await prisma.oAuthCode.create({
        data: {
          code,
          userId: req.user.sub,
          clientId: app.id,     // FK → OAuthApp.id
          mcpServerId: serverId,
          redirectUri,
          scopes,
          codeChallenge,
          expiresAt,
        },
      })

      return code
    })

    const finalUrl = await redirectUrl

    const response: ApiResponse<{ redirectUrl: string }> = {
      success: true,
      data: { redirectUrl: finalUrl },
    }
    res.json(response)
  } catch (err) {
    next(err)
  }
})

// ─── Helper ───────────────────────────────────────────────────────────────────

async function buildRedirectUrl(
  redirectUri: string,
  approved: boolean,
  state: string,
  createCode: () => Promise<string>,
): Promise<string> {
  const params = new URLSearchParams()

  if (!approved) {
    params.set('error', 'access_denied')
    params.set('error_description', 'The user denied access')
    if (state) params.set('state', state)
    return `${redirectUri}?${params.toString()}`
  }

  const code = await createCode()
  params.set('code', code)
  if (state) params.set('state', state)
  return `${redirectUri}?${params.toString()}`
}

export default router
