import { EmailTakenError } from '../auth/errors.js'
import type { Db } from '../db/pool.js'
import type { NewUser, PublicUser, UserWithPasswordHash } from './user.js'

export interface UserRepository {
  /** Credential lookup for login: the only query that selects `password_hash`. */
  findByEmail(email: string): Promise<UserWithPasswordHash | null>
  findById(id: string): Promise<PublicUser | null>
  /** Throws {@link EmailTakenError} if the (normalised) email is already registered. */
  create(user: NewUser): Promise<PublicUser>
}

/** Columns that make up a {@link PublicUser}; `password_hash` is deliberately absent. */
export const PUBLIC_USER_COLUMNS = 'id, email, name, created_at'

export type PublicUserRow = {
  id: string
  email: string
  name: string
  created_at: Date
}

export function toPublicUser(row: PublicUserRow): PublicUser {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at }
}

const UNIQUE_VIOLATION = '23505'
const EMAIL_UNIQUE_INDEX = 'users_email_key'

function isEmailUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const { code, constraint } = err as Record<string, unknown>
  return code === UNIQUE_VIOLATION && constraint === EMAIL_UNIQUE_INDEX
}

/** `users.email` has a CHECK (email = lower(email)), so every write and lookup normalises first. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createUserRepository(db: Db): UserRepository {
  return {
    async findByEmail(email) {
      const { rows } = await db.query<PublicUserRow & { password_hash: string }>(
        `SELECT ${PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE email = $1`,
        [normalizeEmail(email)],
      )
      const row = rows[0]
      return row ? { user: toPublicUser(row), passwordHash: row.password_hash } : null
    },

    async findById(id) {
      const { rows } = await db.query<PublicUserRow>(
        `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`,
        [id],
      )
      const row = rows[0]
      return row ? toPublicUser(row) : null
    },

    async create({ email, name, passwordHash }) {
      try {
        const { rows } = await db.query<PublicUserRow>(
          `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
           RETURNING ${PUBLIC_USER_COLUMNS}`,
          [normalizeEmail(email), name, passwordHash],
        )
        const row = rows[0]
        if (!row) throw new Error('INSERT INTO users returned no row')
        return toPublicUser(row)
      } catch (err) {
        if (isEmailUniqueViolation(err)) throw new EmailTakenError({ cause: err })
        throw err
      }
    },
  }
}
