/**
 * TDD tests for ConceptInitButton — written before the component exists.
 *
 * Contract:
 *  - Renders an "Initialize concepts" button
 *  - Calls initConcepts() when clicked
 *  - Disables the button while the mutation is pending
 *  - Shows a success message listing created concept names after a successful call
 *  - Shows an error message when the API call fails
 *  - Calls onSuccess callback (if provided) after a successful call
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/AuthContext'
import type { AuthContextValue } from '../auth/AuthContext'
import { initConcepts } from '../../lib/conceptsApi'
import ConceptInitButton from './ConceptInitButton'

vi.mock('../../lib/conceptsApi')

const mockInitConcepts = vi.mocked(initConcepts)

function makeAuthCtx(): AuthContextValue {
  return {
    user: { id: '1', email: 'test@example.com', is_active: true, is_superuser: false, is_verified: true },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }
}

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderButton(onSuccess = vi.fn()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx()}>
        <QueryClientProvider client={makeQC()}>
          <ConceptInitButton onSuccess={onSuccess} />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const initResponseFixture = {
  created: [
    { id: 'c1', name: 'rent', kind: 'value' as const, user_id: 'u1', currency_code: 'USD', carry_behaviour: 'copy_or_manual' as const, literal_value: null, expression: null, parent_group_id: null, aggregate_op: null },
    { id: 'c2', name: 'loans', kind: 'group' as const, user_id: 'u1', currency_code: 'USD', carry_behaviour: 'auto' as const, literal_value: null, expression: null, parent_group_id: null, aggregate_op: 'sum' },
    { id: 'c3', name: 'monthly_salary', kind: 'formula' as const, user_id: 'u1', currency_code: 'USD', carry_behaviour: 'auto' as const, literal_value: null, expression: 'hourly_rate * hours_per_day * working_days', parent_group_id: null, aggregate_op: null },
  ],
  skipped: [],
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ConceptInitButton', () => {
  it('renders the initialize concepts button', () => {
    renderButton()
    expect(screen.getByRole('button', { name: /initialize concepts/i })).toBeInTheDocument()
  })

  it('calls initConcepts when the button is clicked', async () => {
    mockInitConcepts.mockResolvedValue(initResponseFixture)
    renderButton()
    await userEvent.click(screen.getByRole('button', { name: /initialize concepts/i }))
    expect(mockInitConcepts).toHaveBeenCalledTimes(1)
  })

  it('disables the button while the mutation is pending', async () => {
    let resolve!: (v: typeof initResponseFixture) => void
    mockInitConcepts.mockReturnValue(new Promise((r) => { resolve = r }))

    renderButton()
    const btn = screen.getByRole('button', { name: /initialize concepts/i })
    await userEvent.click(btn)

    expect(btn).toBeDisabled()
    resolve(initResponseFixture)
  })

  it('shows count of created concepts after success', async () => {
    mockInitConcepts.mockResolvedValue(initResponseFixture)
    renderButton()
    await userEvent.click(screen.getByRole('button', { name: /initialize concepts/i }))
    await waitFor(() =>
      expect(screen.getByText(/3 concept/i)).toBeInTheDocument(),
    )
  })

  it('shows skipped notice when concepts already existed', async () => {
    mockInitConcepts.mockResolvedValue({ created: [], skipped: ['rent', 'loans'] })
    renderButton()
    await userEvent.click(screen.getByRole('button', { name: /initialize concepts/i }))
    await waitFor(() =>
      expect(screen.getByText(/already initialized/i)).toBeInTheDocument(),
    )
  })

  it('calls onSuccess callback after success', async () => {
    mockInitConcepts.mockResolvedValue(initResponseFixture)
    const onSuccess = vi.fn()
    renderButton(onSuccess)
    await userEvent.click(screen.getByRole('button', { name: /initialize concepts/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('shows error message on API failure', async () => {
    mockInitConcepts.mockRejectedValue(new Error('Network error'))
    renderButton()
    await userEvent.click(screen.getByRole('button', { name: /initialize concepts/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    )
  })
})
