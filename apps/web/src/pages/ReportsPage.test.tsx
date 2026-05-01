import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../features/auth/AuthContext'
import type { AuthContextValue } from '../features/auth/AuthContext'
import { getConcepts, getConceptHistoryBatch } from '../lib/conceptsApi'
import { getSnapshot } from '../lib/snapshotsApi'
import ReportsPage from './ReportsPage'
import type { ConceptRead } from '../lib/conceptsApi'

vi.mock('../lib/conceptsApi')
vi.mock('../lib/snapshotsApi')
vi.mock('../features/charts/MultiConceptChart', () => ({
  default: ({ concepts, dateFrom, dateTo, onDotClick }: {
    concepts: Array<{ id: string; name: string }>
    dateFrom?: string
    dateTo?: string
    onDotClick?: (snapshotId: string, date: string) => void
  }) => (
    <div data-testid="multi-concept-chart" data-concepts={JSON.stringify(concepts.map(c => c.name))}>
      {onDotClick && (
        <button onClick={() => onDotClick('snap-1', '2026-01-01')}>
          Dot
        </button>
      )}
      {dateFrom && <span data-testid="date-from">{dateFrom}</span>}
      {dateTo && <span data-testid="date-to">{dateTo}</span>}
    </div>
  ),
}))
vi.mock('../features/snapshots/SnapshotDetailDrawer', () => ({
  default: ({ snapshotId, onClose }: { snapshotId: string | null; onClose: () => void }) =>
    snapshotId ? (
      <div role="dialog" aria-label="Snapshot detail">
        <span>Snapshot: {snapshotId}</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

const mockGetConcepts = vi.mocked(getConcepts)
const mockGetConceptHistoryBatch = vi.mocked(getConceptHistoryBatch)
const mockGetSnapshot = vi.mocked(getSnapshot)

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

function wrap(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx()}>
        <QueryClientProvider client={makeQueryClient()}>
          {ui}
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const BASE_CONCEPTS: ConceptRead[] = [
  { id: 'c1', user_id: 'u1', name: 'savings', kind: 'value', currency_code: 'USD', literal_value: 1000, carry_behaviour: 'auto', expression: null, entity_type_id: null, aggregate_op: null, group_ids: [] },
  { id: 'c2', user_id: 'u1', name: 'income', kind: 'value', currency_code: 'USD', literal_value: 5000, carry_behaviour: 'auto', expression: null, entity_type_id: null, aggregate_op: null, group_ids: [] },
  { id: 'c3', user_id: 'u1', name: 'aux_concept', kind: 'aux', currency_code: 'USD', literal_value: null, carry_behaviour: 'copy', expression: null, entity_type_id: null, aggregate_op: null, group_ids: [] },
]

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConceptHistoryBatch.mockResolvedValue({})
    mockGetSnapshot.mockResolvedValue({
      id: 'snap-1', user_id: 'u1', date: '2026-01-01', label: null,
      trigger: 'manual', status: 'complete', entries: [], fx_rates: [],
    })
  })

  it('renders empty state when no concepts', async () => {
    mockGetConcepts.mockResolvedValue([])
    wrap(<ReportsPage />)
    await screen.findByText(/no concepts to chart/i)
  })

  it('renders concept checkboxes (excluding aux) in picker', async () => {
    mockGetConcepts.mockResolvedValue(BASE_CONCEPTS)
    wrap(<ReportsPage />)

    // open the picker
    const trigger = await screen.findByRole('button', { name: /savings|1 concept|select/i })
    await userEvent.click(trigger)

    // savings and income should appear, aux_concept should not
    expect(await screen.findByRole('option', { name: /savings/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /income/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /aux_concept/ })).toBeNull()
  })

  it('toggling a checkbox changes the concepts passed to MultiConceptChart', async () => {
    mockGetConcepts.mockResolvedValue(BASE_CONCEPTS)
    wrap(<ReportsPage />)

    // Chart initially has first concept selected
    const chart = await screen.findByTestId('multi-concept-chart')
    const initialConcepts = JSON.parse(chart.getAttribute('data-concepts') ?? '[]')
    expect(initialConcepts).toContain('savings')

    // Open picker and toggle income on
    const trigger = screen.getByRole('button', { name: /savings|income|1 concept/ })
    await userEvent.click(trigger)
    const incomeCheckbox = await screen.findByRole('checkbox', { name: /income/i })
    await userEvent.click(incomeCheckbox)

    await waitFor(() => {
      const updatedConcepts = JSON.parse(
        screen.getByTestId('multi-concept-chart').getAttribute('data-concepts') ?? '[]'
      )
      expect(updatedConcepts).toContain('income')
    })
  })

  it('date inputs pass dateFrom/dateTo to MultiConceptChart', async () => {
    mockGetConcepts.mockResolvedValue(BASE_CONCEPTS)
    wrap(<ReportsPage />)

    await screen.findByTestId('multi-concept-chart')

    const fromInput = screen.getByLabelText(/from date/i)
    await userEvent.type(fromInput, '2026-01-01')

    await waitFor(() => {
      expect(screen.queryByTestId('date-from')).toBeTruthy()
    })
  })

  it('clicking a chart dot opens SnapshotDetailDrawer', async () => {
    mockGetConcepts.mockResolvedValue(BASE_CONCEPTS)
    wrap(<ReportsPage />)

    const dotButton = await screen.findByRole('button', { name: /dot/i })
    await userEvent.click(dotButton)

    const drawer = await screen.findByRole('dialog', { name: /snapshot detail/i })
    expect(drawer).toBeTruthy()
    expect(screen.getByText(/snap-1/)).toBeTruthy()
  })

  it('closing the drawer removes it from the DOM', async () => {
    mockGetConcepts.mockResolvedValue(BASE_CONCEPTS)
    wrap(<ReportsPage />)

    await userEvent.click(await screen.findByRole('button', { name: /dot/i }))
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
