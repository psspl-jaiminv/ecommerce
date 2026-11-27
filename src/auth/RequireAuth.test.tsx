import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PublicUser } from '../api/auth.ts'
import { fail, ok, NETWORK_ERROR_MESSAGE } from '../api/client.ts'
import type { Result } from '../api/client.ts'
import { createFakeAuthApi, deferred, renderApp, testUser } from '../test/renderApp.tsx'

describe('route guards', () => {
  it('shows a loading state while the session is being restored', async () => {
    const api = createFakeAuthApi()
    const session = deferred<Result<PublicUser>>()
    api.me.mockReturnValue(session.promise)
    renderApp('/', api)

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    session.resolve(ok(testUser))
    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument()
  })

  it('redirects anonymous users from / to /login', async () => {
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('treats a failed session check as signed out', async () => {
    const api = createFakeAuthApi()
    api.me.mockResolvedValue(fail({ code: 'NETWORK_ERROR', message: NETWORK_ERROR_MESSAGE }))
    renderApp('/', api)

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('restores the session on load, so a refresh on / stays signed in', async () => {
    const api = createFakeAuthApi()
    api.me.mockResolvedValue(ok(testUser))
    renderApp('/', api)

    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument()
    expect(api.me).toHaveBeenCalled()
  })

  it('redirects signed-in users away from /signup', async () => {
    const api = createFakeAuthApi()
    api.me.mockResolvedValue(ok(testUser))
    renderApp('/signup', api)

    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument()
  })

  it('sends unknown routes to / (and from there to /login when signed out)', async () => {
    renderApp('/does-not-exist')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })
})
