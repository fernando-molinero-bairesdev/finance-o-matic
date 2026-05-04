import Button from './Button'

interface FormActionsProps {
  label: string
  pendingLabel: string
  isPending: boolean
  onCancel?: () => void
}

export default function FormActions({ label, pendingLabel, isPending, onCancel }: FormActionsProps) {
  return (
    <div className="flex gap-2 pt-1">
      <Button type="submit" variant="primary" size="sm" disabled={isPending}>
        {isPending ? pendingLabel : label}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}
