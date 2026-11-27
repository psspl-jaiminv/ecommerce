import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { AuthCard, FormAlert } from '../components/AuthCard.tsx'

type LogoutState = { readonly status: 'idle' } | { readonly status: 'pending' } | { readonly status: 'failed'; readonly message: string }

/** Rendered under `RequireAuth`, so the user is always signed in here. */
export function HomePage() {
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const [logoutState, setLogoutState] = useState<LogoutState>({ status: 'idle' })

  if (state.status !== 'authenticated') return null
  const { user } = state

  const handleLogout = async () => {
    setLogoutState({ status: 'pending' })
    const result = await logout()
    if (result.ok) {
      navigate('/login', { replace: true })
    } else {
      // The session is still valid server-side, so stay signed in and say so.
      setLogoutState({ status: 'failed', message: result.error.message })
    }
  }

  return (
    <AuthCard title="Welcome">
      <FormAlert message={logoutState.status === 'failed' ? logoutState.message : undefined} />
      <p className="signed-in-as">
        Signed in as <strong>{user.name}</strong> ({user.email})
      </p>
      <button type="button" disabled={logoutState.status === 'pending'} onClick={() => void handleLogout()}>
        {logoutState.status === 'pending' ? 'Logging out…' : 'Log out'}
      </button>
    </AuthCard>
  )
}
