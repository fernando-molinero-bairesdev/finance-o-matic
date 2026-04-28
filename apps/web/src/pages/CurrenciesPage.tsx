import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCurrencies,
  createCurrency,
  updateCurrency,
  deleteCurrency,
  initCurrencies,
} from '../lib/currenciesApi'
import type { CurrencyRead } from '../lib/currenciesApi'
import { ApiError } from '../lib/apiClient'
import Button from '../components/ui/Button'
import FormField, { inputClass } from '../components/ui/FormField'

// ── CurrencyRow ───────────────────────────────────────────────────────────────

interface CurrencyRowProps {
  currency: CurrencyRead
}

function CurrencyRow({ currency }: CurrencyRowProps) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(currency.name)
  const [error, setError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: () => updateCurrency(currency.code, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currencies'] })
      setEditing(false)
      setError(null)
    },
    onError: () => setError('Failed to save.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCurrency(currency.code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currencies'] }),
    onError: (err) => {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'In use by one or more concepts.'
          : 'Failed to delete.',
      )
    },
  })

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] last:border-b-0">
      <span className="w-12 shrink-0 font-mono text-xs font-semibold text-[var(--accent)]">
        {currency.code}
      </span>

      {editing ? (
        <>
          <input
            aria-label={`Name for ${currency.code}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} flex-1 text-sm`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateMutation.mutate()
              if (e.key === 'Escape') { setEditing(false); setName(currency.name); setError(null) }
            }}
            autoFocus
          />
          <Button variant="primary" size="sm" disabled={updateMutation.isPending || !name.trim()} onClick={() => updateMutation.mutate()}>
            {updateMutation.isPending ? '…' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setName(currency.name); setError(null) }}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-[var(--text-h)]">{currency.name}</span>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          <Button
            variant="danger"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? '…' : 'Delete'}
          </Button>
        </>
      )}

      {error && (
        <span role="alert" className="text-xs text-red-500 shrink-0">{error}</span>
      )}
    </li>
  )
}

// ── CreateCurrencyForm ────────────────────────────────────────────────────────

function CreateCurrencyForm() {
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => createCurrency({ code: code.trim().toUpperCase(), name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currencies'] })
      setCode('')
      setName('')
      setError(null)
    },
    onError: (err) => {
      setError(
        err instanceof ApiError && err.status === 409
          ? `Currency '${code.toUpperCase()}' already exists.`
          : 'Failed to create.',
      )
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-[var(--border)] space-y-3">
      <p className="text-xs font-semibold text-[var(--text-h)]">Add currency</p>
      {error && (
        <p role="alert" className="text-xs text-red-500">{error}</p>
      )}
      <div className="flex gap-2 items-end">
        <FormField id="currency-code" label="Code (ISO 4217)">
          <input
            id="currency-code"
            aria-label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={10}
            placeholder="USD"
            required
            className={`${inputClass} w-24 font-mono uppercase`}
          />
        </FormField>
        <FormField id="currency-name" label="Name">
          <input
            id="currency-name"
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="US Dollar"
            required
            className={`${inputClass} flex-1`}
          />
        </FormField>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={mutation.isPending || !code.trim() || !name.trim()}
          className="mb-0.5"
        >
          {mutation.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </form>
  )
}

// ── CurrencyInitButton ────────────────────────────────────────────────────────

function CurrencyInitButton() {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: initCurrencies,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currencies'] }),
  })

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        Load standard currencies
      </Button>
      {mutation.isSuccess && mutation.data.created.length === 0 && (
        <span className="text-xs text-[var(--text)]">
          Already loaded ({mutation.data.skipped.length} skipped)
        </span>
      )}
      {mutation.isSuccess && mutation.data.created.length > 0 && (
        <span className="text-xs text-[var(--text)]">
          {mutation.data.created.length} currencies added
        </span>
      )}
      {mutation.isError && (
        <span role="alert" className="text-xs text-red-500">Failed to load currencies.</span>
      )}
    </div>
  )
}

// ── CurrenciesPage ────────────────────────────────────────────────────────────

export default function CurrenciesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['currencies'],
    queryFn: getCurrencies,
  })

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-h)]">Currencies</h2>
          <p className="text-xs text-[var(--text)] mt-0.5">ISO 4217 codes used by concepts and entries</p>
        </div>
        <CurrencyInitButton />
      </div>

      {isLoading && <p className="px-4 py-3 text-sm text-[var(--text)]">Loading…</p>}
      {isError && <p className="px-4 py-3 text-sm text-red-500">Error loading currencies.</p>}

      {data && (
        <>
          {data.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[var(--text)]">
              No currencies yet. Click "Load standard currencies" to add ISO 4217 defaults.
            </p>
          ) : (
            <ul>
              {data.map((c) => (
                <CurrencyRow key={c.code} currency={c} />
              ))}
            </ul>
          )}
          <CreateCurrencyForm />
        </>
      )}
    </section>
  )
}
