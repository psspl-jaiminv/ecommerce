import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'
import { getTestDatabaseUrl } from './env.js'

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

/** Vitest global setup: bring the test database schema up to date once per run. */
export default async function setup(): Promise<void> {
  await runner({
    databaseUrl: getTestDatabaseUrl(),
    dir: MIGRATIONS_DIR,
    migrationsTable: 'pgmigrations',
    direction: 'up',
    count: Infinity,
    advisoryLockMode: 'wait',
    log: () => {},
  })
}
