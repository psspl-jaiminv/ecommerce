import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { NETWORK_ERROR_MESSAGE, UNEXPECTED_ERROR_MESSAGE, mapResult, ok, request } from './client.ts'

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

function sentInit(): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1]
  if (!init) throw new Error('fetch was not called with options')
  return init
}

describe('request', () => {
  it('sends same-origin JSON and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { user: { id: '1' } }))

    const result = await request<{ user: { id: string } }>('/api/auth/signup', {
      method: 'POST',
      body: { email: 'a@b.co' },
    })

    expect(result).toEqual({ ok: true, data: { user: { id: '1' } } })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signup', expect.anything())
    const init = sentInit()
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(init.body).toBe('{"email":"a@b.co"}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', Accept: 'application/json' })
  })

  it('declares JSON on bodiless non-GET requests, as the CSRF guard requires', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    const result = await request<void>('/api/auth/logout', { method: 'POST' })

    expect(result).toEqual({ ok: true, data: undefined })
    expect(sentInit().body).toBeUndefined()
    expect(sentInit().headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('sends no Content-Type on GET', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await request('/api/auth/me')

    expect(sentInit().method).toBe('GET')
    expect(sentInit().headers).not.toHaveProperty('Content-Type')
  })

  it('returns the server error, including field messages', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { email: ['Enter a valid email address'] } },
      }),
    )

    expect(await request('/api/auth/login', { method: 'POST', body: {} })).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid', fields: { email: ['Enter a valid email address'] } },
    })
  })

  it('maps a fetch rejection to NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await request('/api/auth/me')).toEqual({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: NETWORK_ERROR_MESSAGE },
    })
  })

  it.each([
    ['a non-JSON error body', new Response('Bad Gateway', { status: 502 })],
    ['an empty error body', new Response(null, { status: 500 })],
    ['an error body of the wrong shape', jsonResponse(500, { message: 'nope' })],
    ['a non-JSON success body', new Response('<html>', { status: 200 })],
  ])('maps %s to UNEXPECTED_RESPONSE', async (_label, response) => {
    fetchMock.mockResolvedValue(response)

    expect(await request('/api/auth/me')).toEqual({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE', message: UNEXPECTED_ERROR_MESSAGE },
    })
  })

  it('never shows internal error details to users', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'relation "users" does not exist' } }),
    )

    expect(await request('/api/auth/me')).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: UNEXPECTED_ERROR_MESSAGE },
    })
  })
})

describe('mapResult', () => {
  it('maps data and passes errors through', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual({ ok: true, data: 4 })
    const failure = { ok: false, error: { code: 'X', message: 'x' } } as const
    expect(mapResult(failure, () => 1)).toBe(failure)
  })
})
