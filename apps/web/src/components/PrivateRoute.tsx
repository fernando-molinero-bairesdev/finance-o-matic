import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

/**
 * Wraps protected routes: redirects unauthenticated users to /login.
 * Shows nothing while the initial auth check is in progress.
 */
export default function PrivateRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
