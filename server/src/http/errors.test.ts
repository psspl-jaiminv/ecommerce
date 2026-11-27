import express, { type Express } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import {
  EmailTakenError,
  InvalidCredentialsError,
  UnauthenticatedError,
} from '../auth/errors.js'
import type { NodeEnv } from '../config.js'
import type { Logger } from '../logger.js'
import { createErrorHandler, HttpError, notFoundHandler, ValidationError } from './errors.js'

function appThatThrows(error: unknown, nodeEnv: NodeEnv, logger: Logger): Express {
  const app = express()
  app.get('/boom', () => {
    throw error
  })
  app.use(notFoundHandler)
  app.use(createErrorHandler({ nodeEnv, logger }))
  return app
}

const fakeLogger = (): Logger => ({ info: vi.fn(), error: vi.fn() })

describe('createErrorHandler', () => {
  it('sends HttpError status, code and message', async () => {
    const logger = fakeLogger()
    const app = appThatThrows(new HttpError(409, 'CONFLICT', 'Already exists'), 'production', logger)

    const res = await request(app).get('/boom')

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'Already exists' } })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('hides unexpected error details and stacks in production', async () => {
    const logger = fakeLogger()
    const app = appThatThrows(new Error('password=hunter2 leaked'), 'production', logger)

    const res = await request(app).get('/boom')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })
    expect(res.text).not.toContain('hunter2')
    expect(res.text).not.toContain('at ')
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('shows the message, but never the stack, outside production', async () => {
    const app = appThatThrows(new Error('db exploded'), 'development', fakeLogger())

    const res = await request(app).get('/boom')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'db exploded' } })
  })

  it('handles non-Error throwables', async () => {
    const app = appThatThrows('just a string', 'development', fakeLogger())

    const res = await request(app).get('/boom')

    expect(res.status).toBe(500)
    expect(res.body.error.message).toBe('Internal server error')
  })

  it('passes through exposable 4xx errors from Express middleware', async () => {
    const clientError = Object.assign(new Error('Bad thing'), { status: 400, expose: true })
    const app = appThatThrows(clientError, 'production', fakeLogger())

    const res = await request(app).get('/boom')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Bad thing' } })
  })

  it('treats non-exposable errors with a status as internal errors', async () => {
    const hidden = Object.assign(new Error('internal detail'), { status: 400, expose: false })
    const app = appThatThrows(hidden, 'production', fakeLogger())

    const res = await request(app).get('/boom')

    expect(res.status).toBe(500)
    expect(res.body.error.message).toBe('Internal server error')
  })
})

describe('createErrorHandler domain and validation errors', () => {
  it.each([
    [new EmailTakenError(), 409, 'EMAIL_TAKEN'],
    [new InvalidCredentialsError(), 401, 'INVALID_CREDENTIALS'],
    [new UnauthenticatedError(), 401, 'UNAUTHENTICATED'],
  ])('maps %s to its status and code without logging', async (error, status, code) => {
    const logger = fakeLogger()
    const app = appThatThrows(error, 'production', logger)

    const res = await request(app).get('/boom')

    expect(res.status).toBe(status)
    expect(res.body).toEqual({ error: { code, message: error.message } })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('includes per-field messages for ValidationError', async () => {
    const fields = { email: ['Enter a valid email address'] }
    const app = appThatThrows(new ValidationError('Invalid body', fields), 'production', fakeLogger())

    const res = await request(app).get('/boom')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid body', fields },
    })
  })
})

describe('notFoundHandler', () => {
  it('responds with a NOT_FOUND error body', async () => {
    const app = appThatThrows(new Error('unused'), 'production', fakeLogger())

    const res = await request(app).delete('/missing')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route DELETE /missing not found' },
    })
  })
})
