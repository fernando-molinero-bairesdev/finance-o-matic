import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { updateEntry } from '../../lib/snapshotsApi'
import type { SnapshotDetail } from '../../lib/snapshotsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import type { EntityRead } from '../../lib/entitiesApi'
import EntityDataEditor from './EntityDataEditor'

vi.mock('../../lib/snapshotsApi')
const mockUpdateEntry = vi.mocked(updateEntry)

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderEditor(
  snapshot: SnapshotDetail,
  concepts: ConceptRead[],
  entities: EntityRead[],
) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <EntityDataEditor snapshot={snapshot} concepts={concepts} entities={entities} />
    </QueryClientProvider>,
  )
}

const entityEntry = {
  id: 'e1',
  snapshot_id: 's1',
  concept_id: 'c1',
  value: null,
  currency_code: 'USD',
  carry_behaviour_used: 'copy_or_manual' as const,
  formula_snapshot: null,
  is_pending: false,
  entity_id: 'ent1',
}

const baseSnapshot: SnapshotDetail = {
  id: 's1',
  user_id: 'u1',
  process_id: null,
  date: '2026-01-01',
  label: null,
  trigger: 'manual',
  status: 'open',
  entries: [entityEntry],
  fx_rates: [],
}

const concept: ConceptRead = {
  id: 'c1',
  user_id: 'u1',
  name: 'balance',
  kind: 'value',
  currency_code: 'USD',
  carry_behaviour: 'copy_or_manual',
  literal_value: null,
  expression: null,
  group_ids: [],
  aggregate_op: null,
}

const entity: EntityRead = {
  id: 'ent1',
  user_id: 'u1',
  entity_type_id: 'et1',
  name: 'Chase Checking',
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('EntityDataEditor', () => {
  it('returns null when there are no entity-bound entries', () => {
    const snap = { ...baseSnapshot, entries: [] }
    const { container } = renderEditor(snap, [concept], [entity])
    expect(container.firstChild).toBeNull()
  })

  it('renders entity names as table rows', () => {
    renderEditor(baseSnapshot, [concept], [entity])
    expect(screen.getByText('Chase Checking')).toBeInTheDocument()
  })

  it('renders concept names as column headers', () => {
    renderEditor(baseSnapshot, [concept], [entity])
    expect(screen.getByRole('columnheader', { name: /balance/i })).toBeInTheDocument()
  })

  it('renders an editable input for open snapshot entry', () => {
    renderEditor(baseSnapshot, [concept], [entity])
    expect(
      screen.getByRole('spinbutton', { name: /balance for chase checking/i })
    ).toBeInTheDocument()
  })

  it('saves entry value on Save click', async () => {
    const user = userEvent.setup()
    mockUpdateEntry.mockResolvedValue({ ...entityEntry, value: 5000 })
    renderEditor(baseSnapshot, [concept], [entity])

    await user.type(screen.getByRole('spinbutton', { name: /balance for chase checking/i }), '5000')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(mockUpdateEntry).toHaveBeenCalledWith('s1', 'e1', 5000, 'ent1')
    )
  })

  it('shows read-only values for complete snapshots', () => {
    const snap = { ...baseSnapshot, status: 'complete' as const, entries: [{ ...entityEntry, value: 3500 }] }
    renderEditor(snap, [concept], [entity])

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByText(/read-only/i)).toBeInTheDocument()
    expect(screen.getByText('3,500')).toBeInTheDocument()
  })

  it('shows multiple entities as multiple rows', () => {
    const entity2: EntityRead = { id: 'ent2', user_id: 'u1', entity_type_id: 'et1', name: 'Savings Account' }
    const entry2 = { ...entityEntry, id: 'e2', entity_id: 'ent2' }
    renderEditor(
      { ...baseSnapshot, entries: [entityEntry, entry2] },
      [concept],
      [entity, entity2],
    )
    expect(screen.getByText('Chase Checking')).toBeInTheDocument()
    expect(screen.getByText('Savings Account')).toBeInTheDocument()
  })

  it('shows — when an entity has no entry for a concept', () => {
    const concept2: ConceptRead = { ...concept, id: 'c2', name: 'interest_rate' }
    const entity2: EntityRead = { id: 'ent2', user_id: 'u1', entity_type_id: 'et1', name: 'Savings' }
    // entity1 has c1 entry, entity2 has c2 entry — each should show — for the other's column
    const entry2 = { ...entityEntry, id: 'e2', concept_id: 'c2', entity_id: 'ent2' }
    renderEditor(
      { ...baseSnapshot, entries: [entityEntry, entry2] },
      [concept, concept2],
      [entity, entity2],
    )
    // Each entity is missing one concept column, so at least two — cells
    const cells = screen.getAllByText('—')
    expect(cells.length).toBeGreaterThanOrEqual(2)
  })
})
