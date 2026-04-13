import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { logger } from './lib/logger'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import importRouter from './routes/import'

const app = express()

// ─── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet())
app.use(
  cors({
    origin: process.env['WEB_URL'] ?? 'http://localhost:3000',
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(pinoHttp({ logger }))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/import', importRouter)
// app.use('/api/v1/workspaces', workspacesRouter)
// app.use('/api/v1/servers', serversRouter)

// ─── Error handler (doit être le dernier middleware) ──────────────────────────
app.use(errorHandler)

export default app
