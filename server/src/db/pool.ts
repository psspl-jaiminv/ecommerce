import pg from 'pg'
import type { Config } from '../config.js'
import type { Logger } from '../logger.js'

export type QueryRow = Record<string, unknown>

export interface QueryResult<T extends QueryRow> {
  readonly rows: T[]
  readonly rowCount: number | null
}

/**
 * Minimal database abstraction that repositories depend on, so they can be
 * exercised with a fake in unit tests and never touch `pg` directly.
 */
export interface Db {
  query<T extends QueryRow = QueryRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>
}

export function createPool(
  config: Pick<Config, 'databaseUrl'>,
  logger: Logger = console,
): pg.Pool {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  // An idle client can error (e.g. the server restarts). Without a listener
  // the `error` event would crash the process; the pool discards the client.
  pool.on('error', (err) => {
    logger.error('Unexpected error on idle PostgreSQL client', err)
  })
  return pool
}

/** Adapts a `pg.Pool` (or any pg queryable) to the {@link Db} interface. */
export function createDb(pool: Pick<pg.Pool, 'query'>): Db {
  return {
    async query<T extends QueryRow = QueryRow>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<QueryResult<T>> {
      const result = await pool.query<T>(sql, [...params])
      return { rows: result.rows, rowCount: result.rowCount }
    },
  }
}
