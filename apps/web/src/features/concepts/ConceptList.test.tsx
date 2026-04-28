import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/AuthContext'
import type { AuthContextValue } from '../auth/AuthContext'
import { getConcepts, deleteConcept } from '../../lib/conceptsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import ConceptList from './ConceptList'

vi.mock('../../lib/conceptsApi')

const mockGetConcepts = vi.mocked(getConcepts)
const mockDeleteConcept = vi.mocked(deleteConcept)

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

function renderConceptList() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx()}>
        <QueryClientProvider client={makeQueryClient()}>
          <ConceptList />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const conceptFixture: ConceptRead = {
  id: 'c1',
  user_id: 'u1',
  name: 'Salary',
  kind: 'value',
  currency_code: 'USD',
  carry_behaviour: 'copy_or_manual',
  literal_value: 5000,
  expression: null,
  group_ids: [],
  aggregate_op: null,
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ConceptList', () => {
  it('renders loading state', () => {
    mockGetConcepts.mockReturnValue(new Promise(() => {}))
    renderConceptList()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders empty state when no concepts', async () => {
    mockGetConcepts.mockResolvedValue([])
    renderConceptList()
    expect(await screen.findByText(/no concepts/i)).toBeInTheDocument()
  })

  it('renders list of concepts', async () => {
    mockGetConcepts.mockResolvedValue([
      conceptFixture,
      { ...conceptFixture, id: 'c2', name: 'Net Income', kind: 'formula', carry_behaviour: 'auto' },
    ])
    renderConceptList()
    expect(await screen.findByText('Salary')).toBeInTheDocument()
    expect(screen.getByText('Net Income')).toBeInTheDocument()
  })

  it('renders error state on fetch failure', async () => {
    mockGetConcepts.mockRejectedValue(new Error('network error'))
    renderConceptList()
    expect(await screen.findByText(/error/i)).toBeInTheDocument()
  })

  it('each concept row has a delete button', async () => {
    mockGetConcepts.mockResolvedValue([conceptFixture])
    renderConceptList()
    expect(await screen.findByRole('button', { name: /delete salary/i })).toBeInTheDocument()
  })

  it('delete button calls deleteConcept with concept id', async () => {
    mockGetConcepts.mockResolvedValue([conceptFixture])
    mockDeleteConcept.mockResolvedValue(undefined)
    // re-mock after delete to return empty list
    mockGetConcepts.mockResolvedValueOnce([conceptFixture]).mockResolvedValue([])
    renderConceptList()
    const btn = await screen.findByRole('button', { name: /delete salary/i })
    await userEvent.click(btn)
    await waitFor(() => expect(mockDeleteConcept).toHaveBeenCalledWith('c1', expect.anything()))
  })
})
