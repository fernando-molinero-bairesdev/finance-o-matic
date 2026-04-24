import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteConcept, getConcepts } from '../../lib/conceptsApi'

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

  if (isLoading) return <p>Loading concepts...</p>
  if (isError) return <p>Error loading concepts.</p>
  if (!data?.length) return <p>No concepts yet.</p>

  return (
    <ul>
      {data.map((c) => (
        <li key={c.id}>
          <span>{c.name}</span>
          <span> ({c.kind})</span>
          <button
            aria-label={`Delete ${c.name}`}
            onClick={() => deleteMutation.mutate(c.id)}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  )
}
