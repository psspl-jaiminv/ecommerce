import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool, type Db } from '../src/db/pool.js'
import { getTestDatabaseUrl } from './env.js'

/**
 * Runs the real migrations up and down inside a throwaway schema, so the
 * shared `public` schema migrated by the global setup is never touched.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url))
const SCHEMA = `migration_test_${randomUUID().replaceAll('-', '')}`
const databaseUrl = getTestDatabaseUrl()

const pool = createPool({ databaseUrl })
const db: Db = createDb(pool)

function migrate(direction: 'up' | 'down'): Promise<unknown> {
  return runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    schema: SCHEMA,
    createSchema: true,
    migrationsTable: 'pgmigrations',
    direction,
    count: Infinity,
    log: () => {},
  })
}

async function tablesInSchema(): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [SCHEMA],
  )
  return rows.map((row) => row.table_name)
}

async function columns(table: string): Promise<Record<string, string>> {
  const { rows } = await db.query<{
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [SCHEMA, table],
  )
  return Object.fromEntries(
    rows.map((row) => [
      row.column_name,
      `${row.data_type} ${row.is_nullable === 'NO' ? 'not null' : 'null'}${
        row.column_default ? ` default ${row.column_default}` : ''
      }`,
    ]),
  )
}

async function indexDefinitions(table: string): Promise<string[]> {
  const { rows } = await db.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
    [SCHEMA, table],
  )
  return rows.map((row) => row.indexdef.replaceAll(`${SCHEMA}.`, ''))
}

/** Runs `fn` inside a transaction pinned to the test schema, then rolls back. */
async function inRolledBackTransaction(fn: (tx: Db) => Promise<void>): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL search_path TO "${SCHEMA}"`)
    await fn(createDb(client))
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
}

beforeAll(async () => {
  await migrate('up')
})

afterAll(async () => {
  await db.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`)
  await pool.end()
})

describe('create_users_and_sessions migration', () => {
  it('creates the users and sessions tables', async () => {
    expect(await tablesInSchema()).toEqual(['pgmigrations', 'sessions', 'users'])
  })

  it('defines the users columns', async () => {
    expect(await columns('users')).toEqual({
      id: 'uuid not null default gen_random_uuid()',
      email: 'text not null',
      name: 'text not null',
      password_hash: 'text not null',
      created_at: 'timestamp with time zone not null default now()',
      updated_at: 'timestamp with time zone not null default now()',
    })
  })

  it('defines the sessions columns', async () => {
    expect(await columns('sessions')).toEqual({
      id_hash: 'bytea not null',
      user_id: 'uuid not null',
      expires_at: 'timestamp with time zone not null',
      created_at: 'timestamp with time zone not null default now()',
    })
  })

  it('indexes users.email uniquely and sessions by user_id and expires_at', async () => {
    const userIndexes = await indexDefinitions('users')
    expect(userIndexes).toContainEqual(expect.stringMatching(/^CREATE UNIQUE INDEX \S+ ON users USING btree \(email\)$/))
    expect(userIndexes).toContainEqual(expect.stringMatching(/^CREATE UNIQUE INDEX \S+ ON users USING btree \(id\)$/))

    const sessionIndexes = await indexDefinitions('sessions')
    expect(sessionIndexes).toContainEqual(expect.stringMatching(/^CREATE UNIQUE INDEX \S+ ON sessions USING btree \(id_hash\)$/))
    expect(sessionIndexes).toContainEqual(expect.stringMatching(/^CREATE INDEX \S+ ON sessions USING btree \(user_id\)$/))
    expect(sessionIndexes).toContainEqual(expect.stringMatching(/^CREATE INDEX \S+ ON sessions USING btree \(expires_at\)$/))
  })

  it('generates user ids and timestamps by default', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; created_at: Date; updated_at: Date }>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         RETURNING id, created_at, updated_at`,
        ['ada@example.com', 'Ada', 'hash'],
      )
      expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(rows[0]?.created_at).toBeInstanceOf(Date)
      expect(rows[0]?.updated_at).toBeInstanceOf(Date)
    })
  })

  it('rejects duplicate emails', async () => {
    await inRolledBackTransaction(async (tx) => {
      const insert = `INSERT INTO users (email, name, password_hash) VALUES ('dup@example.com', 'A', 'h')`
      await tx.query(insert)
      await expect(tx.query(insert)).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('rejects emails that are not lower-cased', async () => {
    await inRolledBackTransaction(async (tx) => {
      await expect(
        tx.query(`INSERT INTO users (email, name, password_hash) VALUES ('Ada@Example.com', 'A', 'h')`),
      ).rejects.toMatchObject({ code: '23514' })
    })
  })

  it('rejects sessions for unknown users', async () => {
    await inRolledBackTransaction(async (tx) => {
      await expect(
        tx.query(
          `INSERT INTO sessions (id_hash, user_id, expires_at)
           VALUES ('\\x01', gen_random_uuid(), now() + interval '1 day')`,
        ),
      ).rejects.toMatchObject({ code: '23503' })
    })
  })

  it('deletes a user’s sessions when the user is deleted', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO users (email, name, password_hash) VALUES ('ada@example.com', 'Ada', 'h') RETURNING id`,
      )
      const userId = rows[0]?.id
      await tx.query(
        `INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ('\\x01', $1, now() + interval '1 day')`,
        [userId],
      )

      await tx.query('DELETE FROM users WHERE id = $1', [userId])

      const remaining = await tx.query<{ count: string }>('SELECT count(*) FROM sessions')
      expect(remaining.rows[0]?.count).toBe('0')
    })
  })

  it('down migration drops both tables and up re-creates them', async () => {
    await migrate('down')
    expect(await tablesInSchema()).toEqual(['pgmigrations'])

    await migrate('up')
    expect(await tablesInSchema()).toEqual(['pgmigrations', 'sessions', 'users'])
  })
})
