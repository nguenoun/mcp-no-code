/**
 * OAuth 2.0 Authorization Server endpoints — montés sur /mcp/:serverId
 *
 * C1  GET  /:serverId/.well-known/oauth-authorization-server  — metadata RFC 8414
 * C2  GET  /:serverId/authorize                               — validation + redirect consent
 * C4  POST /:serverId/token  grant=authorization_code         — échange code → tokens
 * C5  POST /:serverId/token  grant=refresh_token              — rotation refresh token
 * C6  POST /:serverId/revoke                                  — révocation RFC 7009
 *
 * Ces routes sont enregistrées AVANT le proxy mcpAuthMiddleware dans app.ts.
 * Elles n'utilisent pas authMiddleware (dashboard JWT) — auth via client_id/secret.
 */

import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import { matchesRegisteredUri, verifyClientSecret } from '../lib/oauth-client'
import {
  signOAuthAccessToken,
  generateJti,
  generateRefreshToken,
  refreshTokenExpiresAt,
  ACCESS_TOKEN_TTL,
} from '../lib/oauth-jwt'
import { verifyCodeChallenge } from '../lib/pkce'

const router = Router({ mergeParams: true })

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Erreur OAuth standard (RFC 6749 §5.2). */
function oauthError(
  res: import('express').Response,
  status: number,
  error: string,
  description: string,
) {
  res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache')
  return res.status(status).json({ error, error_description: description })
}

/**
 * Vérifie client_id + client_secret pour un serveur donné.
 * Retourne l'OAuthApp si valide, null sinon.
 */
async function verifyClient(clientId: string, clientSecret: string, mcpServerId: string) {
  const app = await prisma.oAuthApp.findFirst({
    where: { clientId, mcpServerId },
  })
  if (!app) return null
  const ok = await verifyClientSecret(clientSecret, app.clientSecretHash)
  return ok ? app : null
}

// ─── C1. GET /:serverId/.well-known/oauth-authorization-server ────────────────
//
// Metadata RFC 8414. Accessible sans auth. Indépendant du authMode du serveur.

