import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'

// ─── Payload du JWT OAuth access token ────────────────────────────────────────

export interface OAuthTokenPayload {
  /** User ID (cuid) */
  sub: string
  /** MCP Server ID */
  sid: string
  /** OAuth App (client) ID */
  cid: string
  /** User email — transmis au Worker pour le contexte utilisateur */
  email: string
  /** Scopes accordés */
  scopes: string[]
  /** JWT ID — utilisé pour la révocation */
  jti: string
}

// ─── Durées de vie ────────────────────────────────────────────────────────────

const ACCESS_TOKEN_TTL_SECS   = 60 * 60           // 1 heure
const REFRESH_TOKEN_TTL_SECS  = 60 * 60 * 24 * 30 // 30 jours
const REFRESH_TOKEN_BYTES     = 48                 // 384 bits — opaque

// ─── Clé de signature ────────────────────────────────────────────────────────
//
// Séparée de JWT_SECRET (auth principale) pour que les deux systèmes
// puissent tourner avec des clés indépendantes et révocables séparément.

function getSigningKey(): string {
  const key = process.env['OAUTH_SIGNING_KEY']
  if (!key) throw new Error('Missing required env var: OAUTH_SIGNING_KEY')
  return key
}

// ─── sign ─────────────────────────────────────────────────────────────────────

export function signOAuthAccessToken(payload: OAuthTokenPayload): string {
  return jwt.sign(payload, getSigningKey(), {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL_SECS,
  })
}

// ─── verify ───────────────────────────────────────────────────────────────────

export function verifyOAuthAccessToken(token: string): OAuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSigningKey(), { algorithms: ['HS256'] })
    return decoded as OAuthTokenPayload
  } catch {
    return null
  }
}

// ─── Générateurs ─────────────────────────────────────────────────────────────

/** JWT ID unique pour chaque token — sert à la révocation. */
export function generateJti(): string {
  return randomBytes(20).toString('hex')
}

/** Refresh token opaque (non-JWT) — stocké en base. */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
}

/** Date d'expiration de l'access token. */
export function accessTokenExpiresAt(): Date {
  return new Date(Date.now() + ACCESS_TOKEN_TTL_SECS * 1000)
}

/** Date d'expiration du refresh token. */
export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECS * 1000)
}

/** TTL de l'access token en secondes (pour la réponse OAuth). */
export const ACCESS_TOKEN_TTL = ACCESS_TOKEN_TTL_SECS
