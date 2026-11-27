import { Navigate, Outlet } from 'react-router'
import { useAuth } from './useAuth.ts'

function SessionLoading() {
  return (
    <p className="session-loading" role="status">
      Loading…
    </p>
  )
}

/** Layout route for pages that need a signed-in user; anonymous users go to `/login`. */
export function RequireAuth() {
  const { state } = useAuth()
  switch (state.status) {
    case 'loading':
      return <SessionLoading />
    case 'anonymous':
      return <Navigate to="/login" replace />
    case 'authenticated':
      return <Outlet />
  }
}

/** Layout route for `/login` and `/signup`; signed-in users go to `/`. */
export function RedirectIfAuthenticated() {
  const { state } = useAuth()
  switch (state.status) {
    case 'loading':
      return <SessionLoading />
    case 'authenticated':
      return <Navigate to="/" replace />
    case 'anonymous':
      return <Outlet />
  }
}
