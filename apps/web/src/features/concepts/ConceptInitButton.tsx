import { useMutation, useQueryClient } from '@tanstack/react-query'
import { initConcepts } from '../../lib/conceptsApi'

interface Props {
  onSuccess?: () => void
}

export default function ConceptInitButton({ onSuccess }: Props) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: initConcepts,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['concepts'] })
      onSuccess?.()
    },
  })

  return (
    <div>
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        Initialize concepts
      </button>

      {mutation.isSuccess && mutation.data.created.length === 0 && (
        <p>Already initialized ({mutation.data.skipped.length} concept{mutation.data.skipped.length !== 1 ? 's' : ''} skipped)</p>
      )}

      {mutation.isSuccess && mutation.data.created.length > 0 && (
        <p>{mutation.data.created.length} concept{mutation.data.created.length !== 1 ? 's' : ''} created</p>
      )}

      {mutation.isError && (
        <p role="alert">Failed to initialize concepts. Please try again.</p>
      )}
    </div>
  )
}
