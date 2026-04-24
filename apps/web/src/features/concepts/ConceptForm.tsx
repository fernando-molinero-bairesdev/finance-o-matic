import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import { createConcept, getCurrencies } from '../../lib/conceptsApi'
import type { ConceptCreate, ConceptKind } from '../../lib/conceptsApi'

interface Props {
  onSuccess: () => void
}

export default function ConceptForm({ onSuccess }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ConceptKind>('value')
  const [currencyCode, setCurrencyCode] = useState('')
  const [literalValue, setLiteralValue] = useState('')
  const [expression, setExpression] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: getCurrencies,
  })

  const mutation = useMutation({
    mutationFn: (body: ConceptCreate) => createConcept(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['concepts'] })
      onSuccess()
    },
    onError: (err) => {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'A concept with that name already exists.'
          : 'An error occurred. Please try again.',
      )
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const body: ConceptCreate = {
      name,
      kind,
      currency_code: currencyCode,
      ...(kind === 'value' && literalValue !== '' ? { literal_value: parseFloat(literalValue) } : {}),
      ...(kind === 'formula' || kind === 'aux' ? { expression } : {}),
    }
    mutation.mutate(body)
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p role="alert">{error}</p>}

      <label>
        Name
        <input
          id="concept-name"
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      <label>
        Kind
        <select
          id="concept-kind"
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ConceptKind)}
        >
          <option value="value">Value</option>
          <option value="formula">Formula</option>
          <option value="group">Group</option>
          <option value="aux">Aux</option>
        </select>
      </label>

      <label>
        Currency
        <select
          id="concept-currency"
          aria-label="Currency"
          value={currencyCode}
          onChange={(e) => setCurrencyCode(e.target.value)}
        >
          <option value="">-- select --</option>
          {currencies?.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {kind === 'value' && (
        <label>
          Literal Value
          <input
            id="concept-literal-value"
            aria-label="Literal Value"
            type="number"
            value={literalValue}
            onChange={(e) => setLiteralValue(e.target.value)}
          />
        </label>
      )}

      {(kind === 'formula' || kind === 'aux') && (
        <label>
          Expression
          <input
            id="concept-expression"
            aria-label="Expression"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
          />
        </label>
      )}

      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}
