import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/AuthContext'
import type { AuthContextValue } from '../auth/AuthContext'
import { createConcept, getCurrencies } from '../../lib/conceptsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import { ApiError } from '../../lib/apiClient'
import ConceptForm from './ConceptForm'

vi.mock('../../lib/conceptsApi')

const mockCreateConcept = vi.mocked(createConcept)
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

function renderConceptForm(onSuccess = vi.fn()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx()}>
        <QueryClientProvider client={makeQueryClient()}>
          <ConceptForm onSuccess={onSuccess} />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const conceptFixture: ConceptRead = {
  id: 'c1',
  user_id: 'u1',
  name: 'salary',
  kind: 'value',
  currency_code: 'USD',
  carry_behaviour: 'copy_or_manual',
  literal_value: 5000,
  expression: null,
  parent_group_id: null,
  aggregate_op: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetCurrencies.mockResolvedValue([
    { code: 'USD', name: 'US Dollar' },
    { code: 'EUR', name: 'Euro' },
  ])
})

describe('ConceptForm', () => {
  it('renders name field', async () => {
    renderConceptForm()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
  })

  it('renders kind selector', async () => {
    renderConceptForm()
    expect(screen.getByLabelText(/kind/i)).toBeInTheDocument()
  })

  it('renders currency options from API', async () => {
    renderConceptForm()
    expect(await screen.findByRole('option', { name: /US Dollar/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Euro/i })).toBeInTheDocument()
  })

  it('shows literal value field when kind is value', async () => {
    renderConceptForm()
    // 'value' is the default kind
    expect(screen.getByLabelText(/literal value/i)).toBeInTheDocument()
  })

  it('hides literal value field when kind is formula', async () => {
    renderConceptForm()
    const kindSelect = screen.getByLabelText(/kind/i)
    await userEvent.selectOptions(kindSelect, 'formula')
    expect(screen.queryByLabelText(/literal value/i)).not.toBeInTheDocument()
  })

  it('shows expression field when kind is formula', async () => {
    renderConceptForm()
    const kindSelect = screen.getByLabelText(/kind/i)
    await userEvent.selectOptions(kindSelect, 'formula')
    expect(screen.getByLabelText(/expression/i)).toBeInTheDocument()
  })

  it('submits calls createConcept with form values', async () => {
    mockCreateConcept.mockResolvedValue(conceptFixture)
    renderConceptForm()

    await userEvent.type(screen.getByLabelText(/name/i), 'salary')
    await waitFor(() => expect(screen.getByRole('option', { name: /US Dollar/i })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText(/currency/i), 'USD')
    await userEvent.type(screen.getByLabelText(/literal value/i), '5000')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(mockCreateConcept).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'salary', kind: 'value', currency_code: 'USD', literal_value: 5000 }),
    )
  })

  it('calls onSuccess after successful create', async () => {
    mockCreateConcept.mockResolvedValue(conceptFixture)
    const onSuccess = vi.fn()
    renderConceptForm(onSuccess)

    await userEvent.type(screen.getByLabelText(/name/i), 'salary')
    await waitFor(() => expect(screen.getByRole('option', { name: /US Dollar/i })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText(/currency/i), 'USD')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('shows error alert on API failure', async () => {
    mockCreateConcept.mockRejectedValue(new ApiError(409, 'Conflict'))
    renderConceptForm()

    await userEvent.type(screen.getByLabelText(/name/i), 'salary')
    await waitFor(() => expect(screen.getByRole('option', { name: /US Dollar/i })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText(/currency/i), 'USD')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
