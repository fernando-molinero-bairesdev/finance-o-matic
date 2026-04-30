import { useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/apiClient'
import { getConcepts, createConcept, updateConcept } from '../../lib/conceptsApi'
import type { ConceptRead } from '../../lib/conceptsApi'
import { getCurrencies } from '../../lib/currenciesApi'
import Button from '../../components/ui/Button'
import { inputClass, selectClass } from '../../components/ui/FormField'

// ── helpers ───────────────────────────────────────────────────────────────────

const POOL_ID = '__pool__'

function makeDragId(conceptId: string, sourceId: string) {
  return `${conceptId}::${sourceId}`
}
function parseDragId(id: string): { conceptId: string; sourceId: string } {
  const [conceptId, sourceId] = id.split('::')
  return { conceptId, sourceId }
}

const KIND_COLOR: Record<string, string> = {
  value:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  formula: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  aux:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

// ── DraggableCard ─────────────────────────────────────────────────────────────

interface DraggableCardProps {
  concept: ConceptRead
  sourceId: string
  isDragOverlay?: boolean
}

function DraggableCard({ concept, sourceId, isDragOverlay = false }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: makeDragId(concept.id, sourceId),
  })

  return (
    <div
      ref={setNodeRef}
      style={isDragOverlay ? undefined : { transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className={[
        'flex items-center gap-2 px-2.5 py-2 rounded-lg border select-none',
        'bg-[var(--bg)] border-[var(--border)]',
        'cursor-grab active:cursor-grabbing',
        isDragging && !isDragOverlay ? 'opacity-40' : '',
        isDragOverlay ? 'shadow-lg ring-1 ring-[var(--accent)]/30 rotate-1' : '',
      ].join(' ')}
    >
      <span className="text-[var(--text)] opacity-40 shrink-0 text-sm leading-none">⠿</span>
      <span className="text-xs font-medium text-[var(--text-h)] truncate flex-1">{concept.name}</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${KIND_COLOR[concept.kind] ?? ''}`}>
        {concept.kind}
      </span>
    </div>
  )
}

// ── ConceptsColumn (all concepts, drag-and-drop source) ──────────────────────

interface ConceptsColumnProps {
  concepts: ConceptRead[]   // filtered by search
}

function ConceptsColumn({ concepts }: ConceptsColumnProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3 min-w-[220px] w-[220px] shrink-0 border-[var(--border)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]">
        <span className="text-xs font-semibold text-[var(--text)]">Concepts</span>
        <span className="text-[10px] text-[var(--text)]">{concepts.length}</span>
      </div>

      <div className="flex flex-col gap-1.5 min-h-[60px]">
        {concepts.map((c) => (
          <DraggableCard key={c.id} concept={c} sourceId={POOL_ID} />
        ))}
        {concepts.length === 0 && (
          <p className="text-[10px] text-[var(--text)] opacity-50 text-center py-3">
            No concepts match
          </p>
        )}
      </div>
    </div>
  )
}

// ── GroupColumn (members only, × to remove, droppable) ───────────────────────

interface GroupColumnProps {
  group: ConceptRead
  members: ConceptRead[]    // current members of this group
  onRemove: (conceptId: string, groupId: string) => void
}

function GroupColumn({ group, members, onRemove }: GroupColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id })

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex flex-col gap-2 rounded-xl border p-3 min-w-[220px] w-[220px] shrink-0 transition-colors',
        isOver
          ? 'border-[var(--accent)] bg-[var(--accent)]/5'
          : 'border-[var(--border)] bg-[var(--bg)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]">
        <span className="text-xs font-semibold text-[var(--accent)] truncate">{group.name}</span>
        <span className="text-[10px] text-[var(--text)] shrink-0">{members.length}</span>
      </div>

      <div className="flex flex-col gap-1.5 min-h-[60px]">
        {members.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-[var(--bg)] border-[var(--border)] select-none"
          >
            <span className="text-xs font-medium text-[var(--text-h)] truncate flex-1">{c.name}</span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${KIND_COLOR[c.kind] ?? ''}`}>
              {c.kind}
            </span>
            <button
              onClick={() => onRemove(c.id, group.id)}
              className="shrink-0 text-[var(--text)] hover:text-red-500 transition-colors leading-none text-sm"
              aria-label={`Remove ${c.name} from ${group.name}`}
            >
              ×
            </button>
          </div>
        ))}
        {members.length === 0 && (
          <div className={[
            'flex items-center justify-center rounded-lg border-2 border-dashed min-h-[60px]',
            isOver ? 'border-[var(--accent)]' : 'border-[var(--border)]',
          ].join(' ')}>
            <span className="text-[10px] text-[var(--text)] opacity-60">drop here</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── CreateGroupForm ───────────────────────────────────────────────────────────

interface CreateGroupFormProps {
  onDone: () => void
}

function CreateGroupForm({ onDone }: CreateGroupFormProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [currencyCode, setCurrencyCode] = useState('')
  const [aggregateOp, setAggregateOp] = useState('sum')
  const [error, setError] = useState<string | null>(null)

  const { data: currencies } = useQuery({ queryKey: ['currencies'], queryFn: getCurrencies })

  const mutation = useMutation({
    mutationFn: () =>
      createConcept({ name, kind: 'group', currency_code: currencyCode, aggregate_op: aggregateOp }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['concepts'] })
      onDone()
    },
    onError: (err) => {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'A concept with that name already exists.'
          : 'Failed to create group.',
      )
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--bg)] p-3 min-w-[220px] w-[220px] shrink-0">
      <span className="text-xs font-semibold text-[var(--accent)] border-b border-[var(--border)] pb-1">
        New group
      </span>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          autoFocus
          placeholder="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={`${inputClass} text-xs py-1.5`}
        />
        <select
          value={currencyCode}
          onChange={(e) => setCurrencyCode(e.target.value)}
          required
          className={`${selectClass} text-xs py-1.5`}
        >
          <option value="">Currency…</option>
          {currencies?.map((c) => (
            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
          ))}
        </select>
        <select
          value={aggregateOp}
          onChange={(e) => setAggregateOp(e.target.value)}
          className={`${selectClass} text-xs py-1.5`}
        >
          <option value="sum">Sum</option>
          <option value="avg">Average</option>
          <option value="min">Min</option>
          <option value="max">Max</option>
        </select>
        <div className="flex gap-1.5">
          <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending} className="flex-1 justify-center">
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}

