import type { ReactNode } from 'react'

interface AsyncStateGuardProps {
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
  emptyContent: ReactNode
  children: ReactNode
  loadingText?: string
  errorText?: string
}

export default function AsyncStateGuard({
  isLoading,
  isError,
  isEmpty,
  emptyContent,
  children,
  loadingText = 'Loading…',
  errorText = 'Error loading.',
}: AsyncStateGuardProps) {
  if (isLoading) return <p className="text-sm text-[var(--text)]">{loadingText}</p>
  if (isError) return <p className="text-sm text-red-500">{errorText}</p>
  if (isEmpty) return <div className="text-center py-6">{emptyContent}</div>
  return <>{children}</>
}
