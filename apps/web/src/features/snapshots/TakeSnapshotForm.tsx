import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSnapshot } from '../../lib/snapshotsApi'
import Button from '../../components/ui/Button'
import FormField, { inputClass } from '../../components/ui/FormField'

interface Props {
  onSuccess: (snapshotId: string) => void
  onCancel: () => void
}

export default function TakeSnapshotForm({ onSuccess, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [label, setLabel] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createSnapshot({ date, label: label || null }),
    onSuccess: (snapshot) => {
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      onSuccess(snapshot.id)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
      className="space-y-3"
    >
      <FormField id="snapshot-date" label="Date">
        <input
          id="snapshot-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className={inputClass}
        />
      </FormField>
      <FormField id="snapshot-label" label="Label (optional)">
        <input
          id="snapshot-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. End of April"
          className={inputClass}
        />
      </FormField>
      {mutation.isError && (
        <p className="text-sm text-red-500">Error creating snapshot.</p>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating…' : 'Open Snapshot'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
