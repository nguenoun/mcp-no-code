import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { describe, expect, it } from 'vitest'
import { generateWorkerScript } from './worker-template'
import type { WorkerDeployConfig } from './cloudflare-deployer'

const SAMPLE_CONFIG: WorkerDeployConfig = {
  serverId: 'srv_123',
  serverName: 'Sample Server',
  baseUrl: 'https://api.example.com',
  tools: [
    {
      name: 'get_user',
      description: 'Get user by ID',
      httpMethod: 'GET',
      httpUrl: '/users/{id}',
      parametersSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'User identifier' },
          includeMeta: { type: 'boolean' },
        },
        required: ['id'],
      },
      headersConfig: [
        { key: 'X-App', value: 'mcpbuilder' },
        { key: 'X-Secret', value: 'never-inline', isSecret: true },
      ],
    },
    {
      name: 'create_ticket',
      description: 'Create support ticket',
      httpMethod: 'POST',
      httpUrl: 'https://tickets.example.com/v1/tickets',
      parametersSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          priority: { type: 'number' },
        },
        required: ['title'],
      },
      headersConfig: [],
    },
  ],
  credential: {
    type: 'BEARER',
    encryptedValue: 'very-secret-encrypted-value',
  },
}

describe('generateWorkerScript', () => {
  it('generates syntactically valid JavaScript', () => {
    const script = generateWorkerScript(SAMPLE_CONFIG)
    const dir = mkdtempSync(join(tmpdir(), 'mcp-worker-script-'))
    const filePath = join(dir, 'worker.generated.js')
    writeFileSync(filePath, script, 'utf8')

    const check = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' })
    expect(check.status).toBe(0)
    expect(check.stderr).toBe('')
  })

  it('contains the expected number of generated tools', () => {
    const script = generateWorkerScript(SAMPLE_CONFIG)
    expect(script).toContain('const TOOLS_CONFIG = ')

    const serverToolCalls = (script.match(/server\.tool\(/g) ?? []).length
    expect(serverToolCalls).toBe(1) // registration is dynamic in a loop

    const embeddedTools = (script.match(/"name":"get_user"|"name":"create_ticket"/g) ?? []).length
    expect(embeddedTools).toBe(2)
  })

  it('does not expose encrypted credentials in source', () => {
    const script = generateWorkerScript(SAMPLE_CONFIG)
    expect(script).not.toContain(SAMPLE_CONFIG.credential!.encryptedValue)
    expect(script).not.toContain('never-inline')
    expect(script).toContain('env.CREDENTIAL')
    expect(script).toContain('env.MCP_API_KEY')
  })
})
