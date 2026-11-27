import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createErrorHandler } from '../errors.js'
import { createCsrfGuard } from './csrfGuard.js'

function guardedApp(appOrigin = 'http://localhost:5173/'): Express {
  const app = express()
  app.use(createCsrfGuard({ appOrigin }))
  app.all('/thing', (_req, res) => {
    res.status(204).end()
  })
  app.use(createErrorHandler({ nodeEnv: 'test', logger: { info: vi.fn(), error: vi.fn() } }))
  return app
}

describe('csrfGuard', () => {
  const app = guardedApp()

  it('lets safe methods through without checks', async () => {
    expect((await request(app).get('/thing').set('Origin', 'https://evil.example')).status).toBe(204)
    expect((await request(app).head('/thing')).status).toBe(204)
  })

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'requires a JSON content type for %s',
    async (method) => {
      const res = await request(app)[method]('/thing').set('Content-Type', 'text/plain').send('x')

      expect(res.status).toBe(403)
      expect(res.body).toEqual({
        error: { code: 'CSRF_REJECTED', message: 'Content-Type must be application/json' },
      })
    },
  )

  it('rejects a missing content type', async () => {
    expect((await request(app).post('/thing')).status).toBe(403)
  })

  it('accepts JSON with parameters and in any case', async () => {
    const res = await request(app)
      .post('/thing')
      .set('Content-Type', 'Application/JSON; charset=utf-8')
      .send('{}')

    expect(res.status).toBe(204)
  })

  it('accepts a matching Origin (config trailing slash ignored) and no Origin at all', async () => {
    const json = () => request(app).post('/thing').set('Content-Type', 'application/json')

    expect((await json().set('Origin', 'http://localhost:5173')).status).toBe(204)
    expect((await json()).status).toBe(204)
  })

  it.each(['https://evil.example', 'http://localhost:5174', 'https://localhost:5173', 'null'])(
    'rejects Origin %s',
    async (origin) => {
      const res = await request(app)
        .post('/thing')
        .set('Content-Type', 'application/json')
        .set('Origin', origin)

      expect(res.status).toBe(403)
      expect(res.body.error.message).toBe('Cross-origin request rejected')
    },
  )
})
