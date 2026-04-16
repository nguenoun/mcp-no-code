#!/usr/bin/env ts-node
/**
 * cloudflare-test-worker.ts
 *
 * Test end-to-end d'un Worker Cloudflare déployé :
 *   - GET  {endpointUrl}/health  → vérifie que le Worker répond
 *   - POST {endpointUrl}/mcp     → initialize → tools/list
 *   - Affiche la liste des tools retournée
 *   - Chronomètre la latence totale
 *
 * Usage : npm run cf:test-worker -- --serverId=<id>
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') })

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok   = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m  ${msg}`)
const fail = (msg: string): never => { console.error(`  \x1b[31m✗\x1b[0m  ${msg}`); process.exit(1) }
const info = (msg: string) => console.log(`  \x1b[36mℹ\x1b[0m  ${msg}`)
const step = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`)

function parseArgs(): { serverId: string } {
  const arg = process.argv.find((a) => a.startsWith('--serverId='))
  if (!arg) {
    fail('Argument --serverId=<id> requis.\n  Usage : npm run cf:test-worker -- --serverId=<id>')
  }
  const serverId = arg.split('=')[1]?.trim()
  if (!serverId) fail('--serverId ne peut pas être vide.')
  return { serverId }
}

async function timedFetch(
  url: string,
  opts: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown; latencyMs: number }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(url, { ...opts, signal: controller.signal })
    clearTimeout(timer)
    const latencyMs = Date.now() - start
    let body: unknown
    const ct = res.headers.get('content-type') ?? ''
    body = ct.includes('application/json') ? await res.json() : await res.text()
    return { ok: res.ok, status: res.status, body, latencyMs }
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start }
  }
}

type McpResponse = {
  jsonrpc: string
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1mMCPBuilder — Test Worker Cloudflare\x1b[0m')
  console.log('─'.repeat(44))

  const { serverId } = parseArgs()
  const prisma = new PrismaClient()

  // 1. Load server from DB
  step('1. Chargement du serveur depuis la base')
  const server = await prisma.mcpServer.findUnique({
    where: { id: serverId },
    select: { id: true, name: true, status: true, runtimeMode: true, endpointUrl: true, apiKey: true },
  })
  await prisma.$disconnect()

  if (!server) fail(`Serveur introuvable en DB (id=${serverId})`)
  if (server.runtimeMode !== 'CLOUDFLARE') fail(`Ce serveur est en mode ${server.runtimeMode}, pas CLOUDFLARE.`)
  if (!server.endpointUrl) fail(`Le serveur n'a pas d'endpointUrl — il n'a peut-être pas encore été déployé.`)

  info(`Serveur  : ${server.name}`)
  info(`Status   : ${server.status}`)
  info(`Endpoint : ${server.endpointUrl}`)

  const baseUrl = server.endpointUrl.replace(/\/$/, '')
  const authHeader = `Bearer ${server.apiKey}`
  let totalLatency = 0

  // 2. GET /health
  step('2. GET /health')
  const health = await timedFetch(`${baseUrl}/health`, { method: 'GET' })
  totalLatency += health.latencyMs

  if (!health.ok) {
    console.log(`\n  \x1b[31m❌ Erreur : GET /health → HTTP ${health.status} (${health.latencyMs}ms)\x1b[0m`)
    console.log(`     Réponse : ${JSON.stringify(health.body)}`)
    process.exit(1)
  }
  ok(`GET /health → ${health.status} (${health.latencyMs}ms)`)
  const healthBody = health.body as Record<string, unknown>
  info(`toolCount = ${healthBody['toolCount'] ?? '?'}`)
  if (Array.isArray(healthBody['tools'])) {
    info(`tools     = [${(healthBody['tools'] as string[]).join(', ')}]`)
  }

  // 3. POST /mcp — initialize
  step('3. POST /mcp — initialize')
  const initRes = await timedFetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cf-test', version: '1.0' } } }),
  })
  totalLatency += initRes.latencyMs

  if (!initRes.ok) {
    console.log(`\n  \x1b[31m❌ Erreur : initialize → HTTP ${initRes.status} (${initRes.latencyMs}ms)\x1b[0m`)
    console.log(`     Réponse : ${JSON.stringify(initRes.body)}`)
    process.exit(1)
  }

  const initBody = initRes.body as McpResponse
  if (initBody.error) fail(`initialize a retourné une erreur : ${JSON.stringify(initBody.error)}`)
  ok(`initialize → ${initRes.status} (${initRes.latencyMs}ms)`)
  const serverInfo = initBody.result?.['serverInfo'] as Record<string, unknown> | undefined
  if (serverInfo) info(`serverInfo = ${JSON.stringify(serverInfo)}`)

  // 4. POST /mcp — tools/list
  step('4. POST /mcp — tools/list')
  const listRes = await timedFetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  })
  totalLatency += listRes.latencyMs

  if (!listRes.ok) {
    console.log(`\n  \x1b[31m❌ Erreur : tools/list → HTTP ${listRes.status} (${listRes.latencyMs}ms)\x1b[0m`)
    console.log(`     Réponse : ${JSON.stringify(listRes.body)}`)
    process.exit(1)
  }

  const listBody = listRes.body as McpResponse
  if (listBody.error) fail(`tools/list a retourné une erreur : ${JSON.stringify(listBody.error)}`)
  ok(`tools/list → ${listRes.status} (${listRes.latencyMs}ms)`)

  const tools = (listBody.result?.['tools'] ?? []) as Array<{ name: string; description?: string }>
  info(`${tools.length} tool(s) retourné(s) :`)
  for (const t of tools) {
    console.log(`    \x1b[2m•\x1b[0m \x1b[1m${t.name}\x1b[0m${t.description ? `  — ${t.description}` : ''}`)
  }

  // Final
  console.log('\n' + '─'.repeat(44))
  console.log(`\x1b[32m\x1b[1m✅ Worker opérationnel\x1b[0m`)
  console.log(`   Latence totale : ${totalLatency}ms`)
  console.log(`   Tools exposés  : ${tools.length}\n`)
}

main().catch((err) => {
  console.error('\n\x1b[31m❌ Erreur :\x1b[0m', err)
  process.exit(1)
})
