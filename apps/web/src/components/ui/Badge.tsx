type Variant = 'success' | 'pending' | 'warning' | 'neutral' | 'purple'

interface BadgeProps {
  variant?: Variant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<Variant, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  warning: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  neutral: 'bg-[var(--code-bg)] text-[var(--text)]',
  purple: 'bg-[var(--accent-bg)] text-[var(--accent)]',
}

export default function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
