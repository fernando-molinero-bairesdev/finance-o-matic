import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSnapshots, getSnapshot } from '../lib/snapshotsApi'
import { getConcepts } from '../lib/conceptsApi'
import { getEntities } from '../lib/entitiesApi'
import { selectClass } from '../components/ui/FormField'
import SnapshotEntrySheet from '../features/snapshots/SnapshotEntrySheet'
import EntityDataEditor from '../features/entities/EntityDataEditor'
import type { EntityRead } from '../lib/entitiesApi'

export default function DataEntryPage() {
  const [selectedId, setSelectedId] = useState<string>('')

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots,
  })

  // Only open/processed snapshots are editable
  const editable = (snapshots ?? []).filter((s) => s.status === 'open' || s.status === 'processed')

  const { data: snapshot, isLoading: loadingSnap } = useQuery({
    queryKey: ['snapshot', selectedId],
    queryFn: () => getSnapshot(selectedId),
    enabled: !!selectedId,
  })

  const { data: concepts = [] } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const { data: entities = [] } = useQuery({
    queryKey: ['entities'],
    queryFn: () => getEntities(),
    select: (data): EntityRead[] => data,
  })

  const entityNames = Object.fromEntries((entities as EntityRead[]).map((e) => [e.id, e.name]))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-h)]">Data Entry</h2>
          <p className="text-xs text-[var(--text)] mt-0.5">
            Select an open snapshot to fill in values.
          </p>
        </div>
        <div className="px-4 py-3">
          <select
            aria-label="Select snapshot"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={`${selectClass} w-full`}
          >
            <option value="">— choose a snapshot —</option>
            {editable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date}{s.label ? ` — ${s.label}` : ''} ({s.status})
              </option>
            ))}
          </select>
          {editable.length === 0 && (
            <p className="mt-2 text-xs text-[var(--text)]">
              No open snapshots. Take one from the Snapshots page first.
            </p>
          )}
        </div>
      </div>

      {selectedId && loadingSnap && (
        <p className="text-sm text-[var(--text)]">Loading…</p>
      )}

      {snapshot && (
        <>
          <SnapshotEntrySheet
            snapshot={snapshot}
            concepts={concepts}
            entityNames={entityNames}
          />
          <EntityDataEditor
            snapshot={snapshot}
            concepts={concepts}
            entities={entities as EntityRead[]}
          />
        </>
      )}
    </div>
  )
}
