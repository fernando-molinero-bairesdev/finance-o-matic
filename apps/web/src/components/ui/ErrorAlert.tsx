interface ErrorAlertProps {
  message: string | null | undefined
  /** 'sm' = form-level with background (default); 'xs' = inline row, no background */
  size?: 'sm' | 'xs'
}

export default function ErrorAlert({ message, size = 'sm' }: ErrorAlertProps) {
  if (!message) return null
  if (size === 'xs') {
    return (
      <span role="alert" className="text-xs text-red-500 shrink-0">
        {message}
      </span>
    )
  }
  return (
    <p role="alert" className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
      {message}
    </p>
  )
}