// ── ConceptGroupBoard ─────────────────────────────────────────────────────────

export default function ConceptGroupBoard() {
  const qc = useQueryClient()
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [search, setSearch] = useState('')

  const { data: concepts = [], isLoading, isError } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, group_ids }: { id: string; group_ids: string[] }) =>
      updateConcept(id, { group_ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['concepts'] }),
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const groups = concepts.filter((c) => c.kind === 'group')
  const members = concepts.filter((c) => c.kind !== 'group')
  const conceptById = Object.fromEntries(concepts.map((c) => [c.id, c]))

  const poolConcepts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? members.filter((c) => c.name.toLowerCase().includes(q)) : members
  }, [members, search])

  const activeConcept = activeDragId ? conceptById[parseDragId(activeDragId).conceptId] : null

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(String(active.id))
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null)
    if (!over) return

    const { conceptId, sourceId } = parseDragId(String(active.id))
    const targetId = String(over.id)
    if (targetId === sourceId) return

    const concept = conceptById[conceptId]
    if (!concept) return

    // Pool is a source only; dropping back onto it does nothing
    if (targetId === POOL_ID) return

    if (concept.group_ids.includes(targetId)) return
    updateMutation.mutate({ id: conceptId, group_ids: [...concept.group_ids, targetId] })
  }

  function handleRemove(conceptId: string, groupId: string) {
    const concept = conceptById[conceptId]
    if (!concept) return
    updateMutation.mutate({
      id: conceptId,
      group_ids: concept.group_ids.filter((g) => g !== groupId),
    })
  }

  if (isLoading) return <p className="text-sm text-[var(--text)] py-4">Loading…</p>
  if (isError) return <p className="text-sm text-red-500 py-4">Error loading concepts.</p>

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* search bar */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search concepts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} max-w-xs`}
        />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 -mx-1 px-1 items-start">
        {/* All concepts — drag source */}
        <ConceptsColumn concepts={poolConcepts} />

        {/* Group columns — members with × remove, droppable */}
        {groups.map((group) => (
          <GroupColumn
            key={group.id}
            group={group}
            members={members.filter((c) => c.group_ids.includes(group.id))}
            onRemove={handleRemove}
          />
        ))}

        {/* New group */}
        {showCreateGroup ? (
          <CreateGroupForm onDone={() => setShowCreateGroup(false)} />
        ) : (
          <button
            onClick={() => setShowCreateGroup(true)}
            className={[
              'flex flex-col items-center justify-center gap-2 min-w-[220px] w-[220px] shrink-0 min-h-[120px]',
              'rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text)]',
              'hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer',
            ].join(' ')}
          >
            <span className="text-2xl leading-none opacity-50">+</span>
            <span className="text-xs font-medium">New group</span>
          </button>
        )}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeConcept && activeDragId ? (
          <DraggableCard
            concept={activeConcept}
            sourceId={parseDragId(activeDragId).sourceId}
            isDragOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
