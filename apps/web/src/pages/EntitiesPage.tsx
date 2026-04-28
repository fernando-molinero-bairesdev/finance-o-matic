import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getEntityTypes,
  getEntities,
  getEntity,
  createEntity,
  updateEntity,
  deleteEntity,
  setPropertyValues,
} from '../lib/entitiesApi'
import type {
  EntityRead,
  EntityPropertyDefRead,
  EntityPropertyValueRead,
} from '../lib/entitiesApi'
import Button from '../components/ui/Button'
import FormField, { inputClass, selectClass } from '../components/ui/FormField'
import EntityInitButton from '../features/entities/EntityInitButton'

// ── Property value display ────────────────────────────────────────────────────

function displayValue(prop: EntityPropertyDefRead, vals: EntityPropertyValueRead[], entityNames: Record<string, string>): string {
  const matching = vals.filter((v) => v.property_def_id === prop.id)
  if (matching.length === 0) return '—'
  return matching.map((v) => {
    if (prop.value_type === 'decimal') return v.value_decimal !== null ? String(v.value_decimal) : '—'
    if (prop.value_type === 'string') return v.value_string ?? '—'
    if (prop.value_type === 'date') return v.value_date ?? '—'
    if (prop.value_type === 'entity_ref') return v.ref_entity_id ? (entityNames[v.ref_entity_id] ?? v.ref_entity_id.slice(0, 8) + '…') : '—'
    return '—'
  }).join(', ')
}

// ── Property value editor ─────────────────────────────────────────────────────

interface PropertyEditorProps {
  entityId: string
  prop: EntityPropertyDefRead
  currentValues: EntityPropertyValueRead[]
  refEntities: EntityRead[]
  onSaved: () => void
}

function PropertyEditor({ entityId, prop, currentValues, refEntities, onSaved }: PropertyEditorProps) {
  const qc = useQueryClient()
  const matching = currentValues.filter((v) => v.property_def_id === prop.id)

  const initialValue = (): string => {
    if (matching.length === 0) return ''
    const v = matching[0]
    if (prop.value_type === 'decimal') return v.value_decimal !== null ? String(v.value_decimal) : ''
    if (prop.value_type === 'string') return v.value_string ?? ''
    if (prop.value_type === 'date') return v.value_date ?? ''
    if (prop.value_type === 'entity_ref') return v.ref_entity_id ?? ''
    return ''
  }

  const [localVal, setLocalVal] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: () => {
      let payload: Record<string, unknown>[]
      if (localVal === '') {
        payload = []
      } else if (prop.value_type === 'decimal') {
        payload = [{ value_decimal: parseFloat(localVal) }]
      } else if (prop.value_type === 'string') {
        payload = [{ value_string: localVal }]
      } else if (prop.value_type === 'date') {
        payload = [{ value_date: localVal }]
      } else {
        payload = [{ ref_entity_id: localVal }]
      }
      return setPropertyValues(entityId, prop.id, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity', entityId] })
      onSaved()
    },
    onError: async (err: unknown) => {
      const e = err as { body?: { detail?: string } }
      setError(e?.body?.detail ?? 'Failed to save.')
    },
  })

  function renderInput() {
    if (prop.value_type === 'decimal') {
      return (
        <input
          type="number"
          step="any"
          className={`${inputClass} flex-1`}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          placeholder="0"
        />
      )
    }
    if (prop.value_type === 'string') {
      return (
        <input
          type="text"
          className={`${inputClass} flex-1`}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
        />
      )
    }
    if (prop.value_type === 'date') {
      return (
        <input
          type="date"
          className={`${inputClass} flex-1`}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
        />
      )
    }
    if (prop.value_type === 'entity_ref') {
      return (
        <select
          className={`${selectClass} flex-1`}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
        >
          <option value="">None</option>
          {refEntities.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      )
    }
    return null
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }}
      className="flex items-center gap-2 flex-1"
    >
      {renderInput()}
      {error && <span className="text-xs text-red-500">{error}</span>}
      <Button type="submit" variant="primary" size="sm" disabled={saveMutation.isPending}>
        {saveMutation.isPending ? '…' : 'Save'}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onSaved}>Cancel</Button>
    </form>
  )
}

// ── Entity Detail Panel ───────────────────────────────────────────────────────

interface EntityDetailPanelProps {
  entityId: string
  allEntities: EntityRead[]
}

