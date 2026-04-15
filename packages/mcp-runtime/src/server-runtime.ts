import express, { type Express, type Request, type Response } from 'express'
import { createServer, type Server as HttpServer } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { z } from 'zod'
import { decrypt, getMasterKey } from './crypto'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface McpToolConfig {
  name: string
  description: string | null
  httpMethod: string
  httpUrl: string
  /** JSONSchema7 object — typically { type: 'object', properties: {...}, required: [...] } */
  parametersSchema: Record<string, unknown>
  /** Static headers to inject on every request for this tool */
  headersConfig: Array<{ key: string; value: string; isSecret?: boolean }>
}

export interface McpServerConfig {
  serverId: string
  tools: McpToolConfig[]
  /** Optional credential to inject into outbound requests */
  credential?: {
    type: 'API_KEY' | 'BEARER' | 'BASIC_AUTH'
    encryptedValue: string
  }
  /** Base URL prepended to relative httpUrls */
  baseUrl?: string
}

export type RuntimeStatus = 'running' | 'stopped' | 'error'

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Convert a JSONSchema7 properties map to a Zod raw shape */
function jsonSchemaToZodShape(schema: Record<string, unknown>): z.ZodRawShape {
  const properties = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set((schema['required'] ?? []) as string[])
  const shape: z.ZodRawShape = {}

  for (const [key, propSchema] of Object.entries(properties)) {
    const base = jsonSchemaTypeToZod(propSchema)
    shape[key] = required.has(key) ? base : base.optional()
  }
  return shape
}

function jsonSchemaTypeToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  switch (schema['type']) {
    case 'string':
      return z.string()
    case 'number':
      return z.number()
    case 'integer':
      return z.number().int()
    case 'boolean':
      return z.boolean()
    case 'array':
      return z.array(z.unknown())
    case 'object':
      return z.record(z.unknown())
    default:
      // Unknown or missing type — accept anything
      return z.unknown()
  }
}

/** Decode the stored credential and build the auth header { name, value } */
function buildCredentialHeader(
  type: string,
  encryptedValue: string,
): { name: string; value: string } | null {
  try {
    const masterKey = getMasterKey()
    const plaintext = decrypt(encryptedValue, masterKey)

    switch (type) {
      case 'BEARER':
        return { name: 'Authorization', value: `Bearer ${plaintext}` }
      case 'API_KEY':
        return { name: 'X-API-Key', value: plaintext }
      case 'BASIC_AUTH': {
        const { username, password } = JSON.parse(plaintext) as {
          username: string
          password: string
        }
        const encoded = Buffer.from(`${username}:${password}`).toString('base64')
        return { name: 'Authorization', value: `Basic ${encoded}` }
      }
      default:
        return null
    }
  } catch {
    // Decryption failure — proceed without credential rather than crashing
    return null
  }
}

/** Resolve httpUrl against an optional baseUrl for relative paths */
function resolveUrl(httpUrl: string, baseUrl?: string): string {
  if (httpUrl.startsWith('http://') || httpUrl.startsWith('https://')) {
    return httpUrl
  }
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, '')}/${httpUrl.replace(/^\//, '')}`
  }
  return httpUrl
}

/** Substitute path params like {userId} from args; return leftover args */
function fillPathParams(
  template: string,
  args: Record<string, unknown>,
): { url: string; remaining: Record<string, unknown> } {
  const remaining = { ...args }
  const url = template.replace(/\{([^}]+)\}/g, (_: string, key: string) => {
    const val = remaining[key]
    delete remaining[key]
    return val !== undefined && val !== null ? String(val) : ''
  })
  return { url, remaining }
}

