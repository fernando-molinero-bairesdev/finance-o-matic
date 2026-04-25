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
import Button from '../../components/ui/Button'

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

  if (isLoading) return <p className="text-sm text-[var(--text)]">Loading processes...</p>
  if (isError) return <p className="text-sm text-red-500">Error loading processes.</p>
  if (!data?.length) return (
    <div className="text-center py-6 space-y-1">
      <p className="text-sm text-[var(--text-h)] font-medium">No processes yet</p>
      <p className="text-xs text-[var(--text)]">Add a process to automate periodic snapshots.</p>
    </div>
  )

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
    <ul className="divide-y divide-[var(--border)] -mx-4">
      {data.map((p) => (
        <li key={p.id} className="px-4 py-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-[var(--text-h)]">{p.name}</span>
                <span className="text-xs text-[var(--text)]">({p.cadence})</span>
                {!p.is_active && (
                  <span className="text-xs text-[var(--text)] bg-[var(--code-bg)] rounded-full px-2 py-0.5">
                    inactive
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-[var(--text)]">
                  {p.concept_scope === 'all'
                    ? 'all concepts'
                    : `${p.selected_concept_ids.length} concepts`}
                </span>
                {p.schedule?.next_run_at && (
                  <span className="text-xs text-[var(--text)]">
                    · next: {p.schedule.next_run_at}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit ${p.name}`}
              onClick={() => setEditingProcess(p)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Toggle active ${p.name}`}
              onClick={() => toggleActiveMutation.mutate({ id: p.id, is_active: !p.is_active })}
            >
              {p.is_active ? 'Deactivate' : 'Activate'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Take snapshot ${p.name}`}
              onClick={() => snapshotMutation.mutate(p.id)}
            >
              Take Snapshot
            </Button>
            <Button
              variant="danger"
              size="sm"
              aria-label={`Delete ${p.name}`}
              onClick={() => deleteMutation.mutate(p.id)}
            >
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
