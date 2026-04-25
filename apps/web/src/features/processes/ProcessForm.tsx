import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProcess, updateProcess } from '../../lib/processesApi'
import { getConcepts } from '../../lib/conceptsApi'
import type { ProcessCadence, ProcessConceptScope, ProcessRead } from '../../lib/processesApi'
import Button from '../../components/ui/Button'
import FormField, { inputClass, selectClass } from '../../components/ui/FormField'

interface Props {
  process?: ProcessRead
  onSuccess?: () => void
  onCancel?: () => void
}

export default function ProcessForm({ process, onSuccess, onCancel }: Props) {
  const qc = useQueryClient()
  const isEditing = !!process

  const [name, setName] = useState(process?.name ?? '')
  const [cadence, setCadence] = useState<ProcessCadence>(process?.cadence ?? 'monthly')
  const [scope, setScope] = useState<ProcessConceptScope>(process?.concept_scope ?? 'all')
  const [selectedConceptIds, setSelectedConceptIds] = useState<string[]>(
    process?.selected_concept_ids ?? [],
  )

  const { data: concepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
    enabled: scope === 'selected',
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        cadence,
        concept_scope: scope,
        selected_concept_ids: scope === 'selected' ? selectedConceptIds : undefined,
      }
      return isEditing ? updateProcess(process.id, payload) : createProcess(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processes'] })
      onSuccess?.()
    },
  })

  function toggleConcept(id: string) {
    setSelectedConceptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
      className="space-y-3"
    >
      <FormField id="process-name" label="Name">
        <input
          id="process-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={inputClass}
        />
      </FormField>

      <FormField id="process-cadence" label="Cadence">
        <select
          id="process-cadence"
          value={cadence}
          onChange={(e) => setCadence(e.target.value as ProcessCadence)}
          className={selectClass}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="manual">Manual</option>
        </select>
      </FormField>

      <FormField id="process-scope" label="Concept scope">
        <select
          id="process-scope"
          value={scope}
          onChange={(e) => {
            const newScope = e.target.value as ProcessConceptScope
            setScope(newScope)
            if (newScope !== 'selected') setSelectedConceptIds([])
          }}
          className={selectClass}
        >
          <option value="all">All concepts</option>
          <option value="selected">Selected concepts</option>
        </select>
      </FormField>

      {scope === 'selected' && concepts && (
        <fieldset className="border border-[var(--border)] rounded-lg p-3 space-y-2">
          <legend className="text-xs font-medium text-[var(--text-h)] px-1">Select concepts</legend>
          {concepts.map((c) => (
            <label key={c.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                aria-label={c.name}
                checked={selectedConceptIds.includes(c.id)}
                onChange={() => toggleConcept(c.id)}
                className="accent-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-h)]">{c.name}</span>
            </label>
          ))}
        </fieldset>
      )}

      {mutation.isError && (
        <p role="alert" className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
          Failed to {isEditing ? 'update' : 'create'} process. Please try again.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>
          {mutation.isPending
            ? isEditing ? 'Saving…' : 'Creating…'
            : isEditing ? 'Save' : 'Create'}
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
