import { createHash } from 'crypto'

// ─── PKCE — Proof Key for Code Exchange (RFC 7636) ───────────────────────────
//
// Le client génère :
//   code_verifier  = chaîne aléatoire 43-128 chars (base64url sans padding)
//   code_challenge = base64url(SHA-256(code_verifier))
//
// Le serveur reçoit code_challenge à /authorize,
// reçoit code_verifier à /token, et vérifie que les deux correspondent.

/**
 * Vérifie qu'un code_verifier correspond au code_challenge stocké.
 * Utilise la méthode S256 (seule méthode acceptée).
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  storedChallenge: string,
): boolean {
  if (!codeVerifier || !storedChallenge) return false

  const computed = base64urlEncode(
    createHash('sha256').update(codeVerifier).digest(),
  )

  return timingSafeEqual(computed, storedChallenge)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Encode un Buffer en base64url sans padding (RFC 4648 §5).
 */
function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Comparaison en temps constant pour éviter les timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
