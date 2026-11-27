import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fail, ok, NETWORK_ERROR_MESSAGE } from '../api/client.ts'
import type { Result } from '../api/client.ts'
import type { PublicUser } from '../api/auth.ts'
import { createFakeAuthApi, deferred, renderApp, testUser } from '../test/renderApp.tsx'

async function openLogin(api = createFakeAuthApi()) {
  const view = renderApp('/login', api)
  await screen.findByRole('heading', { name: 'Log in' })
  return view
}

const emailInput = () => screen.getByLabelText('Email')
const passwordInput = () => screen.getByLabelText('Password')
const submitButton = () => screen.getByRole('button', { name: 'Log in' })

describe('LoginPage', () => {
  it('has labelled inputs with the right autocomplete hints and a link to signup', async () => {
    await openLogin()

    expect(emailInput()).toHaveAttribute('autocomplete', 'email')
    expect(emailInput()).toHaveAttribute('type', 'email')
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password')
    expect(passwordInput()).toHaveAttribute('type', 'password')
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup')
  })

  it('shows inline errors for empty fields without calling the API', async () => {
    const { user, api } = await openLogin()

    await user.click(submitButton())

    expect(emailInput()).toHaveAttribute('aria-invalid', 'true')
    expect(emailInput()).toHaveAccessibleDescription('Email is required')
    expect(passwordInput()).toHaveAccessibleDescription('Password is required')
    expect(emailInput()).toHaveFocus()
    expect(api.login).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without calling the API', async () => {
    const { user, api } = await openLogin()

    await user.type(emailInput(), 'not-an-email')
    await user.type(passwordInput(), 'secret')
    await user.click(submitButton())

    expect(emailInput()).toHaveAccessibleDescription('Enter a valid email address')
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'false')
    expect(api.login).not.toHaveBeenCalled()
  })

  it('clears a field error once the user edits that field', async () => {
    const { user } = await openLogin()

    await user.click(submitButton())
    await user.type(emailInput(), 'a')

    expect(emailInput()).toHaveAttribute('aria-invalid', 'false')
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
  })

  it('logs in with normalised input and navigates home', async () => {
    const { user, api } = await openLogin()

    await user.type(emailInput(), '  Ada@Example.com ')
    await user.type(passwordInput(), ' pass word ')
    await user.click(submitButton())

    expect(await screen.findByText(/Signed in as/)).toHaveTextContent(
      `Signed in as ${testUser.name} (${testUser.email})`,
    )
    expect(api.login).toHaveBeenCalledExactlyOnceWith({ email: 'ada@example.com', password: ' pass word ' })
  })

  it('disables the submit button while the request is in flight', async () => {
    const api = createFakeAuthApi()
    const pending = deferred<Result<PublicUser>>()
    api.login.mockReturnValue(pending.promise)
    const { user } = await openLogin(api)

    await user.type(emailInput(), 'ada@example.com')
    await user.type(passwordInput(), 'password1')
    await user.click(submitButton())

    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled()
    pending.resolve(ok(testUser))
    await screen.findByText(/Signed in as/)
  })

  it('shows "Invalid email or password" on a 401', async () => {
    const api = createFakeAuthApi()
    api.login.mockResolvedValue(fail({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }))
    const { user } = await openLogin(api)

    await user.type(emailInput(), 'ada@example.com')
    await user.type(passwordInput(), 'wrong-password')
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(submitButton()).toBeEnabled()
  })

  it.each([
    ['RATE_LIMITED', 'Too many requests, please try again later'],
    ['NETWORK_ERROR', NETWORK_ERROR_MESSAGE],
  ])('shows a readable message for %s', async (code, message) => {
    const api = createFakeAuthApi()
    api.login.mockResolvedValue(fail({ code, message }))
    const { user } = await openLogin(api)

    await user.type(emailInput(), 'ada@example.com')
    await user.type(passwordInput(), 'password1')
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('shows server field errors under their fields', async () => {
    const api = createFakeAuthApi()
    api.login.mockResolvedValue(
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Request body is invalid',
        fields: { email: ['Enter a valid email address'] },
      }),
    )
    const { user } = await openLogin(api)

    await user.type(emailInput(), 'ada@example.com')
    await user.type(passwordInput(), 'password1')
    await user.click(submitButton())

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(emailInput()).toHaveAccessibleDescription('Enter a valid email address')
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })

  it('redirects a signed-in user to home', async () => {
    const api = createFakeAuthApi()
    api.me.mockResolvedValue(ok(testUser))
    renderApp('/login', api)

    expect(await screen.findByText(/Signed in as/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Log in' })).not.toBeInTheDocument()
  })
})
