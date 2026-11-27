import argon2 from 'argon2'

export interface PasswordHasher {
  hash(password: string): Promise<string>
  /** Resolves `false` on mismatch; rejects only if `hash` is malformed. */
  verify(hash: string, password: string): Promise<boolean>
}

/** argon2id with the library's default cost parameters (64 MiB, t=3, p=4). */
export function createArgon2PasswordHasher(): PasswordHasher {
  return {
    hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
    verify: (hash, password) => argon2.verify(hash, password),
  }
}
