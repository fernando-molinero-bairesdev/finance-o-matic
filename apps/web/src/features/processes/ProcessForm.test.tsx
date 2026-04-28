/**
 * TDD tests for ProcessForm — written before the component exists.
 *
 * Contract:
 *  - Renders name, cadence, and concept_scope fields
 *  - Calls createProcess() with correct values on submit
 *  - Shows a loading state while pending
 *  - Calls onSuccess after a successful create
 *  - Shows an error alert on API failure
 *  - Shows concept checkbox picker when scope="selected"
 *  - Includes selected_concept_ids in create payload when scope="selected"
 *  - Pre-fills fields when process prop given (edit mode)
 *  - Calls updateProcess on submit in edit mode
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/AuthContext'
import type { AuthContextValue } from '../auth/AuthContext'
import { createProcess, updateProcess } from '../../lib/processesApi'
import type { ProcessRead } from '../../lib/processesApi'
import { getConcepts } from '../../lib/conceptsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import ProcessForm from './ProcessForm'

vi.mock('../../lib/processesApi')
vi.mock('../../lib/conceptsApi')

const mockCreateProcess = vi.mocked(createProcess)
const mockUpdateProcess = vi.mocked(updateProcess)
const mockGetConcepts = vi.mocked(getConcepts)

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

function renderForm(onSuccess = vi.fn(), process?: ProcessRead) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx()}>
        <QueryClientProvider client={makeQC()}>
          <ProcessForm onSuccess={onSuccess} process={process} />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const processFixture: ProcessRead = {
  id: 'p1',
  user_id: 'u1',
  name: 'Monthly snapshot',
  cadence: 'monthly',
  concept_scope: 'all',
  is_active: true,
  schedule: { id: 's1', process_id: 'p1', next_run_at: '2026-05-24', last_run_at: null },
  selected_concept_ids: [],
}

const conceptsFixture: ConceptRead[] = [
  { id: 'c1', name: 'Rent', kind: 'value', user_id: 'u1', currency_code: 'USD', carry_behaviour: 'copy_or_manual', literal_value: null, expression: null, group_ids: [], aggregate_op: null },
  { id: 'c2', name: 'Salary', kind: 'value', user_id: 'u1', currency_code: 'USD', carry_behaviour: 'auto', literal_value: null, expression: null, group_ids: [], aggregate_op: null },
]

beforeEach(() => vi.resetAllMocks())

describe('ProcessForm', () => {
  it('renders name field', () => {
    renderForm()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
  })

  it('renders cadence selector', () => {
    renderForm()
    expect(screen.getByLabelText(/cadence/i)).toBeInTheDocument()
  })

  it('renders concept scope selector', () => {
    renderForm()
    expect(screen.getByLabelText(/concept scope/i)).toBeInTheDocument()
  })

  it('submits with correct values', async () => {
    mockCreateProcess.mockResolvedValue(processFixture)
    renderForm()

    await userEvent.type(screen.getByLabelText(/name/i), 'Monthly snapshot')
    await userEvent.selectOptions(screen.getByLabelText(/cadence/i), 'monthly')
    await userEvent.selectOptions(screen.getByLabelText(/concept scope/i), 'all')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(mockCreateProcess).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Monthly snapshot', cadence: 'monthly', concept_scope: 'all' }),
    )
  })

  it('calls onSuccess after successful create', async () => {
    mockCreateProcess.mockResolvedValue(processFixture)
    const onSuccess = vi.fn()
    renderForm(onSuccess)

    await userEvent.type(screen.getByLabelText(/name/i), 'Monthly snapshot')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('disables submit button while pending', async () => {
    let resolve!: (v: ProcessRead) => void
    mockCreateProcess.mockReturnValue(new Promise((r) => { resolve = r }))
    renderForm()

    await userEvent.type(screen.getByLabelText(/name/i), 'x')
    const btn = screen.getByRole('button', { name: /create/i })
    await userEvent.click(btn)

    expect(btn).toBeDisabled()
    resolve(processFixture)
  })

  it('shows error alert on API failure', async () => {
    mockCreateProcess.mockRejectedValue(new Error('Server error'))
    renderForm()

    await userEvent.type(screen.getByLabelText(/name/i), 'x')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('shows concept picker when scope is selected', async () => {
    mockGetConcepts.mockResolvedValue(conceptsFixture)
    renderForm()

    await userEvent.selectOptions(screen.getByLabelText(/concept scope/i), 'selected')

    expect(await screen.findByText('Rent')).toBeInTheDocument()
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })

  it('includes selected_concept_ids in create payload when scope is selected', async () => {
    mockGetConcepts.mockResolvedValue(conceptsFixture)
    mockCreateProcess.mockResolvedValue(processFixture)
    renderForm()

    await userEvent.type(screen.getByLabelText(/name/i), 'Test')
    await userEvent.selectOptions(screen.getByLabelText(/concept scope/i), 'selected')
    await screen.findByText('Rent')
    await userEvent.click(screen.getByLabelText('Rent'))
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(mockCreateProcess).toHaveBeenCalledWith(
      expect.objectContaining({ concept_scope: 'selected', selected_concept_ids: ['c1'] }),
    )
  })

  it('pre-fills fields in edit mode', () => {
    renderForm(vi.fn(), processFixture)
    expect(screen.getByLabelText(/name/i)).toHaveValue('Monthly snapshot')
    expect(screen.getByLabelText(/cadence/i)).toHaveValue('monthly')
    expect(screen.getByLabelText(/concept scope/i)).toHaveValue('all')
  })

  it('shows Save button in edit mode', () => {
    renderForm(vi.fn(), processFixture)
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('calls updateProcess on submit in edit mode', async () => {
    mockUpdateProcess.mockResolvedValue(processFixture)
    const onSuccess = vi.fn()
    renderForm(onSuccess, processFixture)

    await userEvent.clear(screen.getByLabelText(/name/i))
    await userEvent.type(screen.getByLabelText(/name/i), 'Updated name')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(mockUpdateProcess).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Updated name' }),
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('shows Cancel button and calls onCancel when provided', async () => {
    const onCancel = vi.fn()
    render(
      <MemoryRouter>
        <AuthContext.Provider value={makeAuthCtx()}>
          <QueryClientProvider client={makeQC()}>
            <ProcessForm onCancel={onCancel} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