/** fetch() wrapper with 30 s timeout and 1 network-error retry */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1,
): Promise<globalThis.Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } catch (err) {
    if (retries > 0 && (err as Error).name !== 'AbortError') {
      return fetchWithRetry(url, options, retries - 1)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ─── McpServerRuntime ─────────────────────────────────────────────────────────

interface ActiveConnection {
  transport: SSEServerTransport
  mcpServer: McpServer
}

export class McpServerRuntime {
  private status: RuntimeStatus = 'stopped'
  private httpServer: HttpServer | null = null
  private startedAt: Date | null = null
  private readonly connections = new Map<string, ActiveConnection>()
  private readonly app: Express

  constructor(private readonly config: McpServerConfig) {
    this.app = this.buildApp()
  }

  // ── App builder ──────────────────────────────────────────────────────────────

  private buildApp(): Express {
    const app = express()
    app.use(express.json())

    /** Health probe — used by RuntimeManager's health-check loop */
    app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        serverId: this.config.serverId,
        toolCount: this.config.tools.length,
        uptime: this.startedAt
          ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
          : 0,
      })
    })

    /**
     * SSE endpoint — MCP client opens a long-lived GET connection here.
     * A fresh McpServer instance is created per connection so that the SDK's
     * single-transport constraint is satisfied for concurrent clients.
     */
    app.get('/sse', async (req: Request, res: Response) => {
      const mcpServer = this.buildMcpServer()
      const transport = new SSEServerTransport('/messages', res)
      this.connections.set(transport.sessionId, { transport, mcpServer })

      res.on('close', () => {
        this.connections.delete(transport.sessionId)
      })

      await mcpServer.connect(transport)
    })

    /**
     * Messages endpoint — MCP client POSTs protocol messages here.
     * sessionId query param identifies which SSE connection the message belongs to.
     */
    app.post('/messages', async (req: Request, res: Response) => {
      const sessionId = req.query['sessionId'] as string | undefined
      const connection = sessionId ? this.connections.get(sessionId) : undefined

      if (!connection) {
        res.status(404).json({ error: 'Session not found' })
        return
      }

      await connection.transport.handlePostMessage(req, res)
    })

    return app
  }

  // ── McpServer factory ────────────────────────────────────────────────────────

  /** Build a new McpServer instance with all tools registered */
  private buildMcpServer(): McpServer {
    const server = new McpServer({
      name: this.config.serverId,
      version: '1.0.0',
    })

    for (const tool of this.config.tools) {
      const zodShape = jsonSchemaToZodShape(tool.parametersSchema)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(server.tool as any)(
        tool.name,
        tool.description ?? `${tool.httpMethod} ${tool.httpUrl}`,
        zodShape,
        async (args: Record<string, unknown>) => this.executeTool(tool, args),
      )
    }

    return server
  }

  // ── Tool executor ────────────────────────────────────────────────────────────

  private async executeTool(
    tool: McpToolConfig,
    args: Record<string, unknown>,
  ): Promise<{ isError?: boolean; content: Array<{ type: 'text'; text: string }> }> {
    try {
      // 1. Resolve URL template
      const template = resolveUrl(tool.httpUrl, this.config.baseUrl)
      const { url, remaining } = fillPathParams(template, args)

      // 2. Build headers
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }

      // Static tool-level headers
      for (const h of tool.headersConfig) {
        headers[h.key] = h.value
      }

      // Credential injection
      if (this.config.credential) {
        const credHeader = buildCredentialHeader(
          this.config.credential.type,
          this.config.credential.encryptedValue,
        )
        if (credHeader) {
          headers[credHeader.name] = credHeader.value
        }
      }

      // 3. Build request URL + body
      const method = tool.httpMethod.toUpperCase()
      let finalUrl = url
      let body: string | undefined

      if (method === 'GET' || method === 'DELETE' || method === 'HEAD') {
        // Path-less params go to query string
        const qs = new URLSearchParams()
        for (const [k, v] of Object.entries(remaining)) {
          if (v !== undefined && v !== null) qs.set(k, String(v))
        }
        const qsStr = qs.toString()
        if (qsStr) finalUrl += (finalUrl.includes('?') ? '&' : '?') + qsStr
      } else if (Object.keys(remaining).length > 0) {
        body = JSON.stringify(remaining)
      }

      // 4. Execute with retry
      const response = await fetchWithRetry(finalUrl, {
        method,
        headers,
        ...(body !== undefined && { body }),
      })

      // 5. Parse response body
      const ct = response.headers.get('content-type') ?? ''
      let text: string
      if (ct.includes('application/json')) {
        text = JSON.stringify(await response.json())
      } else {
        text = await response.text()
      }

      // 6. Map HTTP errors to MCP errors
      if (!response.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: `HTTP ${response.status}: ${text}` }],
        }
      }

      return { content: [{ type: 'text', text }] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool execution failed: ${message}` }],
      }
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(port: number): Promise<void> {
    if (this.status === 'running') return

    return new Promise<void>((resolve, reject) => {
      this.httpServer = createServer(this.app)

      this.httpServer.once('listening', () => {
        this.status = 'running'
        this.startedAt = new Date()
        resolve()
      })

      this.httpServer.once('error', (err) => {
        this.status = 'error'
        reject(err)
      })

      this.httpServer.listen(port, '127.0.0.1')
    })
  }

  async stop(): Promise<void> {
    if (!this.httpServer) {
      this.status = 'stopped'
      return
    }

    return new Promise<void>((resolve, reject) => {
      this.httpServer!.close((err) => {
        this.httpServer = null
        this.startedAt = null
        if (err) {
          this.status = 'error'
          reject(err)
        } else {
          this.status = 'stopped'
          resolve()
        }
      })
    })
  }

  getStatus(): RuntimeStatus {
    return this.status
  }

  getApp(): Express {
    return this.app
  }

  getStartedAt(): Date | null {
    return this.startedAt
  }

  getToolCount(): number {
    return this.config.tools.length
  }
}
