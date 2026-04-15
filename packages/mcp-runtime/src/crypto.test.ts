import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt, generateApiKey } from './crypto'

// ─── Test key ─────────────────────────────────────────────────────────────────

// 64-char hex = 32 bytes = 256 bits
const TEST_KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)

// ─── encrypt / decrypt ────────────────────────────────────────────────────────

describe('encrypt + decrypt', () => {
  it('round-trips a simple string', () => {
    const plaintext = 'hello world'
    const enc = encrypt(plaintext, TEST_KEY)
    expect(decrypt(enc, TEST_KEY)).toBe(plaintext)
  })

  it('round-trips an empty string', () => {
    const enc = encrypt('', TEST_KEY)
    expect(decrypt(enc, TEST_KEY)).toBe('')
  })

  it('round-trips a long string', () => {
    const plaintext = 'x'.repeat(10_000)
    expect(decrypt(encrypt(plaintext, TEST_KEY), TEST_KEY)).toBe(plaintext)
  })

  it('round-trips a JSON payload', () => {
    const payload = JSON.stringify({ username: 'alice', password: 'super$ecret!42' })
    expect(decrypt(encrypt(payload, TEST_KEY), TEST_KEY)).toBe(payload)
  })

  it('round-trips a string with unicode characters', () => {
    const plaintext = '🔐 clé secrète: àéîõü'
    expect(decrypt(encrypt(plaintext, TEST_KEY), TEST_KEY)).toBe(plaintext)
  })

  it('produces different ciphertexts for identical plaintexts (random IV)', () => {
    const enc1 = encrypt('same', TEST_KEY)
    const enc2 = encrypt('same', TEST_KEY)
    expect(enc1).not.toBe(enc2)
  })

  it('output is valid base64', () => {
    const enc = encrypt('test', TEST_KEY)
    expect(() => Buffer.from(enc, 'base64')).not.toThrow()
  })

  it('throws when decrypting with the wrong key', () => {
    const enc = encrypt('secret', TEST_KEY)
    expect(() => decrypt(enc, OTHER_KEY)).toThrow()
  })

  it('throws when the payload is truncated', () => {
    const enc = encrypt('secret', TEST_KEY)
    const truncated = enc.slice(0, 10)
    expect(() => decrypt(truncated, TEST_KEY)).toThrow()
  })

  it('throws when the payload is tampered', () => {
    const enc = encrypt('secret', TEST_KEY)
    const buf = Buffer.from(enc, 'base64')
    // Flip the last byte of the ciphertext
    buf[buf.length - 1] ^= 0xff
    expect(() => decrypt(buf.toString('base64'), TEST_KEY)).toThrow()
  })
})

// ─── generateApiKey ───────────────────────────────────────────────────────────

describe('generateApiKey', () => {
  it('starts with "mcp_"', () => {
    expect(generateApiKey()).toMatch(/^mcp_/)
  })

  it('has the right total length (mcp_ + 64 hex chars = 68)', () => {
    expect(generateApiKey()).toHaveLength(68)
  })

  it('only contains valid hex characters after the prefix', () => {
    const key = generateApiKey()
    expect(key.slice(4)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()))
    expect(keys.size).toBe(100)
  })
})
