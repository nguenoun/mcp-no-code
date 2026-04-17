import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

// ─── Constantes ───────────────────────────────────────────────────────────────

const BCRYPT_COST      = 10
const CLIENT_ID_BYTES  = 16   // 128 bits → ~22 chars base64url
const CLIENT_SECRET_BYTES = 32  // 256 bits → ~43 chars base64url

// ─── Génération ───────────────────────────────────────────────────────────────

/**
 * Génère un client_id public unique.
 * Format : `mcp_cid_<hex>` — lisible et identifiable.
 */
export function generateClientId(): string {
  return `mcp_cid_${randomBytes(CLIENT_ID_BYTES).toString('hex')}`
}

/**
 * Génère un client_secret à afficher UNE SEULE FOIS au créateur.
 * Format : `mcp_sec_<hex>` — préfixe reconnaissable en cas de leak.
 */
export function generateClientSecret(): string {
  return `mcp_sec_${randomBytes(CLIENT_SECRET_BYTES).toString('hex')}`
}

// ─── Hash / verify ────────────────────────────────────────────────────────────

/**
 * Hash le client_secret avant stockage (bcrypt, cost 10).
 */
export async function hashClientSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_COST)
}

/**
 * Vérifie un client_secret en clair contre son hash stocké.
 */
export async function verifyClientSecret(
  secret: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(secret, hash)
}

// ─── Validation des redirect URIs ────────────────────────────────────────────

/**
 * Valide qu'une redirect URI est acceptable :
 * - HTTPS obligatoire en production (sauf localhost pour le dev)
 * - Pas de fragments (#)
 * - URL parseable
 */
export function isValidRedirectUri(uri: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return false
  }

  // Pas de fragment
  if (parsed.hash) return false

  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'

  // En prod : HTTPS uniquement (sauf localhost)
  if (process.env['NODE_ENV'] === 'production' && !isLocalhost) {
    if (parsed.protocol !== 'https:') return false
  } else {
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  }

  return true
}

/**
 * Vérifie qu'une redirect_uri fournie à l'autorisation correspond exactement
 * à l'une des URIs enregistrées pour ce client.
 */
export function matchesRegisteredUri(
  provided: string,
  registered: string[],
): boolean {
  return registered.includes(provided)
}
