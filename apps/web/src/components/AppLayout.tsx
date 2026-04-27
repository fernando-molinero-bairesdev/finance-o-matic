import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import Button from './ui/Button'

interface NavItem { to: string; label: string }
interface NavGroup { label: string; prefix: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Configuration',
    prefix: '/configuration',
    items: [
      { to: '/configuration/currencies',    label: 'Currencies' },
      { to: '/configuration/concepts',      label: 'Concepts' },
      { to: '/configuration/processes',     label: 'Processes' },
      { to: '/configuration/entity-types',  label: 'Entity Types' },
    ],
  },
  {
    label: 'Data',
    prefix: '/data',
    items: [
      { to: '/data/entities', label: 'Entities' },
    ],
  },
  {
    label: 'Processes',
    prefix: '/processes',
    items: [
      { to: '/processes/snapshots', label: 'Snapshots' },
    ],
  },
  {
    label: 'Reports',
    prefix: '/reports',
    items: [
      { to: '/reports', label: 'Reports' },
    ],
  },
]

const primaryClass = (isActive: boolean) =>
  [
    'shrink-0 px-3 py-2.5 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px',
    isActive
      ? 'border-[var(--accent)] text-[var(--accent)]'
      : 'border-transparent text-[var(--text)] hover:text-[var(--text-h)]',
  ].join(' ')

const secondaryClass = (isActive: boolean) =>
  [
    'shrink-0 px-3 py-2 text-xs font-medium transition-colors duration-150 border-b-2 -mb-px',
    isActive
      ? 'border-[var(--accent)] text-[var(--accent)]'
      : 'border-transparent text-[var(--text)] hover:text-[var(--text-h)]',
  ].join(' ')

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const activeGroup = NAV_GROUPS.find((g) => pathname.startsWith(g.prefix)) ?? NAV_GROUPS[0]

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-svh flex flex-col bg-[var(--bg)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]">
        {/* Logo + user row */}
        <div className="px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text-h)]">finance-o-matic</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text)] hidden sm:block">{user?.email}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>Sign out</Button>
            </div>
          </div>
        </div>

        {/* Primary nav */}
        <nav aria-label="Primary navigation" className="overflow-x-auto border-t border-[var(--border)]">
          <div className="max-w-2xl mx-auto flex px-4">
            {NAV_GROUPS.map((group) => {
              const isActive = pathname.startsWith(group.prefix)
              return (
                <NavLink
                  key={group.prefix}
                  to={group.items[0].to}
                  className={() => primaryClass(isActive)}
                >
                  {group.label}
                </NavLink>
              )
            })}
          </div>
        </nav>

        {/* Secondary nav — only shown when the active group has more than one item */}
        {activeGroup.items.length > 1 && (
          <nav aria-label="Secondary navigation" className="overflow-x-auto border-t border-[var(--border)] bg-[var(--code-bg)]">
            <div className="max-w-2xl mx-auto flex px-4">
              {activeGroup.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) => secondaryClass(isActive)}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-4">
        <Outlet />
      </main>
    </div>
  )
}
