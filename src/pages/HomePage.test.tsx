import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fail, ok, NETWORK_ERROR_MESSAGE } from '../api/client.ts'
import { createFakeAuthApi, renderApp, testUser } from '../test/renderApp.tsx'

function signedInApi() {
  const api = createFakeAuthApi()
  api.me.mockResolvedValue(ok(testUser))
  return api
}

describe('HomePage', () => {
  it('shows who is signed in', async () => {
    renderApp('/', signedInApi())

    expect(await screen.findByText(/Signed in as/)).toHaveTextContent(
      'Signed in as Ada Lovelace (ada@example.com)',
    )
  })

  it('logs out and returns the user to /login', async () => {
    const { user, api } = renderApp('/', signedInApi())

    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(api.logout).toHaveBeenCalledOnce()
  })

  it('stays signed in and explains why when logout fails', async () => {
    const api = signedInApi()
    api.logout.mockResolvedValue(fail({ code: 'NETWORK_ERROR', message: NETWORK_ERROR_MESSAGE }))
    const { user } = renderApp('/', api)

    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE)
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled()
  })
})
