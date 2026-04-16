#!/usr/bin/env ts-node
/**
 * cloudflare-cleanup.ts
 *
 * Supprime tous les Workers MCPBuilder d'un compte Cloudflare (reset dev) :
 *   1. Liste tous les Workers avec le préfixe "mcp-"
 *   2. Demande confirmation interactive
 *   3. Supprime chacun via l'API Cloudflare
 *   4. Met McpServer.status = STOPPED en base
 *
 * Usage : npm run cf:cleanup
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as readline from 'readline'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') })

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok   = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m  ${msg}`)
const fail = (msg: string): never => { console.error(`  \x1b[31m✗\x1b[0m  ${msg}`); process.exit(1) }
const info = (msg: string) => console.log(`  \x1b[36mℹ\x1b[0m  ${msg}`)
const step = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`)

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

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1mMCPBuilder — Cloudflare Cleanup\x1b[0m')
  console.log('─'.repeat(44))

  const token     = process.env['CLOUDFLARE_API_TOKEN']
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID']
  if (!token)     fail('CLOUDFLARE_API_TOKEN manquant dans apps/api/.env')
  if (!accountId) fail('CLOUDFLARE_ACCOUNT_ID manquant dans apps/api/.env')

  // 1. List Workers with "mcp-" prefix
  step('1. Récupération des Workers MCPBuilder')
  const listRes = await cfFetch<Array<{ id: string; etag: string }>>(
    `/accounts/${accountId}/workers/scripts?per_page=100`,
    token,
  )
  if (!listRes.ok) {
    fail(`Impossible de lister les Workers (HTTP ${listRes.status}) : ${JSON.stringify(listRes.body.errors)}`)
  }

  const mcpWorkers = listRes.body.result.filter((w) => w.id.startsWith('mcp-'))
  if (mcpWorkers.length === 0) {
    info('Aucun Worker MCPBuilder trouvé sur ce compte.')
    process.exit(0)
  }

  console.log(`\n  Trouvé \x1b[1m${mcpWorkers.length}\x1b[0m Worker(s) :\n`)
  for (const w of mcpWorkers) {
    console.log(`    • ${w.id}`)
  }

  // 2. Confirmation
  step('2. Confirmation')
  console.log('\n  \x1b[33m⚠  Cette action est irréversible.\x1b[0m')
  const answer = await ask('\n  Supprimer tous ces Workers ? [oui/non] : ')
  if (answer.toLowerCase() !== 'oui') {
    info('Annulé.')
    process.exit(0)
  }

  // 3. Delete Workers
  step('3. Suppression des Workers')
  const prisma = new PrismaClient()
  let deleted = 0
  let failed  = 0

  for (const worker of mcpWorkers) {
    const workerName = worker.id

    // Delete from Cloudflare
    const delRes = await cfFetch<Record<string, unknown>>(
      `/accounts/${accountId}/workers/scripts/${workerName}`,
      token,
      { method: 'DELETE' },
    )

    if (delRes.ok || delRes.status === 404) {
      ok(`Worker supprimé : ${workerName}`)
      deleted++
    } else {
      console.error(`  \x1b[31m✗\x1b[0m  Échec suppression ${workerName} (HTTP ${delRes.status})`)
      failed++
      continue
    }

    // 4. Update DB — extract serverId from worker name (format: mcp-<serverId>)
    const serverId = workerName.replace(/^mcp-/, '')
    try {
      const updated = await prisma.mcpServer.updateMany({
        where: { id: { startsWith: serverId.slice(0, 8) }, status: { not: 'STOPPED' } },
        data: { status: 'STOPPED', endpointUrl: null },
      })
      if (updated.count > 0) {
        info(`DB mise à jour : ${updated.count} serveur(s) → STOPPED`)
      }
    } catch {
      // Worker name → DB ID mapping is best-effort since IDs are sanitized
    }
  }

  await prisma.$disconnect()

  // Summary
  console.log('\n' + '─'.repeat(44))
  console.log(`\x1b[1mRécapitulatif :\x1b[0m  ${deleted} supprimé(s)  /  ${failed} erreur(s)\n`)
}

main().catch((err) => {
  console.error('\n\x1b[31mErreur inattendue :\x1b[0m', err)
  process.exit(1)
})
