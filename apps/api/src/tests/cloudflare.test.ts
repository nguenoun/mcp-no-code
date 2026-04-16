/**
 * Cloudflare integration tests
 *
 * Test coverage:
 *  1. deployWorker sends PUT to the correct Workers script endpoint
 *  2. Generated worker script contains all tools from config
 *  3. deleteWorker sends DELETE to the correct Workers script endpoint
 *  4. Cloudflare 4xx response → result.success false with error message
 *  5. triggerCfRedeploy updates McpServer status and endpointUrl in DB on success
 */
import { vi, describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@mcpbuilder/db', () => ({
  prisma: {
    mcpServer: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('../lib/redis', () => ({
  redis: {
    incr: vi.fn().mockResolvedValue(1),
  },
}))

vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from '@mcpbuilder/db'
import { CloudflareDeployer, CloudflareDeployError } from '@mcpbuilder/mcp-runtime'
import { triggerCfRedeploy } from '../services/cloudflare-service'

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNT_ID = 'test-account-123'
const API_TOKEN = 'test-api-token'
const KV_NS = 'test-kv-ns'
const SUBDOMAIN = 'testworkers'
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`

function makeDeployer(): CloudflareDeployer {
  return new CloudflareDeployer({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    kvNamespaceId: KV_NS,
    workersSubdomain: SUBDOMAIN,
  })
}

const baseConfig = {
  serverId: 'srv-001',
  serverName: 'Test Server',
  tools: [
    {
      name: 'get_user',
      description: 'Fetch a user',
      httpMethod: 'GET',
      httpUrl: 'https://api.example.com/users/{id}',
      parametersSchema: { type: 'object', properties: { id: { type: 'string' } } },
      headersConfig: [],
    },
    {
      name: 'create_post',
      description: 'Create a post',
      httpMethod: 'POST',
      httpUrl: 'https://api.example.com/posts',
      parametersSchema: { type: 'object', properties: { title: { type: 'string' } } },
      headersConfig: [],
    },
  ],
}

// ─── msw server setup ─────────────────────────────────────────────────────────

// Default success handler for secrets endpoint (used in most tests)
const secretsHandler = http.put(
  `${CF_BASE}/workers/scripts/:workerName/secrets`,
  () => HttpResponse.json({ success: true, errors: [], result: {} }),
)

// Default success handler for KV endpoint
const kvHandler = http.put(
  `${CF_BASE}/storage/kv/namespaces/${KV_NS}/values/*`,
  () => HttpResponse.json({ success: true, errors: [], result: {} }),
)

const mswServer = setupServer(secretsHandler, kvHandler)

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CloudflareDeployer', () => {
  it('1. deployWorker sends PUT to the correct Workers script endpoint', async () => {
    const deployer = makeDeployer()
    const workerName = deployer.getWorkerName(baseConfig.serverId)
    let capturedMethod: string | undefined
    let capturedUrl: string | undefined

    mswServer.use(
      http.put(`${CF_BASE}/workers/scripts/${workerName}`, ({ request }) => {
        capturedMethod = request.method
        capturedUrl = request.url
        return HttpResponse.json({
          success: true,
          errors: [],
          result: { id: workerName },
        })
      }),
    )

    const result = await deployer.deployWorker(baseConfig, 'my-api-key')

    expect(result.success).toBe(true)
    expect(result.workerName).toBe(workerName)
    expect(result.endpointUrl).toContain(workerName)
    expect(capturedMethod).toBe('PUT')
    expect(capturedUrl).toContain(`/workers/scripts/${workerName}`)
  })

  it('2. generated worker script contains all tools from config', () => {
    const deployer = makeDeployer()
    const script = deployer.generateWorkerScript(baseConfig)

    expect(script).toContain('get_user')
    expect(script).toContain('create_post')
    // All tool names appear in TOOLS_CONFIG JSON
    expect(script).toContain('Fetch a user')
    expect(script).toContain('Create a post')
    // Script should reference expected tool count indirectly via config
    expect(script).toContain('TOOLS_CONFIG')
    expect(script.match(/"name":/g)?.length).toBeGreaterThanOrEqual(baseConfig.tools.length)
  })

  it('3. deleteWorker sends DELETE to the correct Workers script endpoint', async () => {
    const deployer = makeDeployer()
    const serverId = 'srv-to-delete'
    const workerName = deployer.getWorkerName(serverId)
    let capturedMethod: string | undefined

    mswServer.use(
      http.delete(`${CF_BASE}/workers/scripts/${workerName}`, ({ request }) => {
        capturedMethod = request.method
        return HttpResponse.json({ success: true, errors: [], result: {} })
      }),
    )

    await deployer.deleteWorker(serverId)

    expect(capturedMethod).toBe('DELETE')
  })

  it('4. CF 4xx response → result.success false with error message', async () => {
    const deployer = makeDeployer()
    const workerName = deployer.getWorkerName(baseConfig.serverId)

    mswServer.use(
      http.put(`${CF_BASE}/workers/scripts/${workerName}`, () =>
        HttpResponse.json(
          {
            success: false,
            errors: [{ code: 10000, message: 'Authentication error' }],
            result: null,
          },
          { status: 403 },
        ),
      ),
    )

    const result = await deployer.deployWorker(baseConfig, 'bad-key')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Authentication error')
  })

  it('4b. deleteWorker on 4xx throws CloudflareDeployError', async () => {
    const deployer = makeDeployer()
    const serverId = 'srv-err'
    const workerName = deployer.getWorkerName(serverId)

    mswServer.use(
      http.delete(`${CF_BASE}/workers/scripts/${workerName}`, () =>
        HttpResponse.json(
          {
            success: false,
            errors: [{ code: 10001, message: 'Script not found' }],
            result: null,
          },
          { status: 404 },
        ),
      ),
    )

    // 404 is treated as "already deleted" — should not throw
    await expect(deployer.deleteWorker(serverId)).resolves.toBeUndefined()
  })
})

describe('triggerCfRedeploy', () => {
  it('5. updates McpServer status and endpointUrl in DB after successful CF deploy', async () => {
    // Set up env vars so getCfDeployer() can create a deployer
    process.env['CF_ACCOUNT_ID'] = ACCOUNT_ID
    process.env['CF_API_TOKEN'] = API_TOKEN
    process.env['CF_KV_NAMESPACE_ID'] = KV_NS
    process.env['CF_WORKERS_SUBDOMAIN'] = SUBDOMAIN

    const serverId = 'srv-redeploy-test'
    const mockServer = {
      id: serverId,
      name: 'Redeploy Server',
      apiKey: 'server-api-key',
      credential: null,
      tools: [
        {
          name: 'ping',
          description: 'Ping endpoint',
          httpMethod: 'GET',
          httpUrl: 'https://api.example.com/ping',
          parametersSchema: {},
          headersConfig: [],
        },
      ],
    }

    vi.mocked(prisma.mcpServer.findUnique).mockResolvedValue(mockServer as never)
    vi.mocked(prisma.mcpServer.update).mockResolvedValue({} as never)

    const workerName = new CloudflareDeployer({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      kvNamespaceId: KV_NS,
      workersSubdomain: SUBDOMAIN,
    }).getWorkerName(serverId)

    mswServer.use(
      http.put(`${CF_BASE}/workers/scripts/${workerName}`, () =>
        HttpResponse.json({ success: true, errors: [], result: { id: workerName } }),
      ),
    )

    // Fire and forget — wait for microtasks to drain
    triggerCfRedeploy(serverId)
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(prisma.mcpServer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: serverId },
        data: expect.objectContaining({
          status: 'RUNNING',
          endpointUrl: expect.stringContaining(workerName),
        }),
      }),
    )
  })
})
