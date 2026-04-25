import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveEntry } from '../../lib/snapshotsApi'
import type { ConceptEntryRead, SnapshotDetail } from '../../lib/snapshotsApi'
import Button from '../../components/ui/Button'
import { inputClass } from '../../components/ui/FormField'

interface Props {
  snapshot: SnapshotDetail
  conceptNames: Record<string, string>
  onDone: () => void
}

export default function PendingEntriesForm({ snapshot, conceptNames, onDone }: Props) {
  const qc = useQueryClient()
  const pendingEntries = snapshot.entries.filter((e) => e.is_pending)

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendingEntries.map((e) => [e.id, ''])),
  )
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())

  const mutation = useMutation({
    mutationFn: ({ entry, value }: { entry: ConceptEntryRead; value: number }) =>
      resolveEntry(snapshot.id, entry.id, value),
    onSuccess: (_, { entry }) => {
      setResolvedIds((prev) => new Set([...prev, entry.id]))
      qc.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })

  const remaining = pendingEntries.filter((e) => !resolvedIds.has(e.id))

  if (remaining.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-h)] font-medium">All entries resolved. Snapshot complete!</p>
        <Button variant="primary" size="sm" onClick={onDone}>Done</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-[var(--text-h)]">
          Resolve pending entries for snapshot {snapshot.date}
        </p>
        <p className="text-xs text-[var(--text)]">{remaining.length} value(s) need your input:</p>
      </div>
      <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
        {remaining.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <span className="text-sm text-[var(--text-h)] truncate block">
                {conceptNames[entry.concept_id] ?? entry.concept_id}
              </span>
              <span className="text-xs text-[var(--text)]">{entry.currency_code}</span>
            </div>
            <input
              type="number"
              step="any"
              value={values[entry.id] ?? ''}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [entry.id]: e.target.value }))
              }
              aria-label={`Value for ${conceptNames[entry.concept_id] ?? entry.concept_id}`}
              className={`${inputClass} w-28 shrink-0`}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const num = parseFloat(values[entry.id] ?? '')
                if (!isNaN(num)) mutation.mutate({ entry, value: num })
              }}
              disabled={mutation.isPending}
            >
              Save
            </Button>
          </li>
        ))}
      </ul>
      {mutation.isError && <p className="text-sm text-red-500">Error saving entry.</p>}
    </div>
  )
}
