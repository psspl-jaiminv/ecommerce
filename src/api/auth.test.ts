import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { login, logout, me, signup } from './auth.ts'
import type { PublicUser } from './auth.ts'

const user: PublicUser = {
  id: '6f1c2a4e-8d7b-4c1a-9e2f-3b5d7a9c1e0f',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  createdAt: '2026-11-27T12:00:00.000Z',
}

let fetchMock: Mock<typeof fetch>

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function sentRequest(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0] ?? []
  if (typeof url !== 'string' || !init) throw new Error('fetch was not called with a URL and options')
  return { url, init }
}

describe('auth API', () => {
  it('signup POSTs the input to /api/auth/signup and unwraps the user', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { user }))
    const input = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'password1' }

    expect(await signup(input)).toEqual({ ok: true, data: user })
    const { url, init } = sentRequest()
    expect(url).toBe('/api/auth/signup')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(input))
  })

  it('login POSTs the credentials to /api/auth/login and unwraps the user', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { user }))
    const input = { email: 'ada@example.com', password: 'password1' }

    expect(await login(input)).toEqual({ ok: true, data: user })
    const { url, init } = sentRequest()
    expect(url).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(input))
  })

  it('logout POSTs to /api/auth/logout with a JSON content type and accepts a 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    expect(await logout()).toEqual({ ok: true, data: undefined })
    const { url, init } = sentRequest()
    expect(url).toBe('/api/auth/logout')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('me GETs /api/auth/me and unwraps the user', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { user }))

    expect(await me()).toEqual({ ok: true, data: user })
    const { url, init } = sentRequest()
    expect(url).toBe('/api/auth/me')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('same-origin')
  })

  it('passes server errors through without unwrapping', async () => {
    const error = { code: 'UNAUTHENTICATED', message: 'Authentication required' }
    fetchMock.mockResolvedValue(jsonResponse(401, { error }))

    expect(await me()).toEqual({ ok: false, error })
  })

  it('returns the 409 email-taken error from signup', async () => {
    const error = { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' }
    fetchMock.mockResolvedValue(jsonResponse(409, { error }))

    expect(await signup({ name: 'Ada', email: 'ada@example.com', password: 'password1' })).toEqual({
      ok: false,
      error,
    })
  })
})
