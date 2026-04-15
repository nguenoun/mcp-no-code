import { Prisma } from '@prisma/client'
import { createCipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
export const ENC_PREFIX = 'enc:'

function getMasterKey(): Buffer {
  const key = process.env['ENCRYPTION_KEY']
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
  }
  return Buffer.from(key, 'hex')
}

function encryptValue(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function computeMaskedValue(encryptedValue: string): string {
  const raw = encryptedValue.startsWith(ENC_PREFIX)
    ? encryptedValue.slice(ENC_PREFIX.length)
    : encryptedValue
  return `****${raw.slice(-4)}`
}

const WRITE_ACTIONS = new Set(['create', 'update', 'upsert', 'createMany', 'updateMany'])

export const encryptionExtension = Prisma.defineExtension({
  name: 'encryption',
  query: {
    credential: {
      async $allOperations({ operation, args, query }) {
        // ── Write: auto-encrypt encryptedValue ──────────────────────────
        if (WRITE_ACTIONS.has(operation)) {
          const data = (args as Record<string, unknown>)?.data as
            | Record<string, unknown>
            | undefined
          if (data && typeof data['encryptedValue'] === 'string') {
            const raw = data['encryptedValue'] as string
            if (!raw.startsWith(ENC_PREFIX)) {
              data['encryptedValue'] = encryptValue(raw)
            }
          }
        }

        const result = await query(args)

        // ── Read: inject maskedValue virtual field ───────────────────────
        if (result !== null && result !== undefined) {
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
    },
  },
})