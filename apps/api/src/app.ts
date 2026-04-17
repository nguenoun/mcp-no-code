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
import oauthAppsRouter from './routes/oauth-apps'
import oauthServerRouter from './routes/oauth-server'
import oauthConsentRouter from './routes/oauth-consent'
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

// ─── OAuth Authorization Server ───────────────────────────────────────────────
//
// Ces routes DOIVENT être enregistrées AVANT le proxy MCP (mcpAuthMiddleware).
// Express les évalue dans l'ordre ; sans ça, le proxy intercepterait
// /.well-known, /authorize, /token et /revoke avant ces handlers.
//
// C1  GET  /mcp/:serverId/.well-known/oauth-authorization-server
// C2  GET  /mcp/:serverId/authorize
// C4  POST /mcp/:serverId/token     (authorization_code)
// C5  POST /mcp/:serverId/token     (refresh_token)
// C6  POST /mcp/:serverId/revoke
app.use('/mcp', oauthServerRouter)

// C3  POST /api/v1/oauth/consent    (requiert dashboard JWT)
app.use('/api/v1/oauth', oauthConsentRouter)

// ─── D2. Streamable HTTP transport — POST /mcp/:serverId/mcp ─────────────────
//
// Transport JSON-RPC one-shot utilisé par Dust et les clients MCP modernes.
// Reçoit une requête JSON-RPC (initialize / tools/list / tools/call …),
// la proxy vers le runtime local ou le Worker CF, retourne la réponse JSON
// directement (pas de SSE). Enregistré AVANT le proxy générique ci-dessous
// pour qu'Express le matche en premier sur ce path précis.

app.post('/mcp/:serverId/mcp', mcpRateLimiter, mcpAuthMiddleware, async (req, res, next) => {
  try {
    const serverId = req.params['serverId']!

    // ── Local runtime path ────────────────────────────────────────────────────
    const port = runtimeManager.getPort(serverId)
    if (port) {
      const proxyOptions: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          ...req.headers,
          host: `127.0.0.1:${port}`,
          accept: 'application/json', // demande une réponse JSON (pas SSE)
        },
      }

      const proxyReq = http.request(proxyOptions, (proxyRes) => {
        const chunks: Buffer[] = []
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
        proxyRes.on('end', () => {
          if (res.headersSent) return
          const body = Buffer.concat(chunks)
          res.status(proxyRes.statusCode ?? 200)
          const ct = proxyRes.headers['content-type']
          if (ct) res.set('Content-Type', ct as string)
          res.send(body)
        })
      })

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Bad Gateway', message: (err as Error).message })
        }
      })

      const bodyStr = JSON.stringify(req.body)
      proxyReq.setHeader('Content-Type', 'application/json')
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyStr))
      proxyReq.write(bodyStr)
      proxyReq.end()
      return
    }

    // ── Cloudflare Worker path ────────────────────────────────────────────────
    const server = await prisma.mcpServer.findUnique({
      where: { id: serverId },
      select: { runtimeMode: true, endpointUrl: true },
    })

    if (server?.runtimeMode === 'CLOUDFLARE' && server.endpointUrl) {
      const targetUrl = server.endpointUrl.replace(/\/$/, '') + '/mcp'

      const forwardHeaders: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json',
      }
      if (req.headers['authorization']) {
        forwardHeaders['authorization'] = req.headers['authorization'] as string
      }

      const cfRes = await fetch(targetUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify(req.body),
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

// OAuth Apps & sessions management — GET/POST /oauth/apps, DELETE /oauth/apps/:appId,
// GET/DELETE /oauth/sessions, PUT /auth-mode
app.use('/api/v1/servers/:serverId', oauthAppsRouter)
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
