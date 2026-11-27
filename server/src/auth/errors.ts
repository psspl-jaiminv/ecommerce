/**
 * Domain errors raised by the auth layer. They carry no HTTP knowledge; the
 * central error handler maps them to status codes (see `http/domainErrors.ts`).
 */
export abstract class AuthError extends Error {
  abstract readonly code: string
}

export class EmailTakenError extends AuthError {
  readonly code = 'EMAIL_TAKEN'

  constructor(options?: { cause?: unknown }) {
    super('An account with this email already exists', options)
    this.name = 'EmailTakenError'
  }
}

/** Deliberately identical for "unknown email" and "wrong password", so accounts cannot be enumerated. */
export class InvalidCredentialsError extends AuthError {
  readonly code = 'INVALID_CREDENTIALS'

  constructor() {
    super('Invalid email or password')
    this.name = 'InvalidCredentialsError'
  }
}

export class UnauthenticatedError extends AuthError {
  readonly code = 'UNAUTHENTICATED'

  constructor() {
    super('Authentication required')
    this.name = 'UnauthenticatedError'
  }
}
