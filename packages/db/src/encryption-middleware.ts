import { type PrismaClient, type Prisma } from '@prisma/client'
import { createCipheriv, randomBytes } from 'crypto'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
/** Prefix that marks values encrypted by this middleware */
export const ENC_PREFIX = 'enc:'

// ─── Crypto helpers (inlined to keep packages/db dependency-free) ─────────────

function getMasterKey(): string {
  const key = process.env['ENCRYPTION_KEY']
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  return key
}

function encryptValue(plaintext: string): string {
  const keyBuf = Buffer.from(getMasterKey(), 'hex')
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, keyBuf, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64')
}

/** Returns "****{last 4 chars of the stored encrypted blob}" */
function computeMaskedValue(encryptedValue: string): string {
  const raw = encryptedValue.startsWith(ENC_PREFIX)
    ? encryptedValue.slice(ENC_PREFIX.length)
    : encryptedValue
  return `****${raw.slice(-4)}`
}

// ─── Middleware ───────────────────────────────────────────────────────────────

const WRITE_ACTIONS = new Set(['create', 'update', 'upsert', 'createMany', 'updateMany'])

/**
 * Applies a Prisma middleware that:
 *  1. Auto-encrypts `Credential.encryptedValue` on writes (unless already prefixed with "enc:").
 *  2. Adds a virtual `maskedValue` field to every Credential read result.
 *
 * Call this once on the PrismaClient singleton before the first query.
 */
export function applyEncryptionMiddleware(prisma: PrismaClient): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(prisma as any).$use(
    async (params: Prisma.MiddlewareParams, next: (p: Prisma.MiddlewareParams) => Promise<unknown>) => {
      // ── Write path: auto-encrypt encryptedValue ──────────────────────────
      if (params.model === 'Credential' && WRITE_ACTIONS.has(params.action)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (params.args as Record<string, any>)?.data as Record<string, unknown> | undefined
        if (data && typeof data['encryptedValue'] === 'string') {
          const raw = data['encryptedValue'] as string
          if (!raw.startsWith(ENC_PREFIX)) {
            data['encryptedValue'] = encryptValue(raw)
          }
        }
      }

      const result = await next(params)

      // ── Read path: add maskedValue virtual field ──────────────────────────
      if (params.model === 'Credential' && result !== null && result !== undefined) {
        const addMasked = (record: unknown): unknown => {
          if (!record || typeof record !== 'object') return record
          const r = record as Record<string, unknown>
          if (typeof r['encryptedValue'] === 'string') {
            r['maskedValue'] = computeMaskedValue(r['encryptedValue'])
          }
          return r
        }
        if (Array.isArray(result)) return result.map(addMasked)
        return addMasked(result)
      }

      return result
    },
  )
}
