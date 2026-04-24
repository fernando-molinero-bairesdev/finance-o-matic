import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../features/auth/AuthContext'
import type { AuthContextValue } from '../features/auth/AuthContext'
import { getConcepts, getCurrencies } from '../lib/conceptsApi'
import DashboardPage from './DashboardPage'

vi.mock('../lib/conceptsApi')

const mockGetConcepts = vi.mocked(getConcepts)
const mockGetCurrencies = vi.mocked(getCurrencies)

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

const mockLogout = vi.fn()
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderDashboard(authOverrides: Partial<AuthContextValue> = {}) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx({ logout: mockLogout, ...authOverrides })}>
        <QueryClientProvider client={makeQueryClient()}>
          <DashboardPage />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetConcepts.mockResolvedValue([])
  mockGetCurrencies.mockResolvedValue([])
})

describe('DashboardPage', () => {
  it('shows user email', async () => {
    renderDashboard()
    expect(screen.getByText(/test@example\.com/i)).toBeInTheDocument()
  })

  it('renders concept list', async () => {
    mockGetConcepts.mockResolvedValue([
      { id: 'c1', user_id: 'u1', name: 'Salary', kind: 'value', currency_code: 'USD',
        carry_behaviour: 'copy_or_manual', literal_value: 5000, expression: null,
        parent_group_id: null, aggregate_op: null },
    ])
    renderDashboard()
    expect(await screen.findByText('Salary')).toBeInTheDocument()
  })

  it('add concept button toggles form', async () => {
    renderDashboard()
    const addBtn = screen.getByRole('button', { name: /add concept/i })
    await userEvent.click(addBtn)
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await userEvent.click(cancelBtn)
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })

  it('logout button calls logout and navigates', async () => {
    renderDashboard()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(mockLogout).toHaveBeenCalled()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })
})
