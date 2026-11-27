import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fail } from '../api/client.ts'
import { createFakeAuthApi, renderApp, testUser } from '../test/renderApp.tsx'

async function openSignup(api = createFakeAuthApi()) {
  const view = renderApp('/signup', api)
  await screen.findByRole('heading', { name: 'Create an account' })
  return view
}

const nameInput = () => screen.getByLabelText('Name')
const emailInput = () => screen.getByLabelText('Email')
const passwordInput = () => screen.getByLabelText('Password')
const submitButton = () => screen.getByRole('button', { name: 'Sign up' })

describe('SignupPage', () => {
  it('has labelled inputs with the right autocomplete hints and a link to login', async () => {
    await openSignup()

    expect(nameInput()).toHaveAttribute('autocomplete', 'name')
    expect(emailInput()).toHaveAttribute('autocomplete', 'email')
    expect(passwordInput()).toHaveAttribute('autocomplete', 'new-password')
    expect(passwordInput()).toHaveAccessibleDescription('8–128 characters')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })

  it('rejects a short password without calling the API', async () => {
    const { user, api } = await openSignup()

    await user.type(nameInput(), 'Ada')
    await user.type(emailInput(), 'ada@example.com')
    await user.type(passwordInput(), 'short')
    await user.click(submitButton())

    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
    expect(passwordInput()).toHaveAccessibleDescription(
      'Password must be at least 8 characters 8–128 characters',
    )
    expect(passwordInput()).toHaveFocus()
    expect(api.signup).not.toHaveBeenCalled()
  })

  it('rejects a blank name', async () => {
    const { user, api } = await openSignup()

    await user.type(nameInput(), '   ')
    await user.type(emailInput(), 'ada@example.com')
    await user.type(passwordInput(), 'password1')
    await user.click(submitButton())

    expect(nameInput()).toHaveAccessibleDescription('Name is required')
    expect(api.signup).not.toHaveBeenCalled()
  })

  it('shows the email-taken message under the email field on a 409', async () => {
    const api = createFakeAuthApi()
    api.signup.mockResolvedValue(
      fail({ code: 'EMAIL_TAKEN', message: 'An account with this email already exists' }),
    )
    const { user } = await openSignup(api)

    await user.type(nameInput(), 'Ada')
    await user.type(emailInput(), 'ada@example.com')
    await user.type(passwordInput(), 'password1')
    await user.click(submitButton())

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true')
    expect(emailInput()).toHaveAccessibleDescription('An account with this email already exists')
    expect(emailInput()).toHaveFocus()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })

  it('signs up with trimmed input and navigates home', async () => {
    const { user, api } = await openSignup()

    await user.type(nameInput(), '  Ada Lovelace ')
    await user.type(emailInput(), 'ADA@example.com')
    await user.type(passwordInput(), 'password1')
    await user.click(submitButton())

    expect(await screen.findByText(/Signed in as/)).toHaveTextContent(
      `Signed in as ${testUser.name} (${testUser.email})`,
    )
    expect(api.signup).toHaveBeenCalledExactlyOnceWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password1',
    })
  })
})
