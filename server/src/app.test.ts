import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../test/db.js'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import type { Db } from './db/pool.js'
import type { Logger } from './logger.js'

const { db, pool } = createTestDb()
const config = loadConfig({ DATABASE_URL: 'postgres://unused@localhost/unused', NODE_ENV: 'test' })
const silentLogger: Logger = { info: vi.fn(), error: vi.fn() }

afterAll(async () => {
  await pool.end()
})

describe('GET /api/health', () => {
  beforeEach(async () => {
    await truncateAll(db)
  })

  it('returns 200 {status:"ok"} when the test database is reachable', async () => {
    const app = createApp({ db, config, logger: silentLogger })

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('returns 503 when the database query fails', async () => {
    const failingDb: Db = { query: () => Promise.reject(new Error('connection refused')) }
    const app = createApp({ db: failingDb, config, logger: silentLogger })

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable' },
    })
  })
})

describe('app middleware', () => {
  const app = createApp({ db, config, logger: silentLogger })

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist not found' },
    })
  })

  it('rejects malformed JSON bodies with 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_JSON')
  })

  it('rejects JSON bodies over 10kb with 413', async () => {
    const res = await request(app)
      .post('/api/health')
      .send({ data: 'x'.repeat(11 * 1024) })

    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('does not advertise Express', async () => {
    const res = await request(app).get('/api/health')

    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})

describe('truncateAll', () => {
  it('empties application tables', async () => {
    await db.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)`,
      ['someone@example.com', 'Someone', 'not-a-real-hash'],
    )

    await truncateAll(db)

    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM users')
    expect(rows[0]?.count).toBe('0')
  })
})
