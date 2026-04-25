import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import Button from '../../components/ui/Button'
import FormField, { inputClass } from '../../components/ui/FormField'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await register(email, password)
      navigate('/dashboard')
    } catch {
      setError('Registration failed. The email may already be in use.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-svh flex items-center justify-center px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--text-h)]">finance-o-matic</h1>
          <p className="text-sm text-[var(--text)]">Create your account</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-6 space-y-4">
          <form onSubmit={handleSubmit} aria-label="Register form" className="space-y-4">
            <FormField id="email" label="Email">
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField id="password" label="Password">
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </FormField>
            {error && (
              <p role="alert" className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </div>
        <p className="text-center text-sm text-[var(--text)]">
          Already have an account?{' '}
          <Link to="/login" className="text-[var(--accent)] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
