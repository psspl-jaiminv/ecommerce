import { randomBytes } from 'node:crypto'
import type { Logger } from '../logger.js'
import type { PublicUser } from '../users/user.js'
import type { UserRepository } from '../users/userRepository.js'
import { InvalidCredentialsError } from './errors.js'
import type { PasswordHasher } from './passwordHasher.js'
import type { LoginInput, SignupInput } from './schemas.js'
import type { SessionRepository } from './sessionRepository.js'
import { generateSessionToken, hashSessionToken } from './sessionToken.js'

export interface IssuedSession {
  /** Raw token for the cookie. Never persist or log it. */
  readonly token: string
  readonly expiresAt: Date
}

export interface AuthResult {
  readonly user: PublicUser
  readonly session: IssuedSession
}

export interface AuthService {
  /** Throws `EmailTakenError` if the email is already registered. */
  signup(input: SignupInput): Promise<AuthResult>
  /** Throws `InvalidCredentialsError` for an unknown email or a wrong password alike. */
  login(input: LoginInput): Promise<AuthResult>
  /** Idempotent: unknown or already-deleted sessions are ignored. */
  logout(token: string): Promise<void>
  getUserBySessionToken(token: string): Promise<PublicUser | null>
}

export interface AuthServiceDeps {
  readonly users: UserRepository
  readonly sessions: SessionRepository
  readonly passwordHasher: PasswordHasher
  readonly sessionTtlMs: number
  readonly logger: Logger
  /** Injectable for tests. */
  readonly now?: () => Date
}

export function createAuthService({
  users,
  sessions,
  passwordHasher,
  sessionTtlMs,
  logger,
  now = () => new Date(),
}: AuthServiceDeps): AuthService {
  // Verified against when the email is unknown, so that path costs the same as a
  // wrong password and response timing does not reveal which emails exist.
  const dummyHash = passwordHasher.hash(randomBytes(32).toString('base64url'))
  // Surface a failure on first use rather than as an unhandled rejection.
  dummyHash.catch(() => {})

  async function issueSession(userId: string): Promise<IssuedSession> {
    const token = generateSessionToken()
    const expiresAt = new Date(now().getTime() + sessionTtlMs)
    await sessions.create(userId, hashSessionToken(token), expiresAt)
    return { token, expiresAt }
  }

  async function pruneExpiredSessions(): Promise<void> {
    try {
      await sessions.deleteExpired()
    } catch (err) {
      // Housekeeping only; never fail a login because of it.
      logger.error('Failed to delete expired sessions', err)
    }
  }

  return {
    async signup({ name, email, password }) {
      const passwordHash = await passwordHasher.hash(password)
      const user = await users.create({ name, email, passwordHash })
      return { user, session: await issueSession(user.id) }
    },

    async login({ email, password }) {
      const found = await users.findByEmail(email)
      if (!found) {
        await passwordHasher.verify(await dummyHash, password)
        throw new InvalidCredentialsError()
      }
      if (!(await passwordHasher.verify(found.passwordHash, password))) {
        throw new InvalidCredentialsError()
      }

      await pruneExpiredSessions()
      return { user: found.user, session: await issueSession(found.user.id) }
    },

    async logout(token) {
      await sessions.delete(hashSessionToken(token))
    },

    getUserBySessionToken(token) {
      return sessions.findValid(hashSessionToken(token))
    },
  }
}
