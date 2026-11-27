/**
 * Client for the auth endpoints under `/api/auth` (see the README's
 * "Authentication" section). Types mirror the server contract as sent over the
 * wire, so dates are ISO strings.
 */
import { mapResult, request } from './client.ts'
import type { Result } from './client.ts'

export interface PublicUser {
  readonly id: string
  readonly email: string
  readonly name: string
  /** ISO 8601 timestamp. */
  readonly createdAt: string
}

export interface SignupInput {
  readonly name: string
  readonly email: string
  readonly password: string
}

export interface LoginInput {
  readonly email: string
  readonly password: string
}

interface UserBody {
  readonly user: PublicUser
}

const toUser = (body: UserBody): PublicUser => body.user

/** 201 on success; fails with `VALIDATION_ERROR`, `EMAIL_TAKEN` or `RATE_LIMITED`. */
export async function signup(input: SignupInput): Promise<Result<PublicUser>> {
  return mapResult(await request<UserBody>('/api/auth/signup', { method: 'POST', body: input }), toUser)
}

/** Fails with `VALIDATION_ERROR`, `INVALID_CREDENTIALS` or `RATE_LIMITED`. */
export async function login(input: LoginInput): Promise<Result<PublicUser>> {
  return mapResult(await request<UserBody>('/api/auth/login', { method: 'POST', body: input }), toUser)
}

/** Idempotent: succeeds even without a session. */
export async function logout(): Promise<Result<void>> {
  return request<void>('/api/auth/logout', { method: 'POST' })
}

/** The user of the current session, or `UNAUTHENTICATED`. */
export async function me(): Promise<Result<PublicUser>> {
  return mapResult(await request<UserBody>('/api/auth/me'), toUser)
}

/** The auth API as a dependency, so it can be replaced in tests. */
export interface AuthApi {
  readonly signup: typeof signup
  readonly login: typeof login
  readonly logout: typeof logout
  readonly me: typeof me
}

export const authApi: AuthApi = { signup, login, logout, me }
