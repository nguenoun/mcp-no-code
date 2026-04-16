import pino, { type Logger } from 'pino'
import type { McpToolConfig } from './server-runtime'
import { generateWorkerScript } from './worker-template'

export type WorkerDeployConfig = {
  serverId: string
  serverName: string
  tools: McpToolConfig[]
  credential?: { type: string; encryptedValue: string }
  baseUrl?: string
  internalApiUrl?: string
  analyticsEngineDataset?: string
}

export type WorkerLogEntry = {
  toolName: string
  status: 'SUCCESS' | 'ERROR'
  latencyMs: number | null
  errorMessage: string | null
  timestamp: Date
}

export type DeployResult = {
  success: boolean
  endpointUrl: string
  workerName: string
  error?: string
}

type CloudflareApiError = {
  code: number
  message: string
}

type CloudflareApiResponse<T> = {
  success: boolean
  errors: CloudflareApiError[]
  result: T
}

type WorkerMetadataResponse = {
  id: string
}

export class CloudflareDeployError extends Error {
  public readonly cloudflareCode: number | null
  public readonly endpoint: string

  constructor(message: string, endpoint: string, cloudflareCode: number | null = null) {
    super(message)
    this.name = 'CloudflareDeployError'
    this.endpoint = endpoint
    this.cloudflareCode = cloudflareCode
  }
}

type CloudflareDeployerOptions = {
  accountId: string
  apiToken: string
  kvNamespaceId: string
  workersSubdomain: string
  analyticsEngineDataset?: string
  logger?: Logger
}

export class CloudflareDeployer {
  private readonly accountId: string
  private readonly apiToken: string
  private readonly kvNamespaceId: string
  private readonly workersSubdomain: string
  private readonly analyticsEngineDataset: string | undefined
  private readonly logger: Logger
  private readonly apiBaseUrl: string

  constructor(options: CloudflareDeployerOptions) {
    this.accountId = options.accountId
    this.apiToken = options.apiToken
    this.kvNamespaceId = options.kvNamespaceId
    this.workersSubdomain = options.workersSubdomain
    this.analyticsEngineDataset = options.analyticsEngineDataset
    this.logger = options.logger ?? pino({ name: 'cloudflare-deployer' })
    this.apiBaseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}`
  }

  generateWorkerScript(config: WorkerDeployConfig): string {
    return generateWorkerScript(config)
  }

  getWorkerName(serverId: string): string {
    const sanitizedId = serverId
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    const withPrefix = `mcp-${sanitizedId || 'server'}`
    return withPrefix.slice(0, 63).replace(/-$/, '')
  }

  private sanitizeWorkerName(serverId: string): string {
    return this.getWorkerName(serverId)
  }

  private async parseCloudflareResponse<T>(
    response: Response,
    endpoint: string,
  ): Promise<CloudflareApiResponse<T>> {
    const bodyText = await response.text()
    const parsed = bodyText ? (JSON.parse(bodyText) as CloudflareApiResponse<T>) : null

    if (!response.ok || !parsed || parsed.success === false) {
      const firstError = parsed?.errors?.[0]
      const message = firstError?.message ?? `Cloudflare API request failed with status ${response.status}`
      const code = firstError?.code ?? null
      throw new CloudflareDeployError(message, endpoint, code)
    }

    return parsed
  }

  private async setWorkerSecret(workerName: string, name: string, text: string): Promise<void> {
    const endpoint = `${this.apiBaseUrl}/workers/scripts/${workerName}/secrets`
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        text,
        type: 'secret_text',
      }),
    })

    await this.parseCloudflareResponse<Record<string, unknown>>(response, endpoint)
  }

  private async putKvConfig(config: WorkerDeployConfig): Promise<void> {
    const key = `server:${config.serverId}:config`
    const endpoint = `${this.apiBaseUrl}/storage/kv/namespaces/${this.kvNamespaceId}/values/${encodeURIComponent(key)}`
    const payload = JSON.stringify({
      tools: config.tools,
      baseUrl: config.baseUrl ?? null,
      credentialType: config.credential?.type ?? null,
    })

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: payload,
    })

    if (!response.ok) {
      const body = await response.text()
      throw new CloudflareDeployError(
        `Unable to store config in KV: ${body || response.statusText}`,
        endpoint,
      )
    }
  }

  async deployWorker(config: WorkerDeployConfig, apiKey: string): Promise<DeployResult> {
    const workerName = this.sanitizeWorkerName(config.serverId)
    const endpointUrl = `https://${workerName}.${this.workersSubdomain}.workers.dev`
    const deployEndpoint = `${this.apiBaseUrl}/workers/scripts/${workerName}`

    try {
      const script = this.generateWorkerScript(config)
      const bindings: Array<Record<string, string>> = [
        {
          type: 'kv_namespace',
          name: 'CONFIG',
          namespace_id: this.kvNamespaceId,
        },
        {
          type: 'plain_text',
          name: 'CREDENTIAL_TYPE',
          text: config.credential?.type ?? '',
        },
      ]

      if (config.internalApiUrl) {
        bindings.push({
          type: 'plain_text',
          name: 'INTERNAL_API_URL',
          text: config.internalApiUrl,
        })
      }

      const metadata = {
        main_module: 'worker.js',
        bindings,
      }

      const formData = new FormData()
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
      formData.append('worker.js', new Blob([script], { type: 'application/javascript+module' }), 'worker.js')

      const deployResponse = await fetch(deployEndpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: formData,
      })

      await this.parseCloudflareResponse<WorkerMetadataResponse>(deployResponse, deployEndpoint)

