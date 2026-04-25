import { useMutation, useQueryClient } from '@tanstack/react-query'
import { initConcepts } from '../../lib/conceptsApi'
import Button from '../../components/ui/Button'

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
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        Initialize concepts
      </Button>

      {mutation.isSuccess && mutation.data.created.length === 0 && (
        <span className="text-xs text-[var(--text)]">
          Already initialized ({mutation.data.skipped.length} concept{mutation.data.skipped.length !== 1 ? 's' : ''} skipped)
        </span>
      )}

      {mutation.isSuccess && mutation.data.created.length > 0 && (
        <span className="text-xs text-[var(--text)]">
          {mutation.data.created.length} concept{mutation.data.created.length !== 1 ? 's' : ''} created
        </span>
      )}

      {mutation.isError && (
        <span role="alert" className="text-xs text-red-500">
          Failed to initialize concepts. Please try again.
        </span>
      )}
    </div>
  )
}
