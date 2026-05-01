import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getConceptHistoryBatch } from '../../lib/conceptsApi'
import MultiConceptChart from './MultiConceptChart'

vi.mock('../../lib/conceptsApi')
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  }
})

const mockGetBatch = vi.mocked(getConceptHistoryBatch)

const CONCEPTS = [
  { id: 'c1', name: 'savings' },
  { id: 'c2', name: 'income' },
]

function makeHistory(conceptId: string, dates: string[], baseValue: number) {
  return dates.map((date, i) => ({
    snapshot_id: `snap-${conceptId}-${i}`,
    date,
    value: baseValue + i * 100,
    currency_code: 'USD',
  }))
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('MultiConceptChart', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders loading state while fetching', () => {
    mockGetBatch.mockReturnValue(new Promise(() => {}))
    wrap(<MultiConceptChart concepts={CONCEPTS} />)
    // Loading skeleton
    const el = document.querySelector('.animate-pulse')
    expect(el).toBeTruthy()
  })

  it('shows not-enough-data message with only 1 snapshot date', async () => {
    mockGetBatch.mockResolvedValue({
      c1: makeHistory('c1', ['2026-01-01'], 1000),
      c2: makeHistory('c2', ['2026-01-01'], 5000),
    })
    wrap(<MultiConceptChart concepts={CONCEPTS} />)
    const msg = await screen.findByText(/not enough data/i)
    expect(msg).toBeTruthy()
  })

  it('renders chart with lines for each concept', async () => {
    const dates = ['2026-01-01', '2026-02-01', '2026-03-01']
    mockGetBatch.mockResolvedValue({
      c1: makeHistory('c1', dates, 1000),
      c2: makeHistory('c2', dates, 5000),
    })
    wrap(<MultiConceptChart concepts={CONCEPTS} />)
    // Chart container renders
    const container = await screen.findByTestId('responsive-container')
    expect(container).toBeTruthy()
  })

  it('renders chart (not not-enough-data) when there are 2+ date points', async () => {
    const dates = ['2026-01-01', '2026-02-01']
    mockGetBatch.mockResolvedValue({
      c1: makeHistory('c1', dates, 1000),
      c2: makeHistory('c2', dates, 5000),
    })
    wrap(<MultiConceptChart concepts={CONCEPTS} />)
    await screen.findByTestId('responsive-container')
    expect(screen.queryByText(/not enough data/i)).toBeNull()
  })

  it('filters data points by dateFrom and dateTo', async () => {
    const dates = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']
    mockGetBatch.mockResolvedValue({
      c1: makeHistory('c1', dates, 1000),
      c2: makeHistory('c2', dates, 5000),
    })
    // With dateFrom/dateTo we should still render (not show "not enough data")
    wrap(<MultiConceptChart concepts={CONCEPTS} dateFrom="2026-02-01" dateTo="2026-04-01" />)
    const container = await screen.findByTestId('responsive-container')
    expect(container).toBeTruthy()
    // "not enough data" should NOT appear since 3 dates remain after filter
    expect(screen.queryByText(/not enough data/i)).toBeNull()
  })
})
