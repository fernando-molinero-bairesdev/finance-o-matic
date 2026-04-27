import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import { createConcept, updateConcept, getCurrencies } from '../../lib/conceptsApi'
import type { ConceptCreate, ConceptUpdate, ConceptKind, ConceptRead } from '../../lib/conceptsApi'
import Button from '../../components/ui/Button'
import FormField, { inputClass, selectClass } from '../../components/ui/FormField'

interface Props {
  concept?: ConceptRead
  onSuccess: () => void
  onCancel?: () => void
}

export default function ConceptForm({ concept, onSuccess, onCancel }: Props) {
  const isEditing = !!concept
  const qc = useQueryClient()
  const [name, setName] = useState(concept?.name ?? '')
  const [kind, setKind] = useState<ConceptKind>(concept?.kind ?? 'value')
  const [currencyCode, setCurrencyCode] = useState(concept?.currency_code ?? '')
  const [literalValue, setLiteralValue] = useState(
    concept?.literal_value !== null && concept?.literal_value !== undefined
      ? String(concept.literal_value)
      : '',
  )
  const [expression, setExpression] = useState(concept?.expression ?? '')
  const [error, setError] = useState<string | null>(null)

  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: getCurrencies,
  })

  const mutation = useMutation({
    mutationFn: (body: ConceptCreate | ConceptUpdate) =>
      isEditing ? updateConcept(concept.id, body as ConceptUpdate) : createConcept(body as ConceptCreate),
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
    const body: ConceptCreate | ConceptUpdate = {
      name,
      ...(isEditing ? {} : { kind }),
      currency_code: currencyCode,
      ...(kind === 'value' && literalValue !== '' ? { literal_value: parseFloat(literalValue) } : {}),
      ...(kind === 'formula' || kind === 'aux' ? { expression } : {}),
    }
    mutation.mutate(body)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <FormField id="concept-name" label="Name">
        <input
          id="concept-name"
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={inputClass}
        />
      </FormField>

      <FormField id="concept-kind" label="Kind">
        <select
          id="concept-kind"
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ConceptKind)}
          disabled={isEditing}
          className={selectClass}
        >
          <option value="value">Value</option>
          <option value="formula">Formula</option>
          <option value="group">Group</option>
          <option value="aux">Aux</option>
        </select>
      </FormField>

      <FormField id="concept-currency" label="Currency">
        <select
          id="concept-currency"
          aria-label="Currency"
          value={currencyCode}
          onChange={(e) => setCurrencyCode(e.target.value)}
          className={selectClass}
        >
          <option value="">-- select --</option>
          {currencies?.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>

      {kind === 'value' && (
        <FormField id="concept-literal-value" label="Literal Value">
          <input
            id="concept-literal-value"
            aria-label="Literal Value"
            type="number"
            value={literalValue}
            onChange={(e) => setLiteralValue(e.target.value)}
            className={inputClass}
          />
        </FormField>
      )}

      {(kind === 'formula' || kind === 'aux') && (
        <FormField id="concept-expression" label="Expression">
          <input
            id="concept-expression"
            aria-label="Expression"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            className={inputClass}
          />
        </FormField>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save' : 'Create')}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
