import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteProcess,
  getProcesses,
  updateProcess,
  takeProcessSnapshot,
} from '../../lib/processesApi'
import type { ProcessRead } from '../../lib/processesApi'
import ProcessForm from './ProcessForm'

export default function ProcessList() {
  const qc = useQueryClient()
  const [editingProcess, setEditingProcess] = useState<ProcessRead | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['processes'],
    queryFn: getProcesses,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProcess,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateProcess(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })

  const snapshotMutation = useMutation({
    mutationFn: (id: string) =>
      takeProcessSnapshot(id, { date: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }),
  })

  if (isLoading) return <p>Loading processes...</p>
  if (isError) return <p>Error loading processes.</p>
  if (!data?.length) return <p>No processes yet.</p>

  if (editingProcess) {
    return (
      <ProcessForm
        process={editingProcess}
        onSuccess={() => setEditingProcess(null)}
        onCancel={() => setEditingProcess(null)}
      />
    )
  }

  return (
    <ul>
      {data.map((p) => (
        <li key={p.id}>
          <span>{p.name}</span>
          <span> ({p.cadence})</span>
          <span>
            {p.concept_scope === 'all'
              ? ' · all concepts'
              : ` · ${p.selected_concept_ids.length} concepts`}
          </span>
          {!p.is_active && <span> [inactive]</span>}
          {p.schedule?.next_run_at && (
            <span> — next: {p.schedule.next_run_at}</span>
          )}
          <button
            aria-label={`Edit ${p.name}`}
            onClick={() => setEditingProcess(p)}
          >
            Edit
          </button>
          <button
            aria-label={`Toggle active ${p.name}`}
            onClick={() => toggleActiveMutation.mutate({ id: p.id, is_active: !p.is_active })}
          >
            {p.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            aria-label={`Take snapshot ${p.name}`}
            onClick={() => snapshotMutation.mutate(p.id)}
          >
            Take Snapshot
          </button>
          <button
            aria-label={`Delete ${p.name}`}
            onClick={() => deleteMutation.mutate(p.id)}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  )
}
