import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProcess, updateProcess } from '../../lib/processesApi'
import { getConcepts } from '../../lib/conceptsApi'
import type { ProcessCadence, ProcessConceptScope, ProcessRead } from '../../lib/processesApi'

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
    >
      <div>
        <label htmlFor="process-name">Name</label>
        <input
          id="process-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="process-cadence">Cadence</label>
        <select
          id="process-cadence"
          value={cadence}
          onChange={(e) => setCadence(e.target.value as ProcessCadence)}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <div>
        <label htmlFor="process-scope">Concept scope</label>
        <select
          id="process-scope"
          value={scope}
          onChange={(e) => {
            const newScope = e.target.value as ProcessConceptScope
            setScope(newScope)
            if (newScope !== 'selected') setSelectedConceptIds([])
          }}
        >
          <option value="all">All concepts</option>
          <option value="selected">Selected concepts</option>
        </select>
      </div>

      {scope === 'selected' && concepts && (
        <fieldset>
          <legend>Select concepts</legend>
          {concepts.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                aria-label={c.name}
                checked={selectedConceptIds.includes(c.id)}
                onChange={() => toggleConcept(c.id)}
              />
              {c.name}
            </label>
          ))}
        </fieldset>
      )}

      {mutation.isError && (
        <p role="alert">Failed to {isEditing ? 'update' : 'create'} process. Please try again.</p>
      )}

      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending
          ? isEditing ? 'Saving…' : 'Creating…'
          : isEditing ? 'Save' : 'Create'}
      </button>

      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  )
}
