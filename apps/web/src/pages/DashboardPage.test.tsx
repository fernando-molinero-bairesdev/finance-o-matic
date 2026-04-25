import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../features/auth/AuthContext'
import type { AuthContextValue } from '../features/auth/AuthContext'
import { getProcesses } from '../lib/processesApi'
import { getSnapshots } from '../lib/snapshotsApi'
import DashboardPage from './DashboardPage'
import type { ProcessRead } from '../lib/processesApi'
import type { SnapshotRead } from '../lib/snapshotsApi'

vi.mock('../lib/processesApi')
vi.mock('../lib/snapshotsApi')

const mockGetProcesses = vi.mocked(getProcesses)
const mockGetSnapshots = vi.mocked(getSnapshots)

function makeAuthCtx(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: { id: '1', email: 'test@example.com', is_active: true, is_superuser: false, is_verified: true },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  }
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderDashboard(authOverrides: Partial<AuthContextValue> = {}) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx(authOverrides)}>
        <QueryClientProvider client={makeQueryClient()}>
          <DashboardPage />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const baseProcess: ProcessRead = {
  id: 'p1',
  user_id: 'u1',
  name: 'Monthly snapshot',
  cadence: 'monthly',
  concept_scope: 'all',
  is_active: true,
  schedule: null,
  selected_concept_ids: [],
}

const baseSnapshot: SnapshotRead = {
  id: 's1',
  user_id: 'u1',
  date: '2026-04-01',
  label: null,
  trigger: 'manual',
  status: 'complete',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetProcesses.mockResolvedValue([])
  mockGetSnapshots.mockResolvedValue([])
})

describe('DashboardPage', () => {
  it('renders Active Processes and Recent Snapshots section headings', () => {
    renderDashboard()
    expect(screen.getByText('Active Processes')).toBeInTheDocument()
    expect(screen.getByText('Recent Snapshots')).toBeInTheDocument()
  })

  it('shows empty state when there are no active processes', async () => {
    renderDashboard()
    expect(await screen.findByText(/no active processes/i)).toBeInTheDocument()
  })

  it('renders active process name and cadence', async () => {
    mockGetProcesses.mockResolvedValue([baseProcess])
    renderDashboard()
    expect(await screen.findByText('Monthly snapshot')).toBeInTheDocument()
    expect(screen.getByText('(monthly)')).toBeInTheDocument()
  })

  it('shows at most 5 recent snapshots', async () => {
    const snaps: SnapshotRead[] = Array.from({ length: 7 }, (_, i) => ({
      ...baseSnapshot,
      id: `s${i}`,
      date: `2026-0${i + 1}-01`,
    }))
    mockGetSnapshots.mockResolvedValue(snaps)
    renderDashboard()
    await screen.findByText('2026-01-01')
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(screen.queryByText('2026-06-01')).not.toBeInTheDocument()
  })
})
