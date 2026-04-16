#!/usr/bin/env ts-node
/**
 * cloudflare-setup.ts
 *
 * Automatise le setup initial de Cloudflare pour MCPBuilder :
 *   1. Vérifie CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 *   2. Valide le token via GET /user/tokens/verify
 *   3. Crée le namespace KV "MCP_CONFIGS" si non existant
 *   4. Crée le namespace KV "MCP_CONFIGS_PREVIEW" pour le dev
 *   5. Affiche un récapitulatif avec les valeurs à copier dans .env
 *
 * Usage : npm run cf:setup
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// ─── Load env ─────────────────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env') })

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok   = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m  ${msg}`)
const warn = (msg: string) => console.log(`  \x1b[33m⚠\x1b[0m  ${msg}`)
const fail = (msg: string): never => { console.error(`  \x1b[31m✗\x1b[0m  ${msg}`); process.exit(1) }
const info = (msg: string) => console.log(`  \x1b[36mℹ\x1b[0m  ${msg}`)
const step = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`)

type CfResponse<T> = { success: boolean; errors: Array<{ code: number; message: string }>; result: T }

async function cfFetch<T>(
  path: string,
  token: string,
  opts: RequestInit = {},
): Promise<{ status: number; ok: boolean; body: CfResponse<T> }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
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

type KvNamespace = { id: string; title: string }

async function getOrCreateKvNamespace(
  accountId: string,
  token: string,
  title: string,
): Promise<KvNamespace> {
  // List existing namespaces
  const list = await cfFetch<KvNamespace[]>(
    `/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
    token,
  )
  if (!list.ok) {
    fail(
      `Impossible de lister les namespaces KV (HTTP ${list.status}).\n` +
      `  Le token doit avoir la permission "Workers KV Storage:Edit".\n` +
      `  Détail : ${JSON.stringify(list.body.errors)}`,
    )
  }

  const existing = list.body.result.find((ns) => ns.title === title)
  if (existing) {
    ok(`Namespace "${title}" existant — id : ${existing.id}`)
    return existing
  }

  // Create
  info(`Création du namespace KV "${title}"…`)
  const create = await cfFetch<KvNamespace>(
    `/accounts/${accountId}/storage/kv/namespaces`,
    token,
    { method: 'POST', body: JSON.stringify({ title }) },
  )
  if (!create.ok) {
    fail(
      `Impossible de créer le namespace "${title}" (HTTP ${create.status}).\n` +
      `  Détail : ${JSON.stringify(create.body.errors)}`,
    )
  }
  ok(`Namespace "${title}" créé — id : ${create.body.result.id}`)
  return create.body.result
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1mMCPBuilder — Cloudflare Setup\x1b[0m')
  console.log('─'.repeat(44))

  // 1. Check required vars
  step('1. Vérification des variables d\'environnement')
  const token     = process.env['CLOUDFLARE_API_TOKEN']     ?? fail('CLOUDFLARE_API_TOKEN manquant dans apps/api/.env')
  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID']    ?? fail('CLOUDFLARE_ACCOUNT_ID manquant dans apps/api/.env')

  ok(`CLOUDFLARE_ACCOUNT_ID = ${accountId.slice(0, 8)}…`)
  ok(`CLOUDFLARE_API_TOKEN  = ${token.slice(0, 12)}…`)

  // 2. Validate token
  step('2. Validation du token Cloudflare')
  const tokenCheck = await cfFetch<{ id: string; status: string }>(
    '/user/tokens/verify',
    token,
  )
  if (!tokenCheck.ok || tokenCheck.body.result?.status !== 'active') {
    fail(
      `Token invalide ou inactif (HTTP ${tokenCheck.status}).\n` +
      `  Vérifiez CLOUDFLARE_API_TOKEN dans apps/api/.env.\n` +
      `  Détail : ${JSON.stringify(tokenCheck.body.errors)}`,
    )
  }
  ok(`Token actif — id : ${tokenCheck.body.result.id}`)

  // 3. KV namespace "MCP_CONFIGS"
  step('3. Namespace KV — MCP_CONFIGS (production)')
  const kvProd = await getOrCreateKvNamespace(accountId, token, 'MCP_CONFIGS')

  // 4. KV namespace "MCP_CONFIGS_PREVIEW"
  step('4. Namespace KV — MCP_CONFIGS_PREVIEW (développement)')
  const kvPreview = await getOrCreateKvNamespace(accountId, token, 'MCP_CONFIGS_PREVIEW')

  // 5. Workers subdomain
  step('5. Sous-domaine Workers')
  const subRes = await cfFetch<{ subdomain: string }>(
    `/accounts/${accountId}/workers/subdomain`,
    token,
  )
  const subdomain = subRes.ok ? subRes.body.result?.subdomain : process.env['CLOUDFLARE_WORKERS_SUBDOMAIN']
  if (subdomain) {
    ok(`Sous-domaine : ${subdomain}.workers.dev`)
  } else {
    warn('Impossible de détecter le sous-domaine Workers. Renseignez CLOUDFLARE_WORKERS_SUBDOMAIN manuellement.')
  }

  // 6. Summary
  const envPath = path.resolve(__dirname, '../apps/api/.env')
  console.log('\n' + '─'.repeat(44))
  console.log('\x1b[32m\x1b[1m✓ Setup terminé !\x1b[0m')
  console.log('\nAjoutez (ou mettez à jour) ces variables dans \x1b[1mapps/api/.env\x1b[0m :\n')
  console.log(`  CLOUDFLARE_ACCOUNT_ID=${accountId}`)
  console.log(`  CLOUDFLARE_KV_NAMESPACE_ID=${kvProd.id}`)
  console.log(`  CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID=${kvPreview.id}`)
  if (subdomain) console.log(`  CLOUDFLARE_WORKERS_SUBDOMAIN=${subdomain}`)

  // Auto-patch .env if the file exists
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf8')
    const patch: Record<string, string> = {
      CLOUDFLARE_KV_NAMESPACE_ID: kvProd.id,
      CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID: kvPreview.id,
      ...(subdomain ? { CLOUDFLARE_WORKERS_SUBDOMAIN: subdomain } : {}),
    }
    for (const [k, v] of Object.entries(patch)) {
      const re = new RegExp(`^${k}=.*$`, 'm')
      content = re.test(content) ? content.replace(re, `${k}=${v}`) : content + `\n${k}=${v}`
    }
    fs.writeFileSync(envPath, content)
    info('apps/api/.env mis à jour automatiquement.')
  }

  console.log('\nRelancez le serveur pour appliquer les changements :\n  npm run dev\n')
}

main().catch((err) => {
  console.error('\n\x1b[31mErreur inattendue :\x1b[0m', err)
  process.exit(1)
})
