import { type ReactNode } from 'react'

interface FormFieldProps {
  id: string
  label: string
  error?: string | null
  children: ReactNode
}

export default function FormField({ id, label, error, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-[var(--text-h)]">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm ' +
  'text-[var(--text-h)] placeholder-[var(--text)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-0 ' +
  'disabled:opacity-50 transition-shadow'

export const selectClass = inputClass
