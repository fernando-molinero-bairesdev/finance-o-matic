import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveEntry } from '../../lib/snapshotsApi'
import type { ConceptEntryRead, SnapshotDetail } from '../../lib/snapshotsApi'

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
      <div>
        <p>All entries resolved. Snapshot complete!</p>
        <button onClick={onDone}>Done</button>
      </div>
    )
  }

  return (
    <div>
      <h3>Resolve pending entries for snapshot {snapshot.date}</h3>
      <p>{remaining.length} value(s) need your input:</p>
      <ul>
        {remaining.map((entry) => (
          <li key={entry.id}>
            <span>{conceptNames[entry.concept_id] ?? entry.concept_id}</span>
            <span> ({entry.currency_code})</span>
            <input
              type="number"
              step="any"
              value={values[entry.id] ?? ''}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [entry.id]: e.target.value }))
              }
              aria-label={`Value for ${conceptNames[entry.concept_id] ?? entry.concept_id}`}
            />
            <button
              onClick={() => {
                const num = parseFloat(values[entry.id] ?? '')
                if (!isNaN(num)) mutation.mutate({ entry, value: num })
              }}
              disabled={mutation.isPending}
            >
              Save
            </button>
          </li>
        ))}
      </ul>
      {mutation.isError && <p>Error saving entry.</p>}
    </div>
  )
}
