import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSnapshot } from '../../lib/snapshotsApi'
import type { SnapshotDetail } from '../../lib/snapshotsApi'

interface Props {
  onSnapshot: (snapshot: SnapshotDetail) => void
  onCancel: () => void
}

export default function TakeSnapshotForm({ onSnapshot, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [label, setLabel] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createSnapshot({ date, label: label || null }),
    onSuccess: (snapshot) => {
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      onSnapshot(snapshot)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <div>
        <label htmlFor="snapshot-date">Date</label>
        <input
          id="snapshot-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="snapshot-label">Label (optional)</label>
        <input
          id="snapshot-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. End of April"
        />
      </div>
      {mutation.isError && <p>Error taking snapshot.</p>}
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Taking snapshot…' : 'Take snapshot'}
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}
