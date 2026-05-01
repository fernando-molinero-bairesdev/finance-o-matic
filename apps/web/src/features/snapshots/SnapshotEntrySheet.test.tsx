import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { updateEntry, carryForward } from '../../lib/snapshotsApi'
import type { SnapshotDetail } from '../../lib/snapshotsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import SnapshotEntrySheet from './SnapshotEntrySheet'

vi.mock('../../lib/snapshotsApi')
const mockUpdateEntry = vi.mocked(updateEntry)
const mockCarryForward = vi.mocked(carryForward)

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderSheet(
  snapshot: SnapshotDetail,
  concepts: ConceptRead[] = [],
  entityNames: Record<string, string> = {},
) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <SnapshotEntrySheet snapshot={snapshot} concepts={concepts} entityNames={entityNames} />
    </QueryClientProvider>,
  )
}

const baseEntry = {
  id: 'e1',
  snapshot_id: 's1',
  concept_id: 'c1',
  value: null,
  currency_code: 'USD',
  carry_behaviour_used: 'copy_or_manual' as const,
  formula_snapshot: null,
  is_pending: false,
  entity_id: null,
}

const baseSnapshot: SnapshotDetail = {
  id: 's1',
  user_id: 'u1',
  process_id: null,
  date: '2026-01-01',
  label: null,
  trigger: 'manual',
  status: 'open',
  entries: [baseEntry],
  fx_rates: [],
}

const baseConcept: ConceptRead = {
  id: 'c1',
  user_id: 'u1',
  name: 'rent',
  kind: 'value',
  currency_code: 'USD',
  carry_behaviour: 'copy_or_manual',
  literal_value: null,
  expression: null,
  group_ids: [],
  aggregate_op: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
})

describe('SnapshotEntrySheet', () => {
  it('renders the snapshot date', () => {
    renderSheet(baseSnapshot, [baseConcept])
    expect(screen.getByText('2026-01-01')).toBeInTheDocument()
  })

  it('renders an editable input for a copy_or_manual open entry', () => {
    renderSheet(baseSnapshot, [baseConcept])
    expect(screen.getByRole('spinbutton', { name: /rent/i })).toBeInTheDocument()
  })

  it('saves an entry value on Save click', async () => {
    const user = userEvent.setup()
    mockUpdateEntry.mockResolvedValue({ ...baseEntry, value: 1200 })
    renderSheet(baseSnapshot, [baseConcept])

    await user.type(screen.getByRole('spinbutton', { name: /rent/i }), '1200')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(mockUpdateEntry).toHaveBeenCalledWith('s1', 'e1', 1200, null)
    )
  })

  it('does not render an input for auto entries', () => {
    const autoEntry = { ...baseEntry, carry_behaviour_used: 'auto' as const }
    renderSheet({ ...baseSnapshot, entries: [autoEntry] }, [baseConcept])
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByText('auto')).toBeInTheDocument()
  })

  it('renders read-only for complete snapshots', () => {
    const snap = { ...baseSnapshot, status: 'complete' as const }
    renderSheet(snap, [baseConcept])
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })

  it('shows Fill from carry button for open snapshots', () => {
    renderSheet(baseSnapshot, [baseConcept])
    expect(screen.getByRole('button', { name: /fill from carry/i })).toBeInTheDocument()
  })

  it('hides Fill from carry button for complete snapshots', () => {
    renderSheet({ ...baseSnapshot, status: 'complete' }, [baseConcept])
    expect(screen.queryByRole('button', { name: /fill from carry/i })).not.toBeInTheDocument()
  })

  it('calls carryForward on Fill from carry click', async () => {
    const user = userEvent.setup()
    mockCarryForward.mockResolvedValue({ ...baseSnapshot, entries: [{ ...baseEntry, value: 999 }] })
    renderSheet(baseSnapshot, [baseConcept])

    await user.click(screen.getByRole('button', { name: /fill from carry/i }))
    await waitFor(() => expect(mockCarryForward).toHaveBeenCalledWith('s1'))
  })

  it('shows Configure button and toggles concept visibility', async () => {
    const user = userEvent.setup()
    renderSheet(baseSnapshot, [baseConcept])

    await user.click(screen.getByRole('button', { name: /configure/i }))
    expect(screen.getByRole('checkbox', { name: /rent/i })).toBeInTheDocument()
  })

  it('hides a concept after unchecking in configure panel', async () => {
    const user = userEvent.setup()
    renderSheet(baseSnapshot, [baseConcept])

    await user.click(screen.getByRole('button', { name: /configure/i }))
    await user.click(screen.getByRole('checkbox', { name: /rent/i }))

    // Entry row should no longer be visible
    expect(screen.queryByRole('spinbutton', { name: /rent/i })).not.toBeInTheDocument()
  })

  it('skips entity-bound entries (those are for EntityDataEditor)', () => {
    const entityEntry = { ...baseEntry, id: 'e2', entity_id: 'ent1' }
    renderSheet({ ...baseSnapshot, entries: [entityEntry] }, [baseConcept])
    // Entity entries should not appear in this sheet
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByText(/no non-entity entries/i)).toBeInTheDocument()
  })

  it('uses process_id as localStorage key when present', async () => {
    const user = userEvent.setup()
    const snap = { ...baseSnapshot, process_id: 'proc1' }
    renderSheet(snap, [baseConcept])

    await user.click(screen.getByRole('button', { name: /configure/i }))
    await user.click(screen.getByRole('checkbox', { name: /rent/i }))

    // Key should be based on process_id
    expect(localStorage.getItem('entry-sheet-concepts:proc1')).not.toBeNull()
  })
})
