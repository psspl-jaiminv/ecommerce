import type { Express } from 'express'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../test/db.js'
import { createApp } from '../app.js'
import { loadConfig } from '../config.js'
import type { Logger } from '../logger.js'
import { hashSessionToken } from './sessionToken.js'

const { db, pool } = createTestDb()
const APP_ORIGIN = 'http://localhost:5173'
const baseEnv = {
  DATABASE_URL: 'postgres://unused@localhost/unused',
  NODE_ENV: 'test',
  APP_ORIGIN,
  AUTH_RATE_LIMIT_MAX: '0',
}
const silentLogger: Logger = { info: vi.fn(), error: vi.fn() }

function buildApp(env: Record<string, string> = {}): Express {
  return createApp({ db, config: loadConfig({ ...baseEnv, ...env }), logger: silentLogger })
}

const app = buildApp()

const ada = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct horse battery' }

function setCookieHeaders(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as string[] | string | undefined
  return header === undefined ? [] : Array.isArray(header) ? header : [header]
}

function sidCookie(res: request.Response): string | undefined {
  return setCookieHeaders(res).find((cookie) => cookie.startsWith('sid='))
}

function sidValue(res: request.Response): string {
  const value = sidCookie(res)?.split(';', 1)[0]?.slice('sid='.length)
  if (!value) throw new Error('response did not set a sid cookie')
  return value
}

const signup = (body: object = ada) => request(app).post('/api/auth/signup').send(body)
const login = (body: object) => request(app).post('/api/auth/login').send(body)
const me = (sid?: string) => {
  const req = request(app).get('/api/auth/me')
  return sid === undefined ? req : req.set('Cookie', `sid=${sid}`)
}

beforeEach(async () => {
  await truncateAll(db)
})

afterAll(async () => {
  await pool.end()
})

describe('POST /api/auth/signup', () => {
  it('creates the user, returns 201 { user } and sets an httpOnly SameSite=Lax sid cookie', async () => {
    const res = await signup({ ...ada, email: '  Ada@Example.COM ', name: '  Ada Lovelace  ' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      user: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        createdAt: expect.any(String),
      },
    })
    expect(JSON.stringify(res.body)).not.toMatch(/password/i)
    expect(res.headers['cache-control']).toBe('no-store')

    const cookie = sidCookie(res)
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(/; HttpOnly/i)
    expect(cookie).toMatch(/; SameSite=Lax/i)
    expect(cookie).toMatch(/; Path=\//)
    expect(cookie).toMatch(/; Max-Age=604800/) // SESSION_TTL_DAYS default: 7
    expect(cookie).not.toMatch(/; Secure/i) // only in production
  })

  it('stores a lower-cased email and an argon2id hash, never the plaintext password', async () => {
    await signup({ ...ada, email: 'ADA@example.com' })

    const { rows } = await db.query<{ email: string; password_hash: string }>(
      'SELECT email, password_hash FROM users',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.email).toBe('ada@example.com')
    expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$/)
    expect(rows[0]?.password_hash).not.toContain(ada.password)
  })

  it('stores only the SHA-256 of the session token, never the cookie value', async () => {
    const res = await signup()
    const token = sidValue(res)

    const { rows } = await db.query<{ id_hash: Buffer }>('SELECT id_hash FROM sessions')
    expect(rows).toHaveLength(1)
    const stored = rows[0]?.id_hash
    expect(stored?.equals(hashSessionToken(token))).toBe(true)
    expect(stored?.toString('base64url')).not.toBe(token)
    expect(stored?.toString('utf8')).not.toBe(token)
  })

  it('returns 409 EMAIL_TAKEN for an email already registered in a different case', async () => {
    await signup()

    const res = await signup({ ...ada, email: 'ADA@EXAMPLE.COM' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
    })
    expect(sidCookie(res)).toBeUndefined()
  })

  it('returns 400 VALIDATION_ERROR with per-field messages', async () => {
    const res = await signup({ name: '   ', email: 'not-an-email', password: 'short' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.message).toEqual(expect.any(String))
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name', 'password'])
    expect(res.body.error.fields.password).toEqual(['Password must be at least 8 characters'])
    expect(JSON.stringify(res.body)).not.toContain('short') // input is never echoed back
  })

  it('rejects over-long fields', async () => {
    const res = await signup({
      name: 'x'.repeat(101),
      email: `${'a'.repeat(250)}@x.io`,
      password: 'p'.repeat(129),
    })

    expect(res.status).toBe(400)
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name', 'password'])
  })

  it('returns 400 when the body is missing', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Content-Type', 'application/json')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', fields: {} })
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await signup()
  })

  it('returns 200 { user } and a new session cookie for valid credentials', async () => {
    const res = await login({ email: ' ADA@example.com', password: ada.password })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      user: expect.objectContaining({ email: 'ada@example.com', name: 'Ada Lovelace' }),
    })
    expect(JSON.stringify(res.body)).not.toMatch(/password/i)

    const meRes = await me(sidValue(res))
    expect(meRes.status).toBe(200)
    expect(meRes.body.user.email).toBe('ada@example.com')
  })

  it('returns an identical 401 for a wrong password and an unknown email', async () => {
    const wrongPassword = await login({ email: ada.email, password: 'wrong password!' })
    const unknownEmail = await login({ email: 'nobody@example.com', password: ada.password })

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(wrongPassword.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    })
    expect(unknownEmail.body).toEqual(wrongPassword.body)
    expect(sidCookie(wrongPassword)).toBeUndefined()
    expect(sidCookie(unknownEmail)).toBeUndefined()
  })

  it('returns 400 with field errors for invalid input', async () => {
    const res = await login({ email: 'nope', password: '' })

    expect(res.status).toBe(400)
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'password'])
  })

  it('deletes expired sessions on successful login', async () => {
    await db.query(`UPDATE sessions SET expires_at = now() - interval '1 second'`)

    await login({ email: ada.email, password: ada.password })

    const { rows } = await db.query<{ count: string }>(
      'SELECT count(*) FROM sessions WHERE expires_at <= now()',
    )
    expect(rows[0]?.count).toBe('0')
  })
})

