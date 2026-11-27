import type { Db } from '../db/pool.js'
import type { PublicUser } from '../users/user.js'
import { type PublicUserRow, toPublicUser } from '../users/userRepository.js'

/** Sessions are keyed by the SHA-256 of their token; raw tokens never reach this layer. */
export interface SessionRepository {
  create(userId: string, tokenHash: Buffer, expiresAt: Date): Promise<void>
  /** The session's user, or `null` if the session is unknown or expired. */
  findValid(tokenHash: Buffer): Promise<PublicUser | null>
  delete(tokenHash: Buffer): Promise<void>
  /** Removes every expired session; resolves to the number deleted. */
  deleteExpired(): Promise<number>
}

export function createSessionRepository(db: Db): SessionRepository {
  return {
    async create(userId, tokenHash, expiresAt) {
      await db.query(
        `INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
        [tokenHash, userId, expiresAt],
      )
    },

    async findValid(tokenHash) {
      const { rows } = await db.query<PublicUserRow>(
        `SELECT u.id, u.email, u.name, u.created_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.id_hash = $1 AND s.expires_at > now()`,
        [tokenHash],
      )
      const row = rows[0]
      return row ? toPublicUser(row) : null
    },

    async delete(tokenHash) {
      await db.query(`DELETE FROM sessions WHERE id_hash = $1`, [tokenHash])
    },

    async deleteExpired() {
      const { rowCount } = await db.query(`DELETE FROM sessions WHERE expires_at <= now()`)
      return rowCount ?? 0
    },
  }
}
