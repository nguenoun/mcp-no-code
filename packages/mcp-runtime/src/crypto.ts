import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12   // 96-bit IV recommended for GCM
const TAG_BYTES = 16  // 128-bit authentication tag

// ─── Master key helper ────────────────────────────────────────────────────────

/**
 * Reads ENCRYPTION_KEY from the environment and validates it.
 * Must be a 64-character hex string (256-bit key).
 * Throws at startup if missing or invalid — fail fast, never silently.
 */
export function getMasterKey(): string {
  const key = process.env['ENCRYPTION_KEY']
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  if (key.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be a 64-character hex string (256 bits), got ${key.length} characters`,
    )
  }
  return key
}

// ─── encrypt ─────────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string with AES-256-GCM.
 *
 * Output format (base64-encoded):
 *   [ IV (12 bytes) | AuthTag (16 bytes) | Ciphertext (variable) ]
 *
 * @param plaintext  - UTF-8 string to encrypt
 * @param masterKey  - 64-char hex string (256-bit key)
 * @returns          base64-encoded encrypted payload
 */
export function encrypt(plaintext: string, masterKey: string): string {
  const keyBuf = Buffer.from(masterKey, 'hex')
  const iv = randomBytes(IV_BYTES)

  const cipher = createCipheriv(ALGORITHM, keyBuf, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

// ─── decrypt ─────────────────────────────────────────────────────────────────

/**
 * Decrypts an AES-256-GCM payload produced by `encrypt`.
 *
 * @param encryptedB64 - base64-encoded payload (IV + Tag + Ciphertext)
 * @param masterKey    - 64-char hex string (256-bit key)
 * @returns            original plaintext string
 * @throws             if the payload is tampered or the key is wrong (GCM auth failure)
 */
export function decrypt(encryptedB64: string, masterKey: string): string {
  // Strip optional "enc:" prefix written by the Prisma encryption middleware
  const raw = encryptedB64.startsWith('enc:') ? encryptedB64.slice(4) : encryptedB64
  const keyBuf = Buffer.from(masterKey, 'hex')
  const buf = Buffer.from(raw, 'base64')

  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Invalid encrypted payload: too short')
  }

  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES)

  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv)
  decipher.setAuthTag(tag)

  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

// ─── generateApiKey ───────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure API key.
 * Format: "mcp_" + 64 hex characters (256 bits of entropy).
 */
export function generateApiKey(): string {
  return 'mcp_' + randomBytes(32).toString('hex')
}