describe('GET /api/auth/me', () => {
  it('returns 200 { user } for a valid session cookie', async () => {
    const created = await signup()

    const res = await me(sidValue(created))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ user: created.body.user })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['unknown', 'not-a-real-session-token'],
  ])('returns 401 UNAUTHENTICATED when the cookie is %s', async (_label, sid) => {
    await signup()

    const res = await me(sid)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    })
  })

  it('returns 401 when the session has expired', async () => {
    const sid = sidValue(await signup())
    await db.query(`UPDATE sessions SET expires_at = now() - interval '1 second'`)

    const res = await me(sid)

    expect(res.status).toBe(401)
  })

  it('returns 401 when the stored token hash is replayed as the cookie', async () => {
    await signup()
    const { rows } = await db.query<{ id_hash: Buffer }>('SELECT id_hash FROM sessions')
    const storedHash = rows[0]?.id_hash
    if (!storedHash) throw new Error('signup did not create a session')

    for (const encoding of ['base64url', 'hex'] as const) {
      expect((await me(storedHash.toString(encoding))).status).toBe(401)
    }
  })
})

describe('POST /api/auth/logout', () => {
  const logout = (sid?: string) => {
    const req = request(app).post('/api/auth/logout').set('Content-Type', 'application/json')
    return sid === undefined ? req : req.set('Cookie', `sid=${sid}`)
  }

  it('deletes the session, clears the cookie and invalidates it for /me', async () => {
    const sid = sidValue(await signup())

    const res = await logout(sid)

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expect(sidCookie(res)).toMatch(/^sid=;.*Expires=Thu, 01 Jan 1970/)
    expect(sidCookie(res)).toMatch(/; HttpOnly/i)
    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM sessions')
    expect(rows[0]?.count).toBe('0')
    expect((await me(sid)).status).toBe(401)
  })

  it('only ends the current session', async () => {
    const first = sidValue(await signup())
    const second = sidValue(await login({ email: ada.email, password: ada.password }))

    await logout(first)

    expect((await me(first)).status).toBe(401)
    expect((await me(second)).status).toBe(200)
  })

  it('is idempotent: 204 without a cookie and for an already-ended session', async () => {
    const sid = sidValue(await signup())
    await logout(sid)

    expect((await logout(sid)).status).toBe(204)
    expect((await logout()).status).toBe(204)
  })
})

