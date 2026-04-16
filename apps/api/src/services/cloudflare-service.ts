import {
  createCloudflareDeployer,
  CloudflareDeployer,
  type WorkerDeployConfig,
} from '@mcpbuilder/mcp-runtime'
import { prisma } from '@mcpbuilder/db'
import { logger } from '../lib/logger'

// ─── Lazy singleton ───────────────────────────────────────────────────────────

let _deployer: CloudflareDeployer | null = null

/**
 * Returns the CloudflareDeployer singleton, or null if CF env vars are not set.
 * Safe to call at any time — will never throw.
 */
export function getCfDeployer(): CloudflareDeployer | null {
  if (_deployer) return _deployer
  try {
    _deployer = createCloudflareDeployer()
    return _deployer
  } catch {
    return null
  }
}

/** True if all required Cloudflare env vars are present. */
export function isCfConfigured(): boolean {
  return Boolean(
    process.env['CLOUDFLARE_ACCOUNT_ID'] &&
      process.env['CLOUDFLARE_API_TOKEN'] &&
      process.env['CLOUDFLARE_KV_NAMESPACE_ID'] &&
      process.env['CLOUDFLARE_WORKERS_SUBDOMAIN'],
  )
}

// ─── Redeploy helper ──────────────────────────────────────────────────────────

/**
 * Fire-and-forget: updates the Cloudflare Worker for a server with its current
 * tool configuration. Errors are logged but never propagated.
 *
 * Call this after any change that modifies the tool list or credential of a
 * CLOUDFLARE-mode server that is already RUNNING.
 */
export function triggerCfRedeploy(serverId: string): void {
  const deployer = getCfDeployer()
  if (!deployer) return

  void (async () => {
    try {
      const server = await prisma.mcpServer.findUnique({
        where: { id: serverId },
        include: {
          tools: { where: { isEnabled: true }, orderBy: { createdAt: 'asc' } },
          credential: true,
        },
      })
      if (!server) return

      const config: WorkerDeployConfig = {
        serverId: server.id,
        serverName: server.name,
        tools: server.tools.map((t) => ({
          name: t.name,
          description: t.description,
          httpMethod: t.httpMethod,
          httpUrl: t.httpUrl,
          parametersSchema: t.parametersSchema as Record<string, unknown>,
          headersConfig:
            (t.headersConfig as Array<{ key: string; value: string; isSecret: boolean }>) ?? [],
        })),
        ...(server.credential && {
          credential: {
            type: server.credential.type,
            encryptedValue: server.credential.encryptedValue,
          },
        }),
        internalApiUrl: process.env['API_URL'] ?? '',
      }

      const result = await deployer.updateWorker(config, server.apiKey)
      if (result.success) {
        await prisma.mcpServer.update({
          where: { id: serverId },
          data: { status: 'RUNNING', endpointUrl: result.endpointUrl },
        })
      }
      logger.info({ serverId, success: result.success }, 'CF worker redeploy triggered')
    } catch (err) {
      logger.error({ serverId, err }, 'CF worker redeploy failed')
    }
  })()
}
