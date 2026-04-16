import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { logger } from './lib/logger'
import { errorHandler } from './middleware/errorHandler'
import { ipRateLimiter, auditLogger, sanitizeInput, workspaceRateLimiter, mcpRateLimiter } from './middleware/security'
import { mcpAuthMiddleware } from './middleware/mcp-auth'
import authRouter from './routes/auth'
import importRouter from './routes/import'
import toolsRouter from './routes/tools'
import credentialsRouter from './routes/credentials'
import serversRouter from './routes/servers'
import workspaceRouter from './routes/workspace'
import templatesRouter from './routes/templates'
import internalRouter from './routes/internal'
import { runtimeManager } from './services/runtime-manager'
import { prisma } from '@mcpbuilder/db'

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

// Global security middleware (runs on every request except /mcp/*)
app.use(ipRateLimiter)
app.use(sanitizeInput)
app.use(auditLogger)

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
// Auth is delegated to mcpAuthMiddleware (Redis-cached API key validation + access log).
// Rate limiting is applied per-server (60 req/min).

app.use('/mcp/:serverId', mcpRateLimiter, mcpAuthMiddleware, async (req, res, next) => {
  try {
    const serverId = req.params['serverId']!

    // ── Local runtime path ────────────────────────────────────────────────────
    const port = runtimeManager.getPort(serverId)
    if (port) {
      // Build target path (strip /mcp/:serverId prefix, keep the rest + query string)
      const targetPath =
        req.path +
        (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')

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
        res.on('close', () => proxyReq.destroy())
      })

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Bad Gateway', message: err.message })
        }
      })

      if (['POST', 'PUT', 'PATCH'].includes(req.method ?? '') && req.body !== undefined) {
        const bodyStr = JSON.stringify(req.body)
        proxyReq.setHeader('Content-Type', 'application/json')
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyStr))
        proxyReq.write(bodyStr)
        proxyReq.end()
      } else {
        proxyReq.end()
      }
      return
    }

    // ── Cloudflare Worker path ────────────────────────────────────────────────
    const server = await prisma.mcpServer.findUnique({
      where: { id: serverId },
      select: { runtimeMode: true, endpointUrl: true },
    })

    if (server?.runtimeMode === 'CLOUDFLARE' && server.endpointUrl) {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
      const targetUrl = server.endpointUrl.replace(/\/$/, '') + (req.path || '/mcp') + qs

      const forwardHeaders: Record<string, string> = {
        'content-type': 'application/json',
      }
      if (req.headers['authorization']) {
        forwardHeaders['authorization'] = req.headers['authorization'] as string
      }

      const cfRes = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        ...((['POST', 'PUT', 'PATCH'].includes(req.method ?? '') && req.body !== undefined) && {
          body: JSON.stringify(req.body),
        }),
      })

      const cfBody = await cfRes.text()
      res.status(cfRes.status)
      const ct = cfRes.headers.get('content-type')
      if (ct) res.set('Content-Type', ct)
      res.send(cfBody)
      return
    }

    res.status(503).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'MCP server is not running' },
    })
  } catch (err) {
    next(err)
  }
})

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/import', importRouter)

// Workspace routes (GET /, GET /:id/stats) — rate-limited per workspace
app.use('/api/v1/workspaces', workspaceRateLimiter, workspaceRouter)

// Workspace-scoped server routes (POST /, GET /)
app.use('/api/v1/workspaces/:workspaceId/servers', workspaceRateLimiter, serversRouter)
app.use('/api/v1/workspaces/:workspaceId/servers', workspaceRateLimiter, templatesRouter)
app.use('/api/workspaces/:workspaceId/servers', workspaceRateLimiter, templatesRouter)

// Server-scoped routes (PUT, DELETE, GET /status, POST /restart, GET /logs, POST /rotate-key)
app.use('/api/v1/servers', serversRouter)
app.use('/api/v1/servers/:serverId/tools', toolsRouter)
app.use('/api/v1/templates', templatesRouter)
app.use('/api/templates', templatesRouter)

// Credentials
app.use('/api/v1/workspaces/:workspaceId/credentials', workspaceRateLimiter, credentialsRouter)

// Internal machine-to-machine routes (Cloudflare Worker → API)
app.use('/api/internal', internalRouter)

// ─── Error handler (must be last middleware) ──────────────────────────────────
app.use(errorHandler)

// ─── RuntimeManager bootstrap ─────────────────────────────────────────────────
runtimeManager.init().catch((err: unknown) => {
  logger.error({ err }, 'RuntimeManager.init() failed')
})

export default app