router.get('/:serverId/.well-known/oauth-authorization-server', (req, res) => {
  const { serverId } = req.params
  const apiBase = process.env['API_URL'] ?? `${req.protocol}://${req.get('host')}`
  const issuer = `${apiBase}/mcp/${serverId}`

  res.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    revocation_endpoint: `${issuer}/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
  })
})

// ─── C2. GET /:serverId/authorize ────────────────────────────────────────────
//
// Valide les query params OAuth. Si valide → redirect vers la page de consentement
// frontend (/app/oauth/authorize). Ne crée pas encore le code.

const authorizeQuerySchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.literal('code'),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  scope: z.string().default(''),
  state: z.string().default(''),
})

router.get('/:serverId/authorize', async (req, res, next) => {
  try {
    const { serverId } = req.params

    const parsed = authorizeQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      oauthError(res, 400, 'invalid_request', 'Missing or invalid query parameters')
      return
    }

    const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method, scope, state } =
      parsed.data

    const app = await prisma.oAuthApp.findFirst({
      where: { clientId: client_id, mcpServerId: serverId! },
    })
    if (!app) {
      oauthError(res, 400, 'invalid_client', 'Unknown client_id for this server')
      return
    }

    if (!matchesRegisteredUri(redirect_uri, app.redirectUris)) {
      // RFC 6749 §4.1.2.1 — do NOT redirect if redirect_uri is invalid
      oauthError(res, 400, 'invalid_request', 'redirect_uri not registered for this client')
      return
    }

    const webUrl = process.env['WEB_URL'] ?? 'http://localhost:3000'
    const params = new URLSearchParams({
      server_id: serverId!,
      client_id,
      redirect_uri,
      response_type,
      code_challenge,
      code_challenge_method,
      scope,
      state,
    })

    res.redirect(`${webUrl}/app/oauth/authorize?${params.toString()}`)
  } catch (err) {
    next(err)
  }
})

// ─── C4 / C5. POST /:serverId/token ──────────────────────────────────────────
//
// Dispatch sur grant_type. Toujours Cache-Control: no-store (RFC 6749 §5.1).

const tokenBodySchema = z.object({
  grant_type: z.enum(['authorization_code', 'refresh_token']),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  // authorization_code
  code: z.string().optional(),
  redirect_uri: z.string().optional(),
  code_verifier: z.string().optional(),
  // refresh_token
  refresh_token: z.string().optional(),
})

router.post('/:serverId/token', async (req, res, next) => {
  try {
    const { serverId } = req.params
    res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache')

    const parsed = tokenBodySchema.safeParse(req.body)
    if (!parsed.success) {
      oauthError(res, 400, 'invalid_request', 'Missing or invalid parameters')
      return
    }
    const body = parsed.data

    const app = await verifyClient(body.client_id, body.client_secret, serverId!)
    if (!app) {
      oauthError(res, 401, 'invalid_client', 'Invalid client credentials')
      return
    }

    // ── Grant: authorization_code (C4) ────────────────────────────────────────
    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.redirect_uri || !body.code_verifier) {
        oauthError(res, 400, 'invalid_request', 'code, redirect_uri and code_verifier are required')
        return
      }

      const authCode = await prisma.oAuthCode.findFirst({
        where: { code: body.code, mcpServerId: serverId! },
        include: { user: { select: { id: true, email: true } } },
      })

      if (!authCode) {
        oauthError(res, 400, 'invalid_grant', 'Authorization code not found')
        return
      }
      if (authCode.usedAt !== null) {
        oauthError(res, 400, 'invalid_grant', 'Authorization code already used')
        return
      }
      if (authCode.expiresAt < new Date()) {
        oauthError(res, 400, 'invalid_grant', 'Authorization code expired')
        return
      }
      // Vérifie que le code appartient bien à ce client (app.id = OAuthApp PK)
      if (authCode.clientId !== app.id) {
        oauthError(res, 400, 'invalid_grant', 'Authorization code was not issued to this client')
        return
      }
      if (authCode.redirectUri !== body.redirect_uri) {
        oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch')
        return
      }
      if (!verifyCodeChallenge(body.code_verifier, authCode.codeChallenge)) {
        oauthError(res, 400, 'invalid_grant', 'PKCE verification failed')
        return
      }

      // Prépare les valeurs du token avant la transaction
      const jti = generateJti()
      const refreshToken = generateRefreshToken()
      const expiresAt = refreshTokenExpiresAt() // durée de vie du refresh token (30j)
      const accessToken = signOAuthAccessToken({
        sub: authCode.user.id,
        sid: serverId!,
        cid: app.clientId,
        email: authCode.user.email,
        scopes: authCode.scopes,
        jti,
      })

      // Marque le code utilisé + crée le token (atomique)
      await prisma.$transaction([
        prisma.oAuthCode.update({
          where: { id: authCode.id },
          data: { usedAt: new Date() },
        }),
        prisma.oAuthToken.create({
          data: {
            jti,
            accessToken,
            refreshToken,
            userId: authCode.user.id,
            clientId: app.id,
            mcpServerId: serverId!,
            scopes: authCode.scopes,
            expiresAt,
          },
        }),
      ])

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL,
        refresh_token: refreshToken,
        scope: authCode.scopes.join(' '),
      })
      return
    }

    // ── Grant: refresh_token (C5) ─────────────────────────────────────────────
    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token) {
        oauthError(res, 400, 'invalid_request', 'refresh_token is required')
        return
      }

      const oldToken = await prisma.oAuthToken.findFirst({
        where: {
          refreshToken: body.refresh_token,
          mcpServerId: serverId!,
          revokedAt: null,
        },
        include: { user: { select: { id: true, email: true } } },
      })

      if (!oldToken) {
        oauthError(res, 400, 'invalid_grant', 'Refresh token not found or already revoked')
        return
      }
      if (oldToken.clientId !== app.id) {
        oauthError(res, 400, 'invalid_grant', 'Token was not issued to this client')
        return
      }

      // Rotation : prépare les nouvelles valeurs
      const jti = generateJti()
      const newRefreshToken = generateRefreshToken()
      const expiresAt = refreshTokenExpiresAt()
      const accessToken = signOAuthAccessToken({
        sub: oldToken.user.id,
        sid: serverId!,
        cid: app.clientId,
        email: oldToken.user.email,
        scopes: oldToken.scopes,
        jti,
      })

      // Révoque l'ancien + crée le nouveau (atomique)
      await prisma.$transaction([
        prisma.oAuthToken.update({
          where: { id: oldToken.id },
          data: { revokedAt: new Date() },
        }),
        prisma.oAuthToken.create({
          data: {
            jti,
            accessToken,
            refreshToken: newRefreshToken,
            userId: oldToken.user.id,
            clientId: app.id,
            mcpServerId: serverId!,
            scopes: oldToken.scopes,
            expiresAt,
          },
        }),
      ])

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL,
        refresh_token: newRefreshToken,
        scope: oldToken.scopes.join(' '),
      })
      return
    }
  } catch (err) {
    next(err)
  }
})

// ─── C6. POST /:serverId/revoke ───────────────────────────────────────────────
//
// RFC 7009 : retourne toujours 200, même si le token est inconnu ou déjà révoqué.
// Vérifie quand même les credentials client pour éviter la révocation abusive.

const revokeBodySchema = z.object({
  token: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
})

router.post('/:serverId/revoke', async (req, res, next) => {
  try {
    const { serverId } = req.params
    res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache')

    const parsed = revokeBodySchema.safeParse(req.body)
    if (!parsed.success) {
      // RFC 7009 §2.2 : retourne 200 même en cas d'erreur de paramètre mineure,
      // mais ici les credentials sont obligatoires pour éviter la révocation abusive.
      oauthError(res, 400, 'invalid_request', 'token, client_id and client_secret are required')
      return
    }
    const { token, client_id, client_secret } = parsed.data

    const app = await verifyClient(client_id, client_secret, serverId!)
    if (!app) {
      oauthError(res, 401, 'invalid_client', 'Invalid client credentials')
      return
    }

    // Cherche par access_token OU refresh_token
    const record = await prisma.oAuthToken.findFirst({
      where: {
        OR: [{ accessToken: token }, { refreshToken: token }],
        clientId: app.id,
        revokedAt: null,
      },
    })

    if (record) {
      await prisma.oAuthToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      })
    }

    // RFC 7009 §2.2 : toujours 200
    res.status(200).json({})
  } catch (err) {
    next(err)
  }
})

export default router