      await this.setWorkerSecret(workerName, 'MCP_API_KEY', apiKey)
      if (config.credential?.encryptedValue) {
        await this.setWorkerSecret(workerName, 'CREDENTIAL', config.credential.encryptedValue)
      }

      const internalSecret = process.env['INTERNAL_SECRET']
      if (internalSecret) {
        await this.setWorkerSecret(workerName, 'INTERNAL_SECRET', internalSecret)
      }

      await this.putKvConfig(config)

      this.logger.info(
        { serverId: config.serverId, workerName, endpointUrl },
        'Cloudflare worker deployed',
      )

      return {
        success: true,
        endpointUrl,
        workerName,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const deployError =
        error instanceof CloudflareDeployError
          ? error
          : new CloudflareDeployError(message, deployEndpoint, null)

      this.logger.error(
        {
          serverId: config.serverId,
          workerName,
          endpoint: deployError.endpoint,
          cloudflareCode: deployError.cloudflareCode,
          err: deployError,
        },
        'Cloudflare worker deployment failed',
      )

      return {
        success: false,
        endpointUrl,
        workerName,
        error: deployError.message,
      }
    }
  }

  /**
   * Retrieve log entries for a Worker from Cloudflare Analytics Engine.
   * Falls back to the provided callback (e.g. DB query) if Analytics Engine
   * is not configured or the request fails.
   *
   * AE data point convention (written by the Worker):
   *   blob1 = workerName, blob2 = toolName, blob3 = status,
   *   blob4 = errorMessage, double1 = latencyMs
   */
  async getWorkerLogs(
    workerName: string,
    since: Date,
    fallback?: () => Promise<WorkerLogEntry[]>,
  ): Promise<WorkerLogEntry[]> {
    if (!this.analyticsEngineDataset) {
      return fallback ? fallback() : []
    }

    const endpoint = `${this.apiBaseUrl}/analytics_engine/sql`
    const query = `
      SELECT
        blob2 AS toolName,
        blob3 AS status,
        double1 AS latencyMs,
        blob4 AS errorMessage,
        timestamp
      FROM ${this.analyticsEngineDataset}
      WHERE blob1 = '${workerName}'
        AND timestamp >= toDateTime(${Math.floor(since.getTime() / 1000)})
      ORDER BY timestamp DESC
      LIMIT 100
    `

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'text/plain',
        },
        body: query,
      })

      if (!response.ok) {
        this.logger.warn(
          { workerName, status: response.status },
          'Analytics Engine query failed — using fallback',
        )
        return fallback ? fallback() : []
      }

      const data = (await response.json()) as {
        data: Array<Record<string, unknown>>
      }

      return (data.data ?? []).map((row) => ({
        toolName: String(row['toolName'] ?? ''),
        status: row['status'] === 'ERROR' ? ('ERROR' as const) : ('SUCCESS' as const),
        latencyMs: row['latencyMs'] != null ? Number(row['latencyMs']) : null,
        errorMessage: row['errorMessage'] ? String(row['errorMessage']) : null,
        timestamp: new Date(String(row['timestamp'] ?? '')),
      }))
    } catch (err) {
      this.logger.warn({ workerName, err }, 'Analytics Engine query threw — using fallback')
      return fallback ? fallback() : []
    }
  }

  async deleteWorker(serverId: string): Promise<void> {
    const workerName = this.sanitizeWorkerName(serverId)
    const endpoint = `${this.apiBaseUrl}/workers/scripts/${workerName}`

    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    })

    if (response.status === 404) return
    await this.parseCloudflareResponse<Record<string, unknown>>(response, endpoint)
    this.logger.info({ serverId, workerName }, 'Cloudflare worker deleted')
  }

  async updateWorker(config: WorkerDeployConfig, apiKey: string): Promise<DeployResult> {
    return this.deployWorker(config, apiKey)
  }

  async getWorkerStatus(serverId: string): Promise<'active' | 'inactive' | 'not_found'> {
    const workerName = this.sanitizeWorkerName(serverId)
    const endpoint = `${this.apiBaseUrl}/workers/scripts/${workerName}`

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
    })

    if (response.status === 404) return 'not_found'

    const parsed = await this.parseCloudflareResponse<Record<string, unknown>>(response, endpoint)
    const isActive = Boolean(parsed.result && Object.keys(parsed.result).length > 0)
    return isActive ? 'active' : 'inactive'
  }
}

export function createCloudflareDeployer(): CloudflareDeployer {
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID']
  const apiToken = process.env['CLOUDFLARE_API_TOKEN']
  const kvNamespaceId = process.env['CLOUDFLARE_KV_NAMESPACE_ID']
  const workersSubdomain = process.env['CLOUDFLARE_WORKERS_SUBDOMAIN']
  const analyticsEngineDataset = process.env['CLOUDFLARE_ANALYTICS_ENGINE_DATASET']

  if (!accountId) throw new Error('Missing required env var: CLOUDFLARE_ACCOUNT_ID')
  if (!apiToken) throw new Error('Missing required env var: CLOUDFLARE_API_TOKEN')
  if (!kvNamespaceId) throw new Error('Missing required env var: CLOUDFLARE_KV_NAMESPACE_ID')
  if (!workersSubdomain) throw new Error('Missing required env var: CLOUDFLARE_WORKERS_SUBDOMAIN')

  return new CloudflareDeployer({
    accountId,
    apiToken,
    kvNamespaceId,
    workersSubdomain,
    analyticsEngineDataset,
  })
}
