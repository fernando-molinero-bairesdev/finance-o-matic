/**
 * TDD tests for ProcessList — written before the component exists.
 *
 * Contract:
 *  - Shows loading state while fetching
 *  - Shows "No processes" when list is empty
 *  - Renders each process name, cadence, and status
 *  - Shows next_run_at from schedule when present
 *  - Shows a delete button per process that calls deleteProcess
 *  - Shows an edit button that opens ProcessForm in edit mode
 *  - Shows a toggle button that calls updateProcess with flipped is_active
 *  - Shows a take snapshot button that calls takeProcessSnapshot
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/AuthContext'
import type { AuthContextValue } from '../auth/AuthContext'
import { getProcesses, deleteProcess, updateProcess, takeProcessSnapshot } from '../../lib/processesApi'
import type { ProcessRead } from '../../lib/processesApi'
import ProcessList from './ProcessList'

vi.mock('../../lib/processesApi')
vi.mock('../../lib/conceptsApi')

const mockGetProcesses = vi.mocked(getProcesses)
const mockDeleteProcess = vi.mocked(deleteProcess)
const mockUpdateProcess = vi.mocked(updateProcess)
const mockTakeProcessSnapshot = vi.mocked(takeProcessSnapshot)

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

function renderList() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuthCtx()}>
        <QueryClientProvider client={makeQC()}>
          <ProcessList />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const processes: ProcessRead[] = [
  {
    id: 'p1',
    user_id: 'u1',
    name: 'Monthly snapshot',
    cadence: 'monthly',
    concept_scope: 'all',
    is_active: true,
    schedule: { id: 's1', process_id: 'p1', next_run_at: '2026-05-24', last_run_at: '2026-04-24' },
    selected_concept_ids: [],
  },
  {
    id: 'p2',
    user_id: 'u1',
    name: 'Ad-hoc',
    cadence: 'manual',
    concept_scope: 'all',
    is_active: false,
    schedule: null,
    selected_concept_ids: [],
  },
]

beforeEach(() => vi.resetAllMocks())

describe('ProcessList', () => {
  it('shows loading state', () => {
    mockGetProcesses.mockReturnValue(new Promise(() => {}))
    renderList()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty message when no processes', async () => {
    mockGetProcesses.mockResolvedValue([])
    renderList()
    expect(await screen.findByText(/no processes/i)).toBeInTheDocument()
  })

  it('renders process names', async () => {
    mockGetProcesses.mockResolvedValue(processes)
    renderList()
    expect(await screen.findByText('Monthly snapshot')).toBeInTheDocument()
    expect(screen.getByText('Ad-hoc')).toBeInTheDocument()
  })

  it('renders cadence for each process', async () => {
    mockGetProcesses.mockResolvedValue(processes)
    renderList()
    await screen.findByText('Monthly snapshot')
    // cadence appears in parentheses e.g. "(monthly)"
    expect(screen.getByText('(monthly)')).toBeInTheDocument()
    expect(screen.getByText('(manual)')).toBeInTheDocument()
  })

  it('shows next_run_at when schedule exists', async () => {
    mockGetProcesses.mockResolvedValue(processes)
    renderList()
    await screen.findByText('Monthly snapshot')
    expect(screen.getByText(/2026-05-24/)).toBeInTheDocument()
  })

  it('calls deleteProcess and refreshes list on delete', async () => {
    mockGetProcesses.mockResolvedValue(processes)
    mockDeleteProcess.mockResolvedValue()
    renderList()
    await screen.findByText('Monthly snapshot')

    await userEvent.click(screen.getAllByRole('button', { name: /delete/i })[0])
    await waitFor(() => expect(mockDeleteProcess).toHaveBeenCalled())
    expect(mockDeleteProcess.mock.calls[0][0]).toBe('p1')
  })

  it('shows edit form when edit button clicked', async () => {
    mockGetProcesses.mockResolvedValue(processes)
    renderList()
    await screen.findByText('Monthly snapshot')

    await userEvent.click(screen.getByRole('button', { name: /edit monthly snapshot/i }))

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Monthly snapshot')).toBeInTheDocument()
  })

  it('calls updateProcess with toggled is_active on toggle click', async () => {
    mockGetProcesses.mockResolvedValue(processes)
    mockUpdateProcess.mockResolvedValue({ ...processes[0], is_active: false })
    renderList()
    await screen.findByText('Monthly snapshot')

    await userEvent.click(screen.getByRole('button', { name: /toggle active monthly snapshot/i }))

    await waitFor(() =>
      expect(mockUpdateProcess).toHaveBeenCalledWith('p1', { is_active: false }),
    )
  })

  it('calls takeProcessSnapshot on take snapshot click', async () => {
    mockGetProcesses.mockResolvedValue(processes)
    mockTakeProcessSnapshot.mockResolvedValue({})
    renderList()
    await screen.findByText('Monthly snapshot')

    await userEvent.click(screen.getAllByRole('button', { name: /take snapshot/i })[0])

    await waitFor(() =>
      expect(mockTakeProcessSnapshot).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ date: expect.any(String) }),
      ),
    )
  })
})
