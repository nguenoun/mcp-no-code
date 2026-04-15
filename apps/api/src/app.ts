import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { prisma } from '@mcpbuilder/db'
import { logger } from './lib/logger'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import importRouter from './routes/import'
import toolsRouter from './routes/tools'
import credentialsRouter from './routes/credentials'
import serversRouter from './routes/servers'
import workspaceRouter from './routes/workspace'
import { runtimeManager } from './services/runtime-manager'

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

// ─── MCP proxy ────────────────────────────────────────────────────────────────
//
// External clients connect via:
//   GET  /mcp/{serverId}/sse       → establish SSE connection
//   POST /mcp/{serverId}/messages  → send MCP protocol messages
//
// This middleware:
//   1. Validates the Bearer token against McpServer.apiKey in the DB
//   2. Looks up the internal port from the RuntimeManager
//   3. Proxies the request to the internal Express server
//
// Express body-parsing middleware runs before this, so POST bodies are already
// parsed into req.body — we re-serialise them when forwarding.

app.use('/mcp/:serverId', async (req, res, next) => {
  try {
    // 1. Validate Bearer token
    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      })
      return
    }
    const apiKey = authHeader.slice(7)

    const dbServer = await prisma.mcpServer.findUnique({
      where: { apiKey },
      select: { id: true, status: true },
    })

    if (!dbServer || dbServer.id !== req.params['serverId']) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
      })
      return
    }

    // 2. Resolve internal port
    const port = runtimeManager.getPort(req.params['serverId']!)
    if (!port) {
      res.status(503).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'MCP server is not running' },
      })
      return
    }

    // 3. Build target path (strip /mcp/:serverId prefix, keep rest)
    const targetPath =
      req.path +
      (req.url.includes('?')
        ? req.url.slice(req.url.indexOf('?'))
        : '')

    // 4. Forward request to internal server
    const proxyOptions: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: targetPath || '/',
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${port}`,
      },
    }

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers)
      proxyRes.pipe(res)

      // If the client disconnects (SSE session ends), tear down the proxy request
      res.on('close', () => {
        proxyReq.destroy()
      })
    })

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Bad Gateway', message: err.message })
      }
    })

    // Forward body — Express has already parsed JSON into req.body, so re-serialise
    if (['POST', 'PUT', 'PATCH'].includes(req.method ?? '') && req.body !== undefined) {
      const bodyStr = JSON.stringify(req.body)
      proxyReq.setHeader('Content-Type', 'application/json')
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyStr))
      proxyReq.write(bodyStr)
      proxyReq.end()
    } else {
      proxyReq.end()
    }
  } catch (err) {
    next(err)
  }
})

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/import', importRouter)

// Workspace routes (GET /, GET /:id/stats)
app.use('/api/v1/workspaces', workspaceRouter)

// Workspace-scoped server routes (POST /, GET /)
app.use('/api/v1/workspaces/:workspaceId/servers', serversRouter)

// Server-scoped routes (PUT, DELETE, GET /status, POST /restart, GET /logs, POST /rotate-key)
app.use('/api/v1/servers', serversRouter)
app.use('/api/v1/servers/:serverId/tools', toolsRouter)

// Credentials
app.use('/api/v1/workspaces/:workspaceId/credentials', credentialsRouter)

// ─── Error handler (must be last middleware) ──────────────────────────────────
app.use(errorHandler)

// ─── RuntimeManager bootstrap ────────────────────────────────────────────────
//
// Initialise after the Express app is built so logger is ready.
// Errors are logged but do not prevent the API from starting.
runtimeManager.init().catch((err: unknown) => {
  logger.error({ err }, 'RuntimeManager.init() failed')
})

export default app
