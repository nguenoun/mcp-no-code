import http from 'http'
import { prisma } from '@mcpbuilder/db'
import { McpServerRuntime, type McpServerConfig, type McpToolConfig } from '@mcpbuilder/mcp-runtime'
import { logger } from '../lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuntimeEntry {
  runtime: McpServerRuntime
  port: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT_START = 4001
const PORT_END = 5000
const HEALTH_CHECK_INTERVAL_MS = 30_000
const HEALTH_CHECK_TIMEOUT_MS = 5_000

// ─── RuntimeManager ───────────────────────────────────────────────────────────

/**
 * Singleton that manages the lifecycle of all in-process MCP server runtimes.
 *
 * Each MCP server runs as an Express HTTP server on its own internal port.
 * The main API proxies external traffic to these ports after API-key validation.
 */
class RuntimeManager {
  private readonly runtimes = new Map<string, RuntimeEntry>()
  private healthCheckTimer: NodeJS.Timeout | null = null

  // ── Port allocation ──────────────────────────────────────────────────────────

  private allocatePort(): number {
    const used = new Set(Array.from(this.runtimes.values()).map((e) => e.port))
    for (let p = PORT_START; p <= PORT_END; p++) {
      if (!used.has(p)) return p
    }
    throw new Error(`No available ports in range ${PORT_START}–${PORT_END}`)
  }

  // ── Config builder ───────────────────────────────────────────────────────────

  private async loadConfig(serverId: string): Promise<McpServerConfig> {
    const dbServer = await prisma.mcpServer.findUnique({
      where: { id: serverId },
      include: {
        tools: { where: { isEnabled: true }, orderBy: { createdAt: 'asc' } },
        credential: true,
      },
    })

    if (!dbServer) throw new Error(`Server ${serverId} not found in database`)

    const tools: McpToolConfig[] = dbServer.tools.map((t) => ({
      name: t.name,
      description: t.description,
      httpMethod: t.httpMethod,
      httpUrl: t.httpUrl,
      parametersSchema: t.parametersSchema as Record<string, unknown>,
      headersConfig: (t.headersConfig as Array<{ key: string; value: string; isSecret: boolean }>) ?? [],
    }))

    const config: McpServerConfig = { serverId, tools }

    if (dbServer.credential) {
      config.credential = {
        type: dbServer.credential.type as 'API_KEY' | 'BEARER' | 'BASIC_AUTH',
        encryptedValue: dbServer.credential.encryptedValue,
      }
    }

    return config
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Start a server: load config from DB, spin up the runtime, update DB status.
   * Returns the stable external proxy URL for this server.
   */
  async startServer(serverId: string): Promise<string> {
    // Stop existing runtime if any
    if (this.runtimes.has(serverId)) {
      await this.stopServer(serverId)
    }

    const config = await this.loadConfig(serverId)
    const port = this.allocatePort()
    const runtime = new McpServerRuntime(config)

    try {
      await runtime.start(port)
    } catch (err) {
      await prisma.mcpServer.update({
        where: { id: serverId },
        data: { status: 'ERROR' },
      })
      throw err
    }

    this.runtimes.set(serverId, { runtime, port })

    const endpointUrl = this.buildExternalUrl(serverId)
    await prisma.mcpServer.update({
      where: { id: serverId },
      data: { status: 'RUNNING', endpointUrl },
    })

    logger.info({ serverId, port, endpointUrl }, 'MCP server started')
    return endpointUrl
  }

  async stopServer(serverId: string): Promise<void> {
    const entry = this.runtimes.get(serverId)
    if (!entry) return

    try {
      await entry.runtime.stop()
    } catch (err) {
      logger.warn({ serverId, err }, 'Error while stopping MCP server')
    }

    this.runtimes.delete(serverId)

    await prisma.mcpServer.update({
      where: { id: serverId },
      data: { status: 'STOPPED', endpointUrl: null },
    })

    logger.info({ serverId }, 'MCP server stopped')
  }

  async restartServer(serverId: string): Promise<string> {
    logger.info({ serverId }, 'Restarting MCP server')
    return this.startServer(serverId)
  }

  /** Return the internal TCP port for a running server, or null if not running */
  getPort(serverId: string): number | null {
    return this.runtimes.get(serverId)?.port ?? null
  }

  /** Return the stable external proxy URL, or null if not running */
  getServerUrl(serverId: string): string | null {
    if (!this.runtimes.has(serverId)) return null
    return this.buildExternalUrl(serverId)
  }

  /** Runtime status info used by the GET /status endpoint */
  getStatusInfo(serverId: string): {
    running: boolean
    port: number | null
    status: string
    toolCount: number
    startedAt: Date | null
  } {
    const entry = this.runtimes.get(serverId)
    if (!entry) {
      return { running: false, port: null, status: 'stopped', toolCount: 0, startedAt: null }
    }
    return {
      running: entry.runtime.getStatus() === 'running',
      port: entry.port,
      status: entry.runtime.getStatus(),
      toolCount: entry.runtime.getToolCount(),
      startedAt: entry.runtime.getStartedAt(),
    }
  }

  // ── Initialisation ───────────────────────────────────────────────────────────

  /**
   * Called once at API startup.
   * Re-starts every server whose status is RUNNING in the DB,
   * then kicks off the periodic health-check loop.
   */
  async init(): Promise<void> {
    const runningServers = await prisma.mcpServer.findMany({
      where: { status: 'RUNNING' },
      select: { id: true },
    })

    await Promise.allSettled(
      runningServers.map(({ id }) =>
        this.startServer(id).catch((err) =>
          logger.error({ serverId: id, err }, 'Failed to restore server at startup'),
        ),
      ),
    )

    logger.info(
      { count: runningServers.length },
      'RuntimeManager initialised — restored running servers',
    )

    this.startHealthChecks()
  }

  // ── Health checks ────────────────────────────────────────────────────────────

  private startHealthChecks(): void {
    if (this.healthCheckTimer) return

    this.healthCheckTimer = setInterval(
      () => void this.runHealthChecks(),
      HEALTH_CHECK_INTERVAL_MS,
    )
    // Don't block process exit
    this.healthCheckTimer.unref()
  }

  private async runHealthChecks(): Promise<void> {
    if (this.runtimes.size === 0) return

    await Promise.allSettled(
      Array.from(this.runtimes.entries()).map(([serverId, { port }]) =>
        this.checkServer(serverId, port),
      ),
    )
  }

  private async checkServer(serverId: string, port: number): Promise<void> {
    const ok = await probeTcp(port, HEALTH_CHECK_TIMEOUT_MS)
    if (!ok) {
      logger.warn({ serverId, port }, 'Health check failed — marking server as ERROR')
      this.runtimes.delete(serverId)
      await prisma.mcpServer.update({
        where: { id: serverId },
        data: { status: 'ERROR' },
      }).catch(() => undefined)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private buildExternalUrl(serverId: string): string {
    const apiUrl = (process.env['API_URL'] ?? 'http://localhost:4000').replace(/\/$/, '')
    return `${apiUrl}/mcp/${serverId}`
  }
}

// ─── TCP probe (used for health checks without an HTTP dep in this file) ──────

function probeTcp(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/health', timeout: timeoutMs },
      (res) => {
        res.resume() // drain
        resolve(res.statusCode === 200)
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const runtimeManager = new RuntimeManager()
