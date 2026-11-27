import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, testUser } from './test/renderApp.tsx'

describe('auth journey', () => {
  it('signs up, lands on home, logs out and logs back in', async () => {
    const { user, api } = renderApp('/signup')

    await screen.findByRole('heading', { name: 'Create an account' })
    await user.type(screen.getByLabelText('Name'), testUser.name)
    await user.type(screen.getByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText(/Signed in as/)).toHaveTextContent(
      `Signed in as ${testUser.name} (${testUser.email})`,
    )

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByRole('heading', { name: 'Log in' })
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument()
    expect(api.signup).toHaveBeenCalledOnce()
    expect(api.logout).toHaveBeenCalledOnce()
    expect(api.login).toHaveBeenCalledExactlyOnceWith({ email: testUser.email, password: 'password1' })
  })

  it('moves between the login and signup pages through their links', async () => {
    const { user } = renderApp('/login')

    await user.click(await screen.findByRole('link', { name: 'Sign up' }))
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Log in' }))
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })
})
