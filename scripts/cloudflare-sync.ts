#!/usr/bin/env ts-node
/**
 * cloudflare-sync.ts
 *
 * Synchronise l'état DB ↔ Cloudflare (utile après migration ou incident) :
 *   1. Récupère tous les McpServer CLOUDFLARE en DB
 *   2. Pour chaque serveur RUNNING : vérifie si le Worker existe vraiment
 *      → absent : remet status = STOPPED + log anomalie
 *   3. Pour chaque serveur STOPPED : vérifie si un Worker existe quand même
 *      → présent : propose de recréer l'état RUNNING en DB
 *   4. Génère un rapport des incohérences
 *
 * Usage : npm run cf:sync
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as readline from 'readline'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') })

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok     = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m  ${msg}`)
const warn   = (msg: string) => console.log(`  \x1b[33m⚠\x1b[0m  ${msg}`)
const info   = (msg: string) => console.log(`  \x1b[36mℹ\x1b[0m  ${msg}`)
const step   = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`)
const fail   = (msg: string): never => { console.error(`  \x1b[31m✗\x1b[0m  ${msg}`); process.exit(1) }

type CfResponse<T> = { success: boolean; errors: Array<{ code: number; message: string }>; result: T }

async function cfFetch<T>(
  endpoint: string,
  token: string,
  opts: RequestInit = {},
): Promise<{ status: number; ok: boolean; body: CfResponse<T> }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> | undefined),
    },
  })
  const body = (await res.json()) as CfResponse<T>
  return { status: res.status, ok: res.ok, body }
}

function getWorkerName(serverId: string): string {
  return `mcp-${serverId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  }`.slice(0, 63).replace(/-$/, '')
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => { rl.question(question, (a) => { rl.close(); resolve(a.trim()) }) })
}

type Anomaly = {
  serverId: string
  serverName: string
  dbStatus: string
  cfStatus: 'exists' | 'missing'
  action: 'stopped_in_db' | 'running_in_cf'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1mMCPBuilder — Cloudflare Sync\x1b[0m')
  console.log('─'.repeat(44))

  const token     = process.env['CLOUDFLARE_API_TOKEN']
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID']
  if (!token)     fail('CLOUDFLARE_API_TOKEN manquant dans apps/api/.env')
  if (!accountId) fail('CLOUDFLARE_ACCOUNT_ID manquant dans apps/api/.env')

  const prisma = new PrismaClient()

  // 1. Fetch all CLOUDFLARE servers from DB
  step('1. Récupération des serveurs CLOUDFLARE en base')
  const servers = await prisma.mcpServer.findMany({
    where: { runtimeMode: 'CLOUDFLARE' },
    select: { id: true, name: true, status: true, endpointUrl: true },
    orderBy: { createdAt: 'desc' },
  })
  info(`${servers.length} serveur(s) CLOUDFLARE trouvé(s) en DB`)

  if (servers.length === 0) {
    info('Aucun serveur Cloudflare à synchroniser.')
    await prisma.$disconnect()
    process.exit(0)
  }

  // 2. Check each server
  step('2. Vérification de l\'état sur Cloudflare')
  const anomalies: Anomaly[] = []

  for (const server of servers) {
    const workerName = getWorkerName(server.id)
    process.stdout.write(`  Vérification de "${server.name}" (${workerName})… `)

    const res = await cfFetch<Record<string, unknown>>(
      `/accounts/${accountId}/workers/scripts/${workerName}`,
      token,
    )

    const workerExists = res.status !== 404 && res.ok

    if (server.status === 'RUNNING' && !workerExists) {
      console.log('\x1b[31mabsent sur CF\x1b[0m')
      anomalies.push({ serverId: server.id, serverName: server.name, dbStatus: 'RUNNING', cfStatus: 'missing', action: 'stopped_in_db' })
    } else if (server.status === 'STOPPED' && workerExists) {
      console.log('\x1b[33mpresent sur CF (DB=STOPPED)\x1b[0m')
      anomalies.push({ serverId: server.id, serverName: server.name, dbStatus: 'STOPPED', cfStatus: 'exists', action: 'running_in_cf' })
    } else if (server.status === 'ERROR' && workerExists) {
      console.log('\x1b[33mpresent sur CF (DB=ERROR)\x1b[0m')
      anomalies.push({ serverId: server.id, serverName: server.name, dbStatus: 'ERROR', cfStatus: 'exists', action: 'running_in_cf' })
    } else {
      console.log('\x1b[32mok\x1b[0m')
    }
  }

  // 3. Report
  step('3. Rapport des incohérences')
  if (anomalies.length === 0) {
    ok('DB et Cloudflare sont parfaitement synchronisés.')
    await prisma.$disconnect()
    process.exit(0)
  }

  console.log(`\n  \x1b[1m${anomalies.length} incohérence(s) détectée(s)\x1b[0m\n`)

  const toStop = anomalies.filter((a) => a.action === 'stopped_in_db')
  const toResume = anomalies.filter((a) => a.action === 'running_in_cf')

  // Anomaly type A: DB=RUNNING but CF worker missing → fix DB to STOPPED
  if (toStop.length > 0) {
    console.log('  \x1b[31mServeurs marqués RUNNING en DB mais Worker absent sur CF :\x1b[0m')
    for (const a of toStop) {
      console.log(`    • ${a.serverName} (${a.serverId})`)
    }

    const answer = await ask('\n  Mettre ces serveurs à STOPPED en DB ? [oui/non] : ')
    if (answer.toLowerCase() === 'oui') {
      await prisma.mcpServer.updateMany({
        where: { id: { in: toStop.map((a) => a.serverId) } },
        data: { status: 'STOPPED', endpointUrl: null },
      })
      for (const a of toStop) {
        ok(`${a.serverName} → STOPPED`)
      }
    } else {
      warn('Ignoré — ces serveurs restent marqués RUNNING en DB.')
    }
  }

  // Anomaly type B: DB=STOPPED/ERROR but CF worker exists → propose marking as RUNNING
  if (toResume.length > 0) {
    console.log('\n  \x1b[33mWorkers présents sur CF mais serveurs STOPPED/ERROR en DB :\x1b[0m')
    for (const a of toResume) {
      const workerName = getWorkerName(a.serverId)
      const endpointUrl = `https://${workerName}.${process.env['CLOUDFLARE_WORKERS_SUBDOMAIN'] ?? 'unknown'}.workers.dev`
      console.log(`    • ${a.serverName} (${a.serverId}) → ${endpointUrl}`)
    }

    const answer = await ask('\n  Marquer ces serveurs comme RUNNING en DB ? [oui/non] : ')
    if (answer.toLowerCase() === 'oui') {
      for (const a of toResume) {
        const workerName = getWorkerName(a.serverId)
        const endpointUrl = `https://${workerName}.${process.env['CLOUDFLARE_WORKERS_SUBDOMAIN'] ?? ''}.workers.dev`
        await prisma.mcpServer.update({
          where: { id: a.serverId },
          data: { status: 'RUNNING', endpointUrl },
        })
        ok(`${a.serverName} → RUNNING (${endpointUrl})`)
      }
    } else {
      warn('Ignoré — ces entrées DB restent STOPPED/ERROR.')
    }
  }

  // Final report
  console.log('\n' + '─'.repeat(44))
  console.log(`\x1b[1mSynchronisation terminée.\x1b[0m`)
  console.log(`  Anomalies traitées  : ${anomalies.length}`)
  console.log(`  DB → STOPPED        : ${toStop.length}`)
  console.log(`  DB → RUNNING        : ${toResume.length}\n`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('\n\x1b[31mErreur inattendue :\x1b[0m', err)
  process.exit(1)
})
