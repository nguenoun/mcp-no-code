import jwt from 'jsonwebtoken'
import type { AuthTokenPayload } from '@mcpbuilder/shared'

const jwtSecret = process.env['JWT_SECRET']
if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required')

const ACCESS_TOKEN_EXPIRES = '1h'
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const REFRESH_TOKEN_PREFIX = 'refresh:'

export function signAccessToken(
  payload: Omit<AuthTokenPayload, 'iat' | 'exp'>,
): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRES })
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, jwtSecret) as AuthTokenPayload
}

export function refreshTokenRedisKey(token: string): string {
  return `${REFRESH_TOKEN_PREFIX}${token}`
}
