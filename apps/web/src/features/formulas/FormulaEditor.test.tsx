import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/AuthContext'
import type { AuthContextValue } from '../auth/AuthContext'
import { getConcepts } from '../../lib/conceptsApi'
import { previewFormula } from '../../lib/formulasApi'
import FormulaEditor from './FormulaEditor'

vi.mock('../../lib/conceptsApi')
vi.mock('../../lib/formulasApi')

const mockGetConcepts = vi.mocked(getConcepts)
const mockPreviewFormula = vi.mocked(previewFormula)

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

function renderEditor(expression = '', onChange = vi.fn()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx()}>
        <QueryClientProvider client={makeQueryClient()}>
          <FormulaEditor expression={expression} onChange={onChange} />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const conceptsFixture = [
  { id: 'c1', user_id: 'u1', name: 'salary', kind: 'value' as const, currency_code: 'USD', carry_behaviour: 'copy_or_manual' as const, literal_value: 5000, expression: null, group_ids: [], aggregate_op: null },
  { id: 'c2', user_id: 'u1', name: 'bonus', kind: 'value' as const, currency_code: 'USD', carry_behaviour: 'copy_or_manual' as const, literal_value: 1000, expression: null, group_ids: [], aggregate_op: null },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockGetConcepts.mockResolvedValue(conceptsFixture)
})

describe('FormulaEditor', () => {
  it('renders textarea and concept list', async () => {
    renderEditor()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(await screen.findByText('salary')).toBeInTheDocument()
    expect(screen.getByText('bonus')).toBeInTheDocument()
  })

  it('clicking a concept name appends it to expression', async () => {
    const onChange = vi.fn()
    renderEditor('', onChange)
    const btn = await screen.findByRole('button', { name: 'salary' })
    await userEvent.click(btn)
    expect(onChange).toHaveBeenCalledWith('salary')
  })

  it('clicking a concept name when expression is non-empty appends with space', async () => {
    const onChange = vi.fn()
    renderEditor('salary *', onChange)
    const btn = await screen.findByRole('button', { name: 'bonus' })
    await userEvent.click(btn)
    expect(onChange).toHaveBeenCalledWith('salary * bonus')
  })

  it('operator quick-insert buttons append to expression', async () => {
    const onChange = vi.fn()
    renderEditor('salary', onChange)
    const plusBtn = screen.getByRole('button', { name: '+' })
    await userEvent.click(plusBtn)
    expect(onChange).toHaveBeenCalledWith('salary +')
  })

  it('Test button calls previewFormula and shows value', async () => {
    mockPreviewFormula.mockResolvedValue({ value: 60000, dependencies: ['salary'], error: null })
    renderEditor('salary * 12')
    await userEvent.click(screen.getByRole('button', { name: /test/i }))
    await waitFor(() => expect(screen.getByText('60000')).toBeInTheDocument())
  })

  it('shows error message when preview returns error', async () => {
    mockPreviewFormula.mockResolvedValue({ value: null, dependencies: [], error: 'Unknown concept: foo' })
    renderEditor('foo + 1')
    await userEvent.click(screen.getByRole('button', { name: /test/i }))
    await waitFor(() => expect(screen.getByText(/unknown concept: foo/i)).toBeInTheDocument())
  })

  it('excludes the concept with excludeConceptId from picker', async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={makeAuthCtx()}>
          <QueryClientProvider client={makeQueryClient()}>
            <FormulaEditor expression="" onChange={vi.fn()} excludeConceptId="c1" />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    await screen.findByText('bonus')
    expect(screen.queryByRole('button', { name: 'salary' })).not.toBeInTheDocument()
  })
})
