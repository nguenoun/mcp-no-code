import { Redis } from 'ioredis'
import { logger } from './logger'

export const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
})

redis.on('connect', () => logger.info('Redis connected'))
redis.on('ready', () => logger.info('Redis ready'))
redis.on('error', (err: Error) => logger.error({ err }, 'Redis error'))
redis.on('close', () => logger.warn('Redis connection closed'))
