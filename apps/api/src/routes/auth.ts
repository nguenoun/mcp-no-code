import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '@mcpbuilder/db'
import { MIN_PASSWORD_LENGTH } from '@mcpbuilder/shared'
import type { ApiResponse } from '@mcpbuilder/shared'
import {
  signAccessToken,
  verifyAccessToken,
  refreshTokenRedisKey,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../lib/jwt'
import { redis } from '../lib/redis'
import { authMiddleware } from '../middleware/auth'
import { AppError } from '../lib/errors'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  name: z.string().min(1).max(100),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().uuid(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return base || 'workspace'
}

async function issueTokenPair(
  userId: string,
  email: string,
  plan: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ sub: userId, email, plan })
  const refreshToken = randomUUID()
  await redis.set(
    refreshTokenRedisKey(refreshToken),
    userId,
    'EX',
    REFRESH_TOKEN_TTL_SECONDS,
  )
  return { accessToken, refreshToken }
}

// ─── POST /register ───────────────────────────────────────────────────────────

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) throw AppError.conflict('An account with this email already exists')

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email, name, passwordHash },
      })
      const slug = `${buildSlug(name)}-${newUser.id.slice(-6)}`
      await tx.workspace.create({
        data: {
          name: `${name}'s workspace`,
          slug,
          userId: newUser.id,
        },
      })
      return newUser
    })

    const tokens = await issueTokenPair(user.id, user.email, user.plan)

    res.status(201).json({ success: true, data: tokens } satisfies ApiResponse<typeof tokens>)
  } catch (err) {
    next(err)
  }
})

// ─── POST /login ──────────────────────────────────────────────────────────────

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })
    // Constant-time comparison regardless of whether user/hash exists
    const passwordHash = user?.passwordHash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000'
    const valid = await bcrypt.compare(password, passwordHash)

    if (!user || !user.passwordHash || !valid) {
      throw AppError.unauthorized('Invalid email or password')
    }

    const tokens = await issueTokenPair(user.id, user.email, user.plan)

    res.json({ success: true, data: tokens } satisfies ApiResponse<typeof tokens>)
  } catch (err) {
    next(err)
  }
})

// ─── POST /refresh ────────────────────────────────────────────────────────────

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body)

    const userId = await redis.get(refreshTokenRedisKey(refreshToken))
    if (!userId) throw AppError.unauthorized('Invalid or expired refresh token')

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw AppError.unauthorized('User not found')

    const accessToken = signAccessToken({ sub: user.id, email: user.email, plan: user.plan })

    res.json({ success: true, data: { accessToken } } satisfies ApiResponse<{ accessToken: string }>)
  } catch (err) {
    next(err)
  }
})

// ─── POST /logout ─────────────────────────────────────────────────────────────

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body)
    await redis.del(refreshTokenRedisKey(refreshToken))
    res.json({ success: true, data: null } satisfies ApiResponse<null>)
  } catch (err) {
    next(err)
  }
})

// ─── GET /me ──────────────────────────────────────────────────────────────────

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        googleId: true,
        plan: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!user) throw AppError.notFound('User')

    res.json({ success: true, data: user } satisfies ApiResponse<typeof user>)
  } catch (err) {
    next(err)
  }
})

export default router
