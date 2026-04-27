import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteConcept, getConcepts } from '../../lib/conceptsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import Button from '../../components/ui/Button'
import ConceptForm from './ConceptForm'

export default function ConceptList() {
  const qc = useQueryClient()
  const [editingConcept, setEditingConcept] = useState<ConceptRead | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteConcept,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['concepts'] }),
  })

  if (isLoading) return <p className="text-sm text-[var(--text)]">Loading concepts...</p>
  if (isError) return <p className="text-sm text-red-500">Error loading concepts.</p>
  if (!data?.length) return (
    <div className="text-center py-6 space-y-1">
      <p className="text-sm text-[var(--text-h)] font-medium">No concepts yet</p>
      <p className="text-xs text-[var(--text)]">Add your first concept or initialize the starter set above.</p>
    </div>
  )

  return (
    <ul className="divide-y divide-[var(--border)] -mx-4">
      {data.map((c) => (
        <li key={c.id}>
          {editingConcept?.id === c.id ? (
            <div className="px-4 py-3">
              <ConceptForm
                concept={c}
                onSuccess={() => setEditingConcept(null)}
                onCancel={() => setEditingConcept(null)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-[var(--text-h)] truncate">{c.name}</span>
                <span className="text-xs text-[var(--text)] shrink-0">({c.kind})</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${c.name}`}
                  onClick={() => setEditingConcept(c)}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => deleteMutation.mutate(c.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
