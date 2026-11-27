import { createHash, randomBytes } from 'node:crypto'

/** 256 bits of entropy, URL-safe. Only ever stored client-side (in the cookie). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 of the token: the only form persisted in `sessions.id_hash`. */
export function hashSessionToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}
