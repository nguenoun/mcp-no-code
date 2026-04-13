import { redis } from './redis'
import { ERROR_CODES } from '@mcpbuilder/shared'
import { AppError } from './errors'

/**
 * Sliding-window rate limiter backed by Redis INCR + EXPIRE.
 *
 * @param key         Redis key (should be unique per resource + window)
 * @param limit       Max allowed calls within the window
 * @param windowSecs  Window duration in seconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSecs: number,
): Promise<void> {
  const count = await redis.incr(key)
  // Set expiry only on the first increment to avoid resetting the window
  if (count === 1) {
    await redis.expire(key, windowSecs)
  }
  if (count > limit) {
    const ttl = await redis.ttl(key)
    throw new AppError(
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded. Try again in ${ttl} second${ttl === 1 ? '' : 's'}.`,
      429,
    )
  }
}

export function importRateLimitKey(workspaceId: string): string {
  const hour = Math.floor(Date.now() / (1000 * 60 * 60))
  return `rate:import:${workspaceId}:${hour}`
}
