import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-white hover:opacity-90 focus-visible:ring-[var(--accent)]',
  secondary:
    'border border-[var(--border)] text-[var(--text-h)] bg-[var(--bg)] hover:bg-[var(--code-bg)] focus-visible:ring-[var(--accent)]',
  danger:
    'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 focus-visible:ring-red-400',
  ghost:
    'text-[var(--text)] hover:bg-[var(--code-bg)] hover:text-[var(--text-h)] focus-visible:ring-[var(--accent)]',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium',
        'transition-colors duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export default Button
