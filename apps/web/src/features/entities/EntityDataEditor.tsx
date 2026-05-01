import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateEntry } from '../../lib/snapshotsApi'
import type { ConceptEntryRead, SnapshotDetail } from '../../lib/snapshotsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import type { EntityRead } from '../../lib/entitiesApi'
import { inputClass } from '../../components/ui/FormField'
import Button from '../../components/ui/Button'

// ── CellInput ─────────────────────────────────────────────────────────────────

interface CellInputProps {
  entry: ConceptEntryRead
  snapshotId: string
  conceptName: string
  entityName: string
}

function CellInput({ entry, snapshotId, conceptName, entityName }: CellInputProps) {
  const qc = useQueryClient()
  const [local, setLocal] = useState(entry.value !== null ? String(entry.value) : '')

  const saveMutation = useMutation({
    mutationFn: (val: number) => updateEntry(snapshotId, entry.id, val, entry.entity_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshot', snapshotId] }),
  })

  return (
    <div className="flex flex-col gap-1">
      <input
        type="number"
        step="any"
        aria-label={`${conceptName} for ${entityName}`}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className={`${inputClass} w-full text-xs`}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={saveMutation.isPending || local === ''}
        onClick={() => { const n = parseFloat(local); if (!isNaN(n)) saveMutation.mutate(n) }}
      >
        {saveMutation.isPending ? '…' : 'Save'}
      </Button>
      {saveMutation.isError && <p className="text-[10px] text-red-500">Failed</p>}
    </div>
  )
}

// ── EntityDataEditor ──────────────────────────────────────────────────────────

interface EntityDataEditorProps {
  snapshot: SnapshotDetail
  concepts: ConceptRead[]
  entities: EntityRead[]
}

export default function EntityDataEditor({
  snapshot,
  concepts,
  entities,
}: EntityDataEditorProps) {
  const locked = snapshot.status === 'complete'

  // Find all entries that have an entity_id (entity-bound entries)
  const entityEntries = snapshot.entries.filter((e) => e.entity_id !== null)
  if (entityEntries.length === 0) return null

  // Determine which entity-bound concepts appear in this snapshot
  const entityConceptIds = [...new Set(entityEntries.map((e) => e.concept_id))]
  const entityConcepts = entityConceptIds
    .map((id) => concepts.find((c) => c.id === id))
    .filter(Boolean) as ConceptRead[]

  // Determine which entities appear in this snapshot
  const entityIds = [...new Set(entityEntries.map((e) => e.entity_id as string))]
  const presentEntities = entityIds
    .map((id) => entities.find((e) => e.id === id))
    .filter(Boolean) as EntityRead[]

  // Build lookup: entity_id → concept_id → entry
  const entryByEntityConcept: Record<string, Record<string, ConceptEntryRead>> = {}
  for (const entry of entityEntries) {
    const eid = entry.entity_id as string
    if (!entryByEntityConcept[eid]) entryByEntityConcept[eid] = {}
    entryByEntityConcept[eid][entry.concept_id] = entry
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h3 className="text-sm font-semibold text-[var(--text-h)]">Entity Data</h3>
        <p className="text-xs text-[var(--text)] mt-0.5">
          {locked ? 'Read-only — snapshot is complete.' : 'Edit per-entity values below.'}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--code-bg)]">
              <th className="px-4 py-2 text-left font-medium text-[var(--text-h)]">Entity</th>
              {entityConcepts.map((c) => (
                <th key={c.id} className="px-4 py-2 text-left font-medium text-[var(--text-h)]">
                  {c.name}
                  <span className="block text-[10px] font-normal text-[var(--text)]">
                    {c.currency_code}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {presentEntities.map((entity) => (
              <tr key={entity.id} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-4 py-2 font-medium text-[var(--text-h)]">{entity.name}</td>
                {entityConcepts.map((concept) => {
                  const entry = entryByEntityConcept[entity.id]?.[concept.id]
                  if (!entry) {
                    return <td key={concept.id} className="px-4 py-2 text-[var(--text)]">—</td>
                  }
                  return (
                    <td key={concept.id} className="px-4 py-2">
                      {locked ? (
                        <span className="text-[var(--text-h)]">
                          {entry.value !== null ? entry.value.toLocaleString() : '—'}
                        </span>
                      ) : (
                        <CellInput
                          entry={entry}
                          snapshotId={snapshot.id}
                          conceptName={concept.name}
                          entityName={entity.name}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
