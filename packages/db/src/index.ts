import { PrismaClient } from '@prisma/client'
import { encryptionExtension } from './encryption-middleware'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  }).$extends(encryptionExtension) as unknown as PrismaClient
  // ↑ Cast needed: $extends changes the TS type but the runtime shape is compatible
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}

export * from '@prisma/client'