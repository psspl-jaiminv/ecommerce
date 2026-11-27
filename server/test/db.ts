import type pg from 'pg'
import { createDb, createPool, type Db } from '../src/db/pool.js'
import { getTestDatabaseUrl } from './env.js'

/** Tables managed by tooling rather than the app; never truncated. */
const PRESERVED_TABLES = new Set(['pgmigrations'])

export interface TestDb {
  readonly db: Db
  readonly pool: pg.Pool
}

/** Opens a pool on `TEST_DATABASE_URL`. Call `pool.end()` in `afterAll`. */
export function createTestDb(): TestDb {
  const pool = createPool({ databaseUrl: getTestDatabaseUrl() })
  return { pool, db: createDb(pool) }
}

/** Empties every application table in the current schema (FK-safe, resets sequences). */
export async function truncateAll(db: Db): Promise<void> {
  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`,
  )
  const tables = rows
    .map((row) => row.tablename)
    .filter((name) => !PRESERVED_TABLES.has(name))
  if (tables.length === 0) return

  const list = tables.map((name) => `"${name.replaceAll('"', '""')}"`).join(', ')
  await db.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}
