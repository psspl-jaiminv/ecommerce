/**
 * Client-side mirror of the server's auth schemas (server/src/auth/schemas.ts):
 * same limits, same messages, same normalisation. The server stays the source
 * of truth; this only saves a round trip for obviously invalid input.
 */
import type { LoginInput, SignupInput } from '../api/auth.ts'
import { collect } from '../forms/validation.ts'
import type { Validation } from '../forms/validation.ts'

export const NAME_MAX_LENGTH = 100
export const EMAIL_MAX_LENGTH = 254
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

// Same pattern as zod's `z.email()` used by the server.
const EMAIL_PATTERN =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/

export type LoginField = 'email' | 'password'
export type SignupField = 'name' | 'email' | 'password'

export type LoginValues = Record<LoginField, string>
export type SignupValues = Record<SignupField, string>

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

function emailError(raw: string): string | undefined {
  const email = normalizeEmail(raw)
  if (email === '') return 'Email is required'
  if (email.length > EMAIL_MAX_LENGTH) return `Email must be at most ${EMAIL_MAX_LENGTH} characters`
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address'
  return undefined
}

function nameError(raw: string): string | undefined {
  const name = raw.trim()
  if (name === '') return 'Name is required'
  if (name.length > NAME_MAX_LENGTH) return `Name must be at most ${NAME_MAX_LENGTH} characters`
  return undefined
}

// Passwords are never trimmed: whitespace is part of the secret.
function newPasswordError(password: string): string | undefined {
  if (password === '') return 'Password is required'
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  return undefined
}

function currentPasswordError(password: string): string | undefined {
  if (password === '') return 'Password is required'
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  return undefined
}

export function validateLogin(values: LoginValues): Validation<LoginInput, LoginField> {
  return collect(
    { email: emailError(values.email), password: currentPasswordError(values.password) },
    () => ({ email: normalizeEmail(values.email), password: values.password }),
  )
}

export function validateSignup(values: SignupValues): Validation<SignupInput, SignupField> {
  return collect(
    {
      name: nameError(values.name),
      email: emailError(values.email),
      password: newPasswordError(values.password),
    },
    () => ({
      name: values.name.trim(),
      email: normalizeEmail(values.email),
      password: values.password,
    }),
  )
}
