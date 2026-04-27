import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getEntityTypes,
  createEntityType,
  updateEntityType,
  deleteEntityType,
  addEntityProperty,
  deleteEntityProperty,
  initEntityTypes,
} from '../lib/entitiesApi'
import type { EntityTypeDetail, EntityPropertyDefRead, EntityPropertyDefCreate } from '../lib/entitiesApi'
import Button from '../components/ui/Button'
import FormField, { inputClass, selectClass } from '../components/ui/FormField'

// ── Property type label ───────────────────────────────────────────────────────

function propTypeLabel(vt: string, refTypeName?: string) {
  if (vt === 'entity_ref') return refTypeName ? `→ ${refTypeName}` : 'entity ref'
  return vt
}

// ── Add Property Form ─────────────────────────────────────────────────────────

interface AddPropertyFormProps {
  entityTypeId: string
  allEntityTypes: EntityTypeDetail[]
  onDone: () => void
}

function AddPropertyForm({ entityTypeId, allEntityTypes, onDone }: AddPropertyFormProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [valueType, setValueType] = useState<EntityPropertyDefCreate['value_type']>('decimal')
  const [refEntityTypeId, setRefEntityTypeId] = useState('')
  const [cardinality, setCardinality] = useState<'one' | 'many'>('one')
  const [nullable, setNullable] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const addMutation = useMutation({
    mutationFn: (body: EntityPropertyDefCreate) => addEntityProperty(entityTypeId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity-types'] })
      onDone()
    },
    onError: async (err: unknown) => {
      const e = err as { status?: number; body?: { detail?: string } }
      setError(e?.body?.detail ?? 'Failed to add property.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Name is required.'); return }
    if (valueType === 'entity_ref' && !refEntityTypeId) { setError('Select a reference entity type.'); return }
    addMutation.mutate({
      name: name.trim(),
      value_type: valueType,
      ref_entity_type_id: valueType === 'entity_ref' ? refEntityTypeId : null,
      cardinality,
      nullable,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FormField id={`prop-name-${entityTypeId}`} label="Name" error={null}>
          <input
            id={`prop-name-${entityTypeId}`}
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="property name"
          />
        </FormField>
        <FormField id={`prop-type-${entityTypeId}`} label="Type" error={null}>
          <select
            id={`prop-type-${entityTypeId}`}
            className={selectClass}
            value={valueType}
            onChange={(e) => setValueType(e.target.value as EntityPropertyDefCreate['value_type'])}
          >
            <option value="decimal">decimal</option>
            <option value="string">string</option>
            <option value="date">date</option>
            <option value="entity_ref">entity ref</option>
          </select>
        </FormField>
      </div>

      {valueType === 'entity_ref' && (
        <FormField id={`prop-ref-${entityTypeId}`} label="References entity type" error={null}>
          <select
            id={`prop-ref-${entityTypeId}`}
            className={selectClass}
            value={refEntityTypeId}
            onChange={(e) => setRefEntityTypeId(e.target.value)}
          >
            <option value="">Select…</option>
            {allEntityTypes.map((et) => (
              <option key={et.id} value={et.id}>{et.name}</option>
            ))}
          </select>
        </FormField>
      )}

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-h)] cursor-pointer">
          <input
            type="checkbox"
            checked={cardinality === 'many'}
            onChange={(e) => setCardinality(e.target.checked ? 'many' : 'one')}
          />
          Allow multiple values
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-h)] cursor-pointer">
          <input
            type="checkbox"
            checked={nullable}
            onChange={(e) => setNullable(e.target.checked)}
          />
          Nullable
        </label>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={addMutation.isPending}>
          {addMutation.isPending ? 'Adding…' : 'Add Property'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

// ── Property List ─────────────────────────────────────────────────────────────

interface PropertyListProps {
  entityTypeId: string
  properties: EntityPropertyDefRead[]
  allEntityTypes: EntityTypeDetail[]
}

function PropertyList({ entityTypeId, properties, allEntityTypes }: PropertyListProps) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: (propId: string) => deleteEntityProperty(entityTypeId, propId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entity-types'] }),
  })

  const typeMap = Object.fromEntries(allEntityTypes.map((et) => [et.id, et.name]))

  return (
    <div className="ml-4 mt-2 border-l-2 border-[var(--border)] pl-3">
      {properties.length === 0 && !adding && (
        <p className="text-xs text-[var(--text)] mb-2">No properties defined.</p>
      )}
      {properties.map((p) => (
        <div key={p.id} className="flex items-center justify-between py-1 group">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-[var(--text-h)] truncate">{p.name}</span>
            <span className="text-[10px] text-[var(--text)] bg-[var(--code-bg)] rounded px-1.5 py-0.5">
              {propTypeLabel(p.value_type, p.ref_entity_type_id ? typeMap[p.ref_entity_type_id] : undefined)}
            </span>
            {p.cardinality === 'many' && (
              <span className="text-[10px] text-[var(--text)]">many</span>
            )}
            {!p.nullable && (
              <span className="text-[10px] text-amber-500">required</span>
            )}
          </div>
          <button
            type="button"
            aria-label={`Delete property ${p.name}`}
            onClick={() => deleteMutation.mutate(p.id)}
            disabled={deleteMutation.isPending}
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity"
          >
            ×
          </button>
        </div>
      ))}

      {adding ? (
        <AddPropertyForm
          entityTypeId={entityTypeId}
          allEntityTypes={allEntityTypes}
          onDone={() => setAdding(false)}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAdding(true)}
          className="mt-1 text-xs"
        >
          + Add property
        </Button>
      )}
    </div>
  )
}

