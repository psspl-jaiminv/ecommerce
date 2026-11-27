import { createContext } from 'react'
import type { Result } from '../api/client.ts'
import type { LoginInput, PublicUser, SignupInput } from '../api/auth.ts'

export type AuthState =
  /** The session is being restored from the server. */
  | { readonly status: 'loading' }
  | { readonly status: 'authenticated'; readonly user: PublicUser }
  | { readonly status: 'anonymous' }

export interface AuthContextValue {
  readonly state: AuthState
  /** On success the state becomes `authenticated`. */
  readonly login: (input: LoginInput) => Promise<Result<PublicUser>>
  /** On success the state becomes `authenticated`. */
  readonly signup: (input: SignupInput) => Promise<Result<PublicUser>>
  /** On success the state becomes `anonymous`; on failure the session is kept. */
  readonly logout: () => Promise<Result<void>>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
