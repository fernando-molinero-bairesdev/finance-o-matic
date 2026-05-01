import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateEntry, carryForward } from '../../lib/snapshotsApi'
import type { ConceptEntryRead, SnapshotDetail } from '../../lib/snapshotsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import Button from '../../components/ui/Button'
import { inputClass } from '../../components/ui/FormField'

// ── localStorage helpers ──────────────────────────────────────────────────────

function storageKey(snapshot: SnapshotDetail): string {
  return `entry-sheet-concepts:${snapshot.process_id ?? snapshot.id}`
}

function loadVisibleIds(snapshot: SnapshotDetail, allConceptIds: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(snapshot))
    if (raw) {
      const parsed: string[] = JSON.parse(raw)
      return new Set(parsed.filter((id) => allConceptIds.includes(id)))
    }
  } catch {
    // ignore
  }
  return new Set(allConceptIds) // default: show all
}

function saveVisibleIds(snapshot: SnapshotDetail, ids: Set<string>): void {
  try {
    localStorage.setItem(storageKey(snapshot), JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

// ── EntryRow ──────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: ConceptEntryRead
  snapshotId: string
  conceptName: string
  entityName: string | null
  locked: boolean
}

function EntryRow({ entry, snapshotId, conceptName, entityName, locked }: EntryRowProps) {
  const qc = useQueryClient()
  const [local, setLocal] = useState(entry.value !== null ? String(entry.value) : '')

  const saveMutation = useMutation({
    mutationFn: (val: number) => updateEntry(snapshotId, entry.id, val, entry.entity_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshot', snapshotId] }),
  })

  const isAuto = entry.carry_behaviour_used === 'auto'
  const editable = !isAuto && !locked

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-4 py-2 border-b border-[var(--border)] last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--text-h)] truncate">{conceptName}</p>
        {entityName && (
          <span className="text-[10px] text-[var(--accent)] block truncate">{entityName}</span>
        )}
      </div>
      <span className="text-xs text-[var(--text)] shrink-0">{entry.currency_code}</span>
      {editable ? (
        <>
          <input
            type="number"
            step="any"
            aria-label={`Value for ${conceptName}${entityName ? ` (${entityName})` : ''}`}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className={`${inputClass} w-24 shrink-0`}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={saveMutation.isPending || local === ''}
            onClick={() => { const n = parseFloat(local); if (!isNaN(n)) saveMutation.mutate(n) }}
          >
            {saveMutation.isPending ? '…' : 'Save'}
          </Button>
        </>
      ) : (
        <span className="col-span-2 text-xs text-right text-[var(--text)]">
          {isAuto ? 'auto' : entry.value !== null ? entry.value.toLocaleString() : '—'}
        </span>
      )}
    </div>
  )
}

// ── SnapshotEntrySheet ────────────────────────────────────────────────────────

interface SnapshotEntrySheetProps {
  snapshot: SnapshotDetail
  concepts: ConceptRead[]
  entityNames: Record<string, string>
}

export default function SnapshotEntrySheet({
  snapshot,
  concepts,
  entityNames,
}: SnapshotEntrySheetProps) {
  const qc = useQueryClient()
  const locked = snapshot.status === 'complete'

  // Only show entries for non-entity-bound concepts (EntityDataEditor handles those)
  const nonEntityEntries = snapshot.entries.filter((e) => e.entity_id === null)

  const conceptMap = Object.fromEntries(concepts.map((c) => [c.id, c]))
  const allConceptIds = [...new Set(nonEntityEntries.map((e) => e.concept_id))]

  const [visibleIds, setVisibleIds] = useState<Set<string>>(() =>
    loadVisibleIds(snapshot, allConceptIds)
  )
  const [configuring, setConfiguring] = useState(false)

  function toggleConcept(id: string) {
    setVisibleIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveVisibleIds(snapshot, next)
      return next
    })
  }

  const visibleEntries = nonEntityEntries.filter((e) => visibleIds.has(e.concept_id))

  const carryMutation = useMutation({
    mutationFn: () => carryForward(snapshot.id),
    onSuccess: (detail) => {
      qc.setQueryData(['snapshot', snapshot.id], detail)
      qc.invalidateQueries({ queryKey: ['snapshot', snapshot.id] })
    },
  })

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-h)]">
            {snapshot.date}{snapshot.label ? ` — ${snapshot.label}` : ''}
          </h3>
          <p className="text-xs text-[var(--text)] mt-0.5">{visibleEntries.length} concept{visibleEntries.length !== 1 ? 's' : ''} shown</p>
        </div>
        <div className="flex items-center gap-2">
          {!locked && (
            <Button
              variant="secondary"
              size="sm"
              disabled={carryMutation.isPending}
              onClick={() => carryMutation.mutate()}
            >
              {carryMutation.isPending ? 'Filling…' : 'Fill from carry'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfiguring((v) => !v)}
          >
            {configuring ? 'Done' : 'Configure'}
          </Button>
        </div>
      </div>

      {/* Configure panel */}
      {configuring && (
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--code-bg)] space-y-2">
          <p className="text-xs font-medium text-[var(--text-h)]">Select concepts to display</p>
          <div className="space-y-1">
            {allConceptIds.map((cid) => {
              const concept = conceptMap[cid]
              return (
                <label key={cid} className="flex items-center gap-2 text-xs text-[var(--text-h)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleIds.has(cid)}
                    onChange={() => toggleConcept(cid)}
                  />
                  {concept?.name ?? cid.slice(0, 8)}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Entries */}
      {visibleEntries.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--text)]">
          {allConceptIds.length === 0
            ? 'No non-entity entries in this snapshot.'
            : 'No concepts selected. Click Configure to add some.'}
        </p>
      ) : (
        visibleEntries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            snapshotId={snapshot.id}
            conceptName={conceptMap[entry.concept_id]?.name ?? entry.concept_id.slice(0, 8)}
            entityName={null}
            locked={locked}
          />
        ))
      )}

      {carryMutation.isError && (
        <p className="px-4 py-2 text-xs text-red-500">Failed to fill from carry.</p>
      )}
    </div>
  )
}
