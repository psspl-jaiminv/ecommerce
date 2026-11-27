import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi as defaultAuthApi } from '../api/auth.ts'
import type { AuthApi, LoginInput, SignupInput } from '../api/auth.ts'
import { AuthContext } from './authContextValue.ts'
import type { AuthContextValue, AuthState } from './authContextValue.ts'

interface AuthProviderProps {
  readonly children: ReactNode
  /** Defaults to the real HTTP client; tests inject a fake. */
  readonly api?: AuthApi
}

/** Restores the session via `me()` on mount and owns the signed-in user. */
export function AuthProvider({ children, api = defaultAuthApi }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    void api.me().then((result) => {
      if (!active) return
      // Any failure (no session, server down) leaves the user signed out; the
      // login form then surfaces errors such as network failures itself.
      setState(result.ok ? { status: 'authenticated', user: result.data } : { status: 'anonymous' })
    })
    return () => {
      active = false
    }
  }, [api])

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await api.login(input)
      if (result.ok) setState({ status: 'authenticated', user: result.data })
      return result
    },
    [api],
  )

  const signup = useCallback(
    async (input: SignupInput) => {
      const result = await api.signup(input)
      if (result.ok) setState({ status: 'authenticated', user: result.data })
      return result
    },
    [api],
  )

  const logout = useCallback(async () => {
    const result = await api.logout()
    if (result.ok) setState({ status: 'anonymous' })
    return result
  }, [api])

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, signup, logout }),
    [state, login, signup, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
