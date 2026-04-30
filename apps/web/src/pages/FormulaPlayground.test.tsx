import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../features/auth/AuthContext'
import type { AuthContextValue } from '../features/auth/AuthContext'
import { getConcepts } from '../lib/conceptsApi'
import { previewFormula } from '../lib/formulasApi'
import FormulaPlayground from './FormulaPlayground'

vi.mock('../lib/conceptsApi')
vi.mock('../lib/formulasApi')

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

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx()}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <FormulaPlayground />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetConcepts.mockResolvedValue([])
})

describe('FormulaPlayground', () => {
  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /formula playground/i })).toBeInTheDocument()
  })

  it('renders the FormulaEditor', () => {
    renderPage()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('shows test result after testing', async () => {
    mockPreviewFormula.mockResolvedValue({ value: 42, dependencies: [], error: null })
    renderPage()
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '6 * 7')
    await userEvent.click(screen.getByRole('button', { name: /test/i }))
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument())
  })
})
