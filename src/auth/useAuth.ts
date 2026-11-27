import { useContext } from 'react'
import { AuthContext } from './authContextValue.ts'
import type { AuthContextValue } from './authContextValue.ts'

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
