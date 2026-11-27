import { describe, expect, it } from 'vitest'
import { createArgon2PasswordHasher } from './passwordHasher.js'
import { generateSessionToken, hashSessionToken } from './sessionToken.js'

describe('argon2 password hasher', () => {
  const hasher = createArgon2PasswordHasher()

  it('produces salted argon2id hashes that verify only the right password', async () => {
    const [a, b] = await Promise.all([hasher.hash('correct horse'), hasher.hash('correct horse')])

    expect(a).toMatch(/^\$argon2id\$/)
    expect(a).not.toBe(b)
    expect(await hasher.verify(a, 'correct horse')).toBe(true)
    expect(await hasher.verify(a, 'wrong horse')).toBe(false)
  })
})

describe('session tokens', () => {
  it('are 32 random bytes in base64url', () => {
    const token = generateSessionToken()

    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(generateSessionToken()).not.toBe(token)
  })

  it('hash to a deterministic SHA-256 digest', () => {
    expect(hashSessionToken('abc').toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
