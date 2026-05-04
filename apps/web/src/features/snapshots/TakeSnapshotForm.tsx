import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSnapshot } from '../../lib/snapshotsApi'
import FormField, { inputClass } from '../../components/ui/FormField'
import ErrorAlert from '../../components/ui/ErrorAlert'
import FormActions from '../../components/ui/FormActions'

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
      <ErrorAlert message={mutation.isError ? 'Error creating snapshot.' : null} />
      <FormActions
        label="Open Snapshot"
        pendingLabel="Creating…"
        isPending={mutation.isPending}
        onCancel={onCancel}
      />
    </form>
  )
}
