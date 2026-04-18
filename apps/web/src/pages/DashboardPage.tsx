import { useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Welcome, {user?.email}!</p>
      <p>Your concepts will appear here once the formula engine is ready (M2).</p>
      <button onClick={handleLogout}>Sign out</button>
    </main>
  )
}