describe('CSRF guard', () => {
  it('rejects a cross-origin POST with 403 before touching the database', async () => {
    const res = await signup().set('Origin', 'https://evil.example.com')

    expect(res.status).toBe(403)
    expect(res.body).toEqual({
      error: { code: 'CSRF_REJECTED', message: 'Cross-origin request rejected' },
    })
    const { rows } = await db.query<{ count: string }>('SELECT count(*) FROM users')
    expect(rows[0]?.count).toBe('0')
  })

  it('accepts a POST from the app origin', async () => {
    const res = await signup().set('Origin', APP_ORIGIN)

    expect(res.status).toBe(201)
  })

  it('rejects a form-encoded POST with 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .type('form')
      .send({ email: ada.email, password: ada.password })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('CSRF_REJECTED')
  })

  it('rejects a logout without a JSON content type, keeping the session alive', async () => {
    const sid = sidValue(await signup())

    const res = await request(app).post('/api/auth/logout').set('Cookie', `sid=${sid}`)

    expect(res.status).toBe(403)
    expect((await me(sid)).status).toBe(200)
  })

  it('rejects a cross-origin logout with 403, keeping the session alive', async () => {
    const sid = sidValue(await signup())

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json')
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', `sid=${sid}`)

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('CSRF_REJECTED')
    expect(sidCookie(res)).toBeUndefined()
    expect((await me(sid)).status).toBe(200)
  })
})

describe('rate limiting', () => {
  it('returns 429 RATE_LIMITED once the per-IP limit is exceeded', async () => {
    const limited = buildApp({ AUTH_RATE_LIMIT_MAX: '2' })
    const attempt = () =>
      request(limited).post('/api/auth/login').send({ email: ada.email, password: 'whatever!' })

    expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(401)
    const blocked = await attempt()

    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
    })
    expect(blocked.headers['retry-after']).toBeDefined()
  })

  it('limits signup independently of login', async () => {
    const limited = buildApp({ AUTH_RATE_LIMIT_MAX: '1' })

    expect((await request(limited).post('/api/auth/signup').send(ada)).status).toBe(201)
    expect((await request(limited).post('/api/auth/signup').send(ada)).status).toBe(429)
    expect(
      (await request(limited).post('/api/auth/login').send({ email: ada.email, password: ada.password }))
        .status,
    ).toBe(200)
  })

  it('does not limit /me', async () => {
    const limited = buildApp({ AUTH_RATE_LIMIT_MAX: '1' })

    for (let i = 0; i < 3; i += 1) {
      expect((await request(limited).get('/api/auth/me')).status).toBe(401)
    }
  })
})

describe('production cookies', () => {
  it('marks the sid cookie Secure when NODE_ENV=production', async () => {
    const prod = buildApp({ NODE_ENV: 'production' })

    const res = await request(prod).post('/api/auth/signup').send(ada)

    expect(sidCookie(res)).toMatch(/; Secure/i)
  })
})

describe('logging', () => {
  it('never logs passwords or session tokens, even when a request fails', async () => {
    const logger: Logger = { info: vi.fn(), error: vi.fn() }
    const failing = createApp({
      db,
      config: loadConfig(baseEnv),
      logger,
      passwordHasher: {
        hash: () => Promise.reject(new Error('hasher down')),
        verify: () => Promise.resolve(false),
      },
    })

    const res = await request(failing).post('/api/auth/signup').send(ada)

    expect(res.status).toBe(500)
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls, (_key, value: unknown) =>
      value instanceof Error ? `${value.message}` : value,
    )
    expect(logged).not.toContain(ada.password)
  })
})
