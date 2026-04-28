import { useMutation, useQueryClient } from '@tanstack/react-query'
import { initEntities } from '../../lib/entitiesApi'
import Button from '../../components/ui/Button'

interface Props {
  onSuccess?: () => void
}

export default function EntityInitButton({ onSuccess }: Props) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: initEntities,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
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
        Load starter entities
      </Button>

      {mutation.isSuccess && mutation.data.created.length === 0 && (
        <span className="text-xs text-[var(--text)]">
          Already loaded ({mutation.data.skipped.length} entit{mutation.data.skipped.length !== 1 ? 'ies' : 'y'} skipped)
        </span>
      )}

      {mutation.isSuccess && mutation.data.created.length > 0 && (
        <span className="text-xs text-[var(--text)]">
          {mutation.data.created.length} entit{mutation.data.created.length !== 1 ? 'ies' : 'y'} created
        </span>
      )}

      {mutation.isError && (
        <span role="alert" className="text-xs text-red-500">
          Failed to load entities. Make sure entity types are initialized first.
        </span>
      )}
    </div>
  )
}
