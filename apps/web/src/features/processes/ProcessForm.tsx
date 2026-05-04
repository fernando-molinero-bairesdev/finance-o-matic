import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProcess, updateProcess } from '../../lib/processesApi'
import { getConcepts } from '../../lib/conceptsApi'
import type { ProcessCadence, ProcessConceptScope, ProcessRead } from '../../lib/processesApi'
import FormField, { inputClass, selectClass } from '../../components/ui/FormField'
import ErrorAlert from '../../components/ui/ErrorAlert'
import FormActions from '../../components/ui/FormActions'
import CheckboxGroup from '../../components/ui/CheckboxGroup'

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
        <CheckboxGroup
          legend="Select concepts"
          items={concepts}
          selectedIds={selectedConceptIds}
          onToggle={toggleConcept}
        />
      )}

      <ErrorAlert message={mutation.isError ? `Failed to ${isEditing ? 'update' : 'create'} process. Please try again.` : null} />

      <FormActions
        label={isEditing ? 'Save' : 'Create'}
        pendingLabel={isEditing ? 'Saving…' : 'Creating…'}
        isPending={mutation.isPending}
        onCancel={onCancel}
      />
    </form>
  )
}
