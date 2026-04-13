import 'dotenv/config'
import app from './app'
import { logger } from './lib/logger'

const PORT = Number(process.env['PORT'] ?? 4000)

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env['NODE_ENV'] ?? 'development' }, 'API server started')
})

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down...')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
