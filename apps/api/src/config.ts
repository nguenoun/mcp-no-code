import { z } from 'zod'

// ─── Environment schema ───────────────────────────────────────────────────────

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'ENCRYPTION_KEY must be exactly 64 hex characters (256-bit AES key)',
    ),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
})

// ─── Validation (runs once at import time) ───────────────────────────────────

function validateEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
      .join('\n')
    console.error(
      `\n[Config] Cannot start — missing or invalid environment variables:\n${messages}\n`,
    )
    process.exit(1)
  }
  return result.data
}

export const config = validateEnv()
export type Config = typeof config
