import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import Button from './ui/Button'

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/concepts',  label: 'Concepts' },
  { to: '/processes', label: 'Processes' },
  { to: '/reports',   label: 'Reports' },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-svh flex flex-col bg-[var(--bg)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text-h)]">finance-o-matic</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text)] hidden sm:block">{user?.email}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </div>
        </div>

        <nav aria-label="Main navigation" className="overflow-x-auto border-t border-[var(--border)]">
          <div className="max-w-2xl mx-auto flex px-4">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/dashboard'}
                className={({ isActive }) =>
                  [
                    'shrink-0 px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                    'border-b-2 -mb-px',
                    isActive
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--text)] hover:text-[var(--text-h)]',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-4">
        <Outlet />
      </main>
    </div>
  )
}
