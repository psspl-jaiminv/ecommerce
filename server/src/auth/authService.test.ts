import { describe, expect, it, vi } from 'vitest'
import type { Logger } from '../logger.js'
import type { PublicUser } from '../users/user.js'
import type { UserRepository } from '../users/userRepository.js'
import { createAuthService } from './authService.js'
import { EmailTakenError, InvalidCredentialsError } from './errors.js'
import type { PasswordHasher } from './passwordHasher.js'
import type { SessionRepository } from './sessionRepository.js'
import { hashSessionToken } from './sessionToken.js'

const ada: PublicUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'ada@example.com',
  name: 'Ada',
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

/** Reversible fake: `hash(p)` is `fake:p`, so tests can assert what was verified. */
function fakeHasher(): PasswordHasher {
  return {
    hash: vi.fn(async (password: string) => `fake:${password}`),
    verify: vi.fn(async (hash: string, password: string) => hash === `fake:${password}`),
  }
}

function fakeUsers(stored: { user: PublicUser; passwordHash: string } | null = null): UserRepository {
  return {
    findByEmail: vi.fn(async () => stored),
    findById: vi.fn(async () => stored?.user ?? null),
    create: vi.fn(async ({ email, name }) => ({ ...ada, email, name })),
  }
}

function fakeSessions(): SessionRepository {
  return {
    create: vi.fn(async () => {}),
    findValid: vi.fn(async () => null),
    delete: vi.fn(async () => {}),
    deleteExpired: vi.fn(async () => 0),
  }
}

const NOW = new Date('2026-06-01T12:00:00Z')
const TTL_MS = 60_000

function setup(overrides: { users?: UserRepository; sessions?: SessionRepository } = {}) {
  const deps = {
    users: overrides.users ?? fakeUsers(),
    sessions: overrides.sessions ?? fakeSessions(),
    passwordHasher: fakeHasher(),
    logger: { info: vi.fn(), error: vi.fn() } satisfies Logger,
    sessionTtlMs: TTL_MS,
    now: () => NOW,
  }
  return { ...deps, auth: createAuthService(deps) }
}

describe('authService.signup', () => {
  it('stores the hashed password and a hashed session token', async () => {
    const { auth, users, sessions } = setup()

    const result = await auth.signup({ name: 'Ada', email: 'ada@example.com', password: 'secret123' })

    expect(users.create).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      passwordHash: 'fake:secret123',
    })
    expect(result.session.token).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes, base64url
    expect(result.session.expiresAt).toEqual(new Date(NOW.getTime() + TTL_MS))
    expect(sessions.create).toHaveBeenCalledWith(
      ada.id,
      hashSessionToken(result.session.token),
      result.session.expiresAt,
    )
  })

  it('issues a different token per session', async () => {
    const { auth } = setup()
    const input = { name: 'Ada', email: 'ada@example.com', password: 'secret123' }

    const [a, b] = await Promise.all([auth.signup(input), auth.signup(input)])

    expect(a.session.token).not.toBe(b.session.token)
  })

  it('propagates EmailTakenError without creating a session', async () => {
    const users = fakeUsers()
    vi.mocked(users.create).mockRejectedValue(new EmailTakenError())
    const { auth, sessions } = setup({ users })

    await expect(
      auth.signup({ name: 'Ada', email: 'ada@example.com', password: 'secret123' }),
    ).rejects.toBeInstanceOf(EmailTakenError)
    expect(sessions.create).not.toHaveBeenCalled()
  })
})

describe('authService.login', () => {
  const stored = { user: ada, passwordHash: 'fake:secret123' }

  it('returns the user and a new session for the right password', async () => {
    const { auth, sessions } = setup({ users: fakeUsers(stored) })

    const result = await auth.login({ email: ada.email, password: 'secret123' })

    expect(result.user).toBe(ada)
    expect(sessions.create).toHaveBeenCalledOnce()
    expect(sessions.deleteExpired).toHaveBeenCalledOnce()
  })

  it('throws InvalidCredentialsError for a wrong password', async () => {
    const { auth, sessions } = setup({ users: fakeUsers(stored) })

    await expect(auth.login({ email: ada.email, password: 'nope' })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    )
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('still runs a password verification for an unknown email, to equalise timing', async () => {
    const { auth, passwordHasher, sessions } = setup({ users: fakeUsers(null) })

    await expect(auth.login({ email: 'x@example.com', password: 'secret123' })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    )
    expect(passwordHasher.verify).toHaveBeenCalledOnce()
    const [dummyHash, password] = vi.mocked(passwordHasher.verify).mock.calls[0] ?? []
    expect(dummyHash).toMatch(/^fake:/)
    expect(password).toBe('secret123')
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('logs and ignores a failure to prune expired sessions', async () => {
    const sessions = fakeSessions()
    vi.mocked(sessions.deleteExpired).mockRejectedValue(new Error('db hiccup'))
    const { auth, logger } = setup({ users: fakeUsers(stored), sessions })

    await expect(auth.login({ email: ada.email, password: 'secret123' })).resolves.toMatchObject({
      user: ada,
    })
    expect(logger.error).toHaveBeenCalledWith('Failed to delete expired sessions', expect.any(Error))
  })
})

describe('authService sessions', () => {
  it('looks sessions up and deletes them by token hash only', async () => {
    const sessions = fakeSessions()
    vi.mocked(sessions.findValid).mockResolvedValue(ada)
    const { auth } = setup({ sessions })

    expect(await auth.getUserBySessionToken('tok')).toBe(ada)
    await auth.logout('tok')

    expect(sessions.findValid).toHaveBeenCalledWith(hashSessionToken('tok'))
    expect(sessions.delete).toHaveBeenCalledWith(hashSessionToken('tok'))
  })
})
