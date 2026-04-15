/**
 * Security tests
 *
 * These tests verify four security properties:
 *  1. Cross-workspace isolation — a user cannot access another workspace's server
 *  2. MCP endpoint rejects invalid API keys with 401
 *  3. encrypt → decrypt round-trips correctly for all credential types
 *  4. IP rate limiter blocks requests once the threshold is exceeded
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@mcpbuilder/db', () => ({
  prisma: {
    mcpServer: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    workspace: {
      findFirst: vi.fn(),
    },
    credential: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('../lib/redis', () => ({
  redis: {
    incr: vi.fn(),
    expire: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    pipeline: vi.fn().mockReturnValue({
      rpush: vi.fn().mockReturnThis(),
      ltrim: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
  },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@mcpbuilder/db'
import { redis } from '../lib/redis'
import { requireOwnership, ipRateLimiter, sanitizeInput } from '../middleware/security'
import { mcpAuthMiddleware } from '../middleware/mcp-auth'
import { AppError } from '../lib/errors'
import { encrypt, decrypt } from '@mcpbuilder/mcp-runtime'

// ─── Test helpers ─────────────────────────────────────────────────────────────

const TEST_KEY = 'a'.repeat(64) // 64-char hex = 256-bit AES key

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: {},
    params: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    path: '/',
    body: undefined,
    ...overrides,
  } as unknown as Request
}

function mockRes(): Response & {
  status: ReturnType<typeof vi.fn>
  json: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
} {
  const res = {
    statusCode: 200,
    status: vi.fn(),
    json: vi.fn(),
    set: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as ReturnType<typeof mockRes>
  // chain: .status(n).json(...) and .status(n).end()
  ;(res.status as ReturnType<typeof vi.fn>).mockImplementation((code: number) => {
    res.statusCode = code
    return res
  })
  ;(res.json as ReturnType<typeof vi.fn>).mockReturnValue(res)
  ;(res.set as ReturnType<typeof vi.fn>).mockReturnValue(res)
  ;(res.end as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

// ─── 1. Cross-workspace isolation ─────────────────────────────────────────────

describe('requireOwnership("server")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes next(err=403) when the server does not belong to the user', async () => {
    vi.mocked(prisma.mcpServer.findFirst).mockResolvedValue(null)

    const req = mockReq({ params: { serverId: 'srv-other' }, user: { sub: 'user-1' } })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await requireOwnership('server')(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).statusCode).toBe(403)
  })

  it('calls next() without error when the server belongs to the user', async () => {
    vi.mocked(prisma.mcpServer.findFirst).mockResolvedValue({ id: 'srv-1' } as never)

    const req = mockReq({ params: { serverId: 'srv-1' }, user: { sub: 'user-1' } })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await requireOwnership('server')(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0]!).toHaveLength(0) // no args = success
  })

  it('passes next(err=403) when the workspace does not belong to the user', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null)

    const req = mockReq({ params: { workspaceId: 'ws-other' }, user: { sub: 'user-1' } })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await requireOwnership('workspace')(req, res, next)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect((err as AppError).statusCode).toBe(403)
  })
})

// ─── 2. MCP endpoint auth ─────────────────────────────────────────────────────

describe('mcpAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(redis.get).mockResolvedValue(null) // always cache-miss by default
  })

  it('returns 401 when Authorization header is missing', async () => {
    const req = mockReq({ params: { serverId: 'srv-1' }, method: 'POST' })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await mcpAuthMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 for an invalid API key (not in DB)', async () => {
    vi.mocked(prisma.mcpServer.findUnique).mockResolvedValue(null)

    const req = mockReq({
      headers: { authorization: 'Bearer mcp_invalid_key' },
      params: { serverId: 'srv-1' },
      method: 'GET',
    })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await mcpAuthMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 401 when the API key belongs to a different server', async () => {
    vi.mocked(prisma.mcpServer.findUnique).mockResolvedValue({
      id: 'srv-2',
      status: 'RUNNING',
    } as never)

    const req = mockReq({
      headers: { authorization: 'Bearer mcp_valid_key' },
      params: { serverId: 'srv-1' }, // mismatch: key is for srv-2
      method: 'GET',
    })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await mcpAuthMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('calls next() for a valid API key matching the server', async () => {
    vi.mocked(prisma.mcpServer.findUnique).mockResolvedValue({
      id: 'srv-1',
      status: 'RUNNING',
    } as never)

    const req = mockReq({
      headers: { authorization: 'Bearer mcp_valid_key' },
      params: { serverId: 'srv-1' },
      method: 'GET',
    })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await mcpAuthMiddleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(0)
  })

  it('uses the Redis cache and skips DB lookup on cache hit', async () => {
    vi.mocked(redis.get).mockResolvedValue(
      JSON.stringify({ serverId: 'srv-1', status: 'RUNNING' }),
    )

    const req = mockReq({
      headers: { authorization: 'Bearer mcp_cached_key' },
      params: { serverId: 'srv-1' },
      method: 'GET',
    })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await mcpAuthMiddleware(req, res, next)

    expect(prisma.mcpServer.findUnique).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})

// ─── 3. Encrypt / decrypt round-trip ─────────────────────────────────────────

describe('encrypt + decrypt', () => {
  beforeEach(() => {
    process.env['ENCRYPTION_KEY'] = TEST_KEY
  })

  it('round-trips a plain string', () => {
    expect(decrypt(encrypt('hello', TEST_KEY), TEST_KEY)).toBe('hello')
  })

  it('round-trips a JSON credential (BASIC_AUTH)', () => {
    const payload = JSON.stringify({ username: 'alice', password: 's3cr3t!' })
    expect(decrypt(encrypt(payload, TEST_KEY), TEST_KEY)).toBe(payload)
  })

  it('round-trips a Bearer token', () => {
    const token = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig'
    expect(decrypt(encrypt(token, TEST_KEY), TEST_KEY)).toBe(token)
  })

  it('strips the "enc:" prefix transparently before decrypting', () => {
    const ciphertext = encrypt('secret-value', TEST_KEY)
    const withPrefix = `enc:${ciphertext}`
    // decrypt must handle both prefixed and plain base64
    expect(decrypt(withPrefix, TEST_KEY)).toBe('secret-value')
  })

  it('throws when decrypting with the wrong key', () => {
    const enc = encrypt('secret', TEST_KEY)
    expect(() => decrypt(enc, 'b'.repeat(64))).toThrow()
  })

  it('produces a different ciphertext on each call (random IV)', () => {
    const enc1 = encrypt('same', TEST_KEY)
    const enc2 = encrypt('same', TEST_KEY)
    expect(enc1).not.toBe(enc2)
  })
})

// ─── 4. IP rate limiter ───────────────────────────────────────────────────────

describe('ipRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(redis.expire).mockResolvedValue(1 as never)
  })

  it('calls next() when the request count is within the limit', async () => {
    vi.mocked(redis.incr).mockResolvedValue(50) // well within 100 req/min

    const req = mockReq({ ip: '1.2.3.4' })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await ipRateLimiter(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(0)
  })

  it('returns 429 and sets Retry-After when the limit is exceeded', async () => {
    vi.mocked(redis.incr).mockResolvedValue(101) // over the 100 req/min limit

    const req = mockReq({ ip: '1.2.3.4' })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await ipRateLimiter(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.set).toHaveBeenCalledWith('Retry-After', '60')
    expect(next).not.toHaveBeenCalled()
  })

  it('fails open (calls next) when Redis is unavailable', async () => {
    vi.mocked(redis.incr).mockRejectedValue(new Error('Redis connection lost'))

    const req = mockReq({ ip: '1.2.3.4' })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await ipRateLimiter(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })
})

// ─── 5. Input sanitization ────────────────────────────────────────────────────

describe('sanitizeInput', () => {
  it('strips ASCII control characters from string fields', () => {
    const req = mockReq({ body: { name: 'hello\x00world\x1F', description: 'ok' } })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    sanitizeInput(req, res, next)

    expect((req.body as Record<string, string>)['name']).toBe('helloworld')
    expect((req.body as Record<string, string>)['description']).toBe('ok')
    expect(next).toHaveBeenCalledOnce()
  })

  it('preserves legitimate whitespace (\\t, \\n, \\r)', () => {
    const req = mockReq({ body: { text: 'line1\nline2\ttabbed\r\n' } })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    sanitizeInput(req, res, next)

    expect((req.body as Record<string, string>)['text']).toBe('line1\nline2\ttabbed\r\n')
  })

  it('sanitizes nested objects and arrays', () => {
    const req = mockReq({
      body: { headers: [{ key: 'X-Foo\x08', value: 'bar' }] },
    })
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    sanitizeInput(req, res, next)

    const headers = (req.body as { headers: { key: string }[] })['headers']
    expect(headers[0]?.key).toBe('X-Foo')
  })
})
