import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteConcept, getConcepts } from '../../lib/conceptsApi'
import Button from '../../components/ui/Button'

export default function ConceptList() {
  const qc = useQueryClient()

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
  if (!data?.length) return <p className="text-sm text-[var(--text)]">No concepts yet.</p>

  return (
    <ul className="divide-y divide-[var(--border)] -mx-4">
      {data.map((c) => (
        <li key={c.id} className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-[var(--text-h)] truncate">{c.name}</span>
            <span className="text-xs text-[var(--text)] shrink-0">({c.kind})</span>
          </div>
          <Button
            variant="danger"
            size="sm"
            aria-label={`Delete ${c.name}`}
            onClick={() => deleteMutation.mutate(c.id)}
          >
            Delete
          </Button>
        </li>
      ))}
    </ul>
  )
}