// ── Entity Type Row ───────────────────────────────────────────────────────────

interface EntityTypeRowProps {
  et: EntityTypeDetail
  allEntityTypes: EntityTypeDetail[]
}

function EntityTypeRow({ et, allEntityTypes }: EntityTypeRowProps) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(et.name)
  const [editError, setEditError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (name: string) => updateEntityType(et.id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity-types'] })
      setEditing(false)
      setEditError(null)
    },
    onError: async (err: unknown) => {
      const e = err as { status?: number; body?: { detail?: string } }
      setEditError(e?.body?.detail ?? 'Failed to update.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntityType(et.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entity-types'] }),
    onError: async (err: unknown) => {
      const e = err as { status?: number; body?: { detail?: string } }
      alert(e?.body?.detail ?? 'Cannot delete entity type.')
    },
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
            <Button type="button" variant="secondary" size="sm" onClick={() => { setEditing(false); setEditName(et.name) }}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <span className="text-sm font-medium text-[var(--text-h)] flex-1">{et.name}</span>
            <span className="text-xs text-[var(--text)]">{et.properties.length} props</span>
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
        <div className="px-4 pb-3">
          <PropertyList
            entityTypeId={et.id}
            properties={et.properties}
            allEntityTypes={allEntityTypes}
          />
        </div>
      )}
    </li>
  )
}

// ── Create Entity Type Form ───────────────────────────────────────────────────

function CreateEntityTypeForm() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => createEntityType({ name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity-types'] })
      setName('')
      setError(null)
    },
    onError: async (err: unknown) => {
      const e = err as { status?: number; body?: { detail?: string } }
      setError(e?.body?.detail ?? 'Failed to create.')
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate() }}
      className="flex items-start gap-2 px-4 py-3 border-t border-[var(--border)]"
    >
      <FormField id="new-entity-type-name" label="" error={error}>
        <input
          id="new-entity-type-name"
          className={`${inputClass} w-48`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New entity type name"
        />
      </FormField>
      <Button
        type="submit"
        variant="primary"
        size="sm"
        disabled={createMutation.isPending || !name.trim()}
        className="mt-0.5"
      >
        {createMutation.isPending ? 'Adding…' : 'Add Type'}
      </Button>
    </form>
  )
}

// ── Init Button ───────────────────────────────────────────────────────────────

function EntityTypeInitButton() {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: initEntityTypes,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entity-types'] }),
  })

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Initialize entity types
      </Button>
      {mutation.isSuccess && mutation.data.created.length === 0 && (
        <span className="text-xs text-[var(--text)]">
          Already initialized ({mutation.data.skipped.length} skipped)
        </span>
      )}
      {mutation.isSuccess && mutation.data.created.length > 0 && (
        <span className="text-xs text-[var(--text)]">
          {mutation.data.created.length} type{mutation.data.created.length !== 1 ? 's' : ''} created
        </span>
      )}
      {mutation.isError && (
        <span className="text-xs text-red-500">Failed to initialize.</span>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EntityTypesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['entity-types'],
    queryFn: getEntityTypes,
  })

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-h)]">Entity Types</h2>
          <p className="text-xs text-[var(--text)] mt-0.5">
            Define schemas for real-world entities (e.g. loans, assets, accounts).
          </p>
        </div>
        <EntityTypeInitButton />
      </div>

      {isLoading && <p className="px-4 py-3 text-sm text-[var(--text)]">Loading…</p>}
      {isError && <p className="px-4 py-3 text-sm text-red-500">Error loading entity types.</p>}

      {data && (
        <>
          {data.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[var(--text)]">No entity types yet.</p>
          ) : (
            <ul>
              {data.map((et) => (
                <EntityTypeRow key={et.id} et={et} allEntityTypes={data} />
              ))}
            </ul>
          )}
          <CreateEntityTypeForm />
        </>
      )}
    </section>
  )
}