function EntityDetailPanel({ entityId, allEntities }: EntityDetailPanelProps) {
  const [editingPropId, setEditingPropId] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => getEntity(entityId),
  })

  const { data: entityTypes } = useQuery({
    queryKey: ['entity-types'],
    queryFn: getEntityTypes,
  })

  if (isLoading) return <p className="px-4 py-2 text-xs text-[var(--text)]">Loading…</p>
  if (!data) return null

  const entityNames = Object.fromEntries(allEntities.map((e) => [e.id, e.name]))

  function getRefEntities(prop: EntityPropertyDefRead): EntityRead[] {
    if (!prop.ref_entity_type_id) return []
    return allEntities.filter((e) => e.entity_type_id === prop.ref_entity_type_id)
  }

  const typeMap = Object.fromEntries((entityTypes ?? []).map((et) => [et.id, et.name]))

  return (
    <div className="px-4 pb-3 border-t border-[var(--border)] bg-[var(--code-bg)]">
      {data.properties.length === 0 && (
        <p className="py-2 text-xs text-[var(--text)]">No properties defined for this entity type.</p>
      )}
      {data.properties.map((prop) => (
        <div key={prop.id} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-b-0">
          <div className="w-32 shrink-0">
            <p className="text-xs font-medium text-[var(--text-h)] truncate">{prop.name}</p>
            <p className="text-[10px] text-[var(--text)]">
              {prop.value_type === 'entity_ref' && prop.ref_entity_type_id
                ? `→ ${typeMap[prop.ref_entity_type_id] ?? 'entity'}`
                : prop.value_type}
            </p>
          </div>

          {editingPropId === prop.id ? (
            <PropertyEditor
              entityId={entityId}
              prop={prop}
              currentValues={data.values}
              refEntities={getRefEntities(prop)}
              onSaved={() => setEditingPropId(null)}
            />
          ) : (
            <>
              <span className="text-xs text-[var(--text-h)] flex-1">
                {displayValue(prop, data.values, entityNames)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingPropId(prop.id)}
              >
                Edit
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Entity Row ────────────────────────────────────────────────────────────────

interface EntityRowProps {
  entity: EntityRead
  allEntities: EntityRead[]
}

function EntityRow({ entity, allEntities }: EntityRowProps) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(entity.name)
  const [editError, setEditError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (name: string) => updateEntity(entity.id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      setEditing(false)
      setEditError(null)
    },
    onError: async (err: unknown) => {
      const e = err as { body?: { detail?: string } }
      setEditError(e?.body?.detail ?? 'Failed to update.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntity(entity.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entities'] }),
  })

  return (
    <li className="border-b border-[var(--border)] last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded((x) => !x)}
          className="text-[var(--text)] hover:text-[var(--text-h)] shrink-0"
        >
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
        </button>

        {editing ? (
          <form
            onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editName) }}
            className="flex items-center gap-2 flex-1"
          >
            <input
              autoFocus
              className={`${inputClass} flex-1`}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            {editError && <span className="text-xs text-red-500">{editError}</span>}
            <Button type="submit" variant="primary" size="sm" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? '…' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setEditing(false); setEditName(entity.name) }}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <span className="text-sm font-medium text-[var(--text-h)] flex-1">{entity.name}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </Button>
          </>
        )}
      </div>

      {expanded && (
        <EntityDetailPanel entityId={entity.id} allEntities={allEntities} />
      )}
    </li>
  )
}

// ── Create Entity Form ────────────────────────────────────────────────────────

interface CreateEntityFormProps {
  selectedTypeId: string
}

function CreateEntityForm({ selectedTypeId }: CreateEntityFormProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: entityTypes } = useQuery({
    queryKey: ['entity-types'],
    queryFn: getEntityTypes,
  })

  const [typeId, setTypeId] = useState(selectedTypeId)

  const createMutation = useMutation({
    mutationFn: () => createEntity({ entity_type_id: typeId, name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities'] })
      setName('')
      setError(null)
    },
    onError: async (err: unknown) => {
      const e = err as { body?: { detail?: string } }
      setError(e?.body?.detail ?? 'Failed to create entity.')
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim() && typeId) createMutation.mutate() }}
      className="flex items-start gap-2 px-4 py-3 border-t border-[var(--border)]"
    >
      <FormField id="new-entity-type-sel" label="" error={null}>
        <select
          id="new-entity-type-sel"
          className={`${selectClass} w-36`}
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
        >
          <option value="">Type…</option>
          {(entityTypes ?? []).map((et) => (
            <option key={et.id} value={et.id}>{et.name}</option>
          ))}
        </select>
      </FormField>
      <FormField id="new-entity-name" label="" error={error}>
        <input
          id="new-entity-name"
          className={`${inputClass} w-48`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Entity name"
        />
      </FormField>
      <Button
        type="submit"
        variant="primary"
        size="sm"
        disabled={createMutation.isPending || !name.trim() || !typeId}
        className="mt-0.5"
      >
        {createMutation.isPending ? 'Adding…' : 'Add Entity'}
      </Button>
    </form>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EntitiesPage() {
  const [filterTypeId, setFilterTypeId] = useState('')

  const { data: entityTypes } = useQuery({
    queryKey: ['entity-types'],
    queryFn: getEntityTypes,
  })

  const { data: allEntities, isLoading, isError } = useQuery({
    queryKey: ['entities'],
    queryFn: () => getEntities(),
  })

  const filtered = allEntities
    ? filterTypeId
      ? allEntities.filter((e) => e.entity_type_id === filterTypeId)
      : allEntities
    : []

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-h)]">Entities</h2>
          <p className="text-xs text-[var(--text)] mt-0.5">Real-world instances (loans, assets, accounts…)</p>
        </div>
        <select
          aria-label="Filter by entity type"
          className={`${selectClass} w-40`}
          value={filterTypeId}
          onChange={(e) => setFilterTypeId(e.target.value)}
        >
          <option value="">All types</option>
          {(entityTypes ?? []).map((et) => (
            <option key={et.id} value={et.id}>{et.name}</option>
          ))}
        </select>
      </div>

      {isLoading && <p className="px-4 py-3 text-sm text-[var(--text)]">Loading…</p>}
      {isError && <p className="px-4 py-3 text-sm text-red-500">Error loading entities.</p>}

      {allEntities && (
        <>
          {filtered.length === 0 ? (
            <div className="px-4 py-4 space-y-3">
              <p className="text-sm text-[var(--text)]">No entities found.</p>
              <EntityInitButton />
            </div>
          ) : (
            <>
              <ul>
                {filtered.map((entity) => (
                  <EntityRow key={entity.id} entity={entity} allEntities={allEntities} />
                ))}
              </ul>
              <div className="px-4 py-3 border-t border-[var(--border)]">
                <EntityInitButton />
              </div>
            </>
          )}
          <CreateEntityForm selectedTypeId={filterTypeId} />
        </>
      )}
    </section>
  )
}
