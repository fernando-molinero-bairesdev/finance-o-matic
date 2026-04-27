import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getConcepts } from '../../lib/conceptsApi'
import {
  getSnapshot,
  getSnapshots,
  updateEntry,
  processSnapshot,
  completeSnapshot,
} from '../../lib/snapshotsApi'
import type { ConceptEntryRead, SnapshotStatus } from '../../lib/snapshotsApi'
import { getEntities } from '../../lib/entitiesApi'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { inputClass, selectClass } from '../../components/ui/FormField'

function statusVariant(s: SnapshotStatus) {
  if (s === 'complete') return 'success'
  if (s === 'processed') return 'purple'
  if (s === 'open') return 'pending'
  if (s === 'pending') return 'pending'
  return 'warning'
}

// ── EntryRow ─────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: ConceptEntryRead
  snapshotId: string
  snapshotStatus: SnapshotStatus
  conceptNames: Record<string, string>
}

function EntryRow({ entry, snapshotId, snapshotStatus, conceptNames }: EntryRowProps) {
  const qc = useQueryClient()
  const [localValue, setLocalValue] = useState(
    entry.value !== null ? String(entry.value) : '',
  )
  const [localEntityId, setLocalEntityId] = useState<string>(entry.entity_id ?? '')

  const { data: entities } = useQuery({
    queryKey: ['entities'],
    queryFn: () => getEntities(),
  })

  const saveMutation = useMutation({
    mutationFn: ({ val, entityId }: { val: number; entityId: string | null }) =>
      updateEntry(snapshotId, entry.id, val, entityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshot', snapshotId] })
    },
  })

  const conceptName = conceptNames[entry.concept_id] ?? entry.concept_id.slice(0, 8) + '…'
  const isAuto = entry.carry_behaviour_used === 'auto'
  const isLocked = snapshotStatus === 'complete'
  const isEditable = !isAuto && !isLocked

  return (
    <div className="px-4 py-2 border-b border-[var(--border)] last:border-b-0 space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--text-h)] truncate">{conceptName}</p>
          {entry.formula_snapshot && (
            <code className="text-[10px] text-[var(--text)] block truncate mt-0.5">
              {entry.formula_snapshot}
            </code>
          )}
        </div>

        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-xs text-[var(--text)]">{entry.currency_code}</span>
          {isAuto && snapshotStatus === 'open' ? (
            <span className="text-[10px] text-[var(--text)]">auto</span>
          ) : entry.value !== null ? (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓</span>
          ) : (
            <span className="text-[10px] text-amber-500">—</span>
          )}
        </div>

        {isEditable ? (
          <>
            <input
              type="number"
              step="any"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              aria-label={`Value for ${conceptName}`}
              className={`${inputClass} w-24 shrink-0`}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={saveMutation.isPending || localValue === ''}
              onClick={() => {
                const num = parseFloat(localValue)
                if (!isNaN(num))
                  saveMutation.mutate({ val: num, entityId: localEntityId || null })
              }}
              className="shrink-0"
            >
              {saveMutation.isPending ? '…' : 'Save'}
            </Button>
          </>
        ) : (
          <span className="col-span-2 text-xs text-[var(--text)] text-right">
            {entry.value !== null
              ? entry.value.toLocaleString()
              : isAuto && snapshotStatus === 'open'
                ? 'pending'
                : '—'}
          </span>
        )}
      </div>

      {isEditable && entities && entities.length > 0 && (
        <div className="flex items-center gap-2 pl-0">
          <label className="text-[10px] text-[var(--text)] shrink-0">Entity</label>
          <select
            aria-label={`Entity for ${conceptName}`}
            className={`${selectClass} text-xs py-1 flex-1`}
            value={localEntityId}
            onChange={(e) => setLocalEntityId(e.target.value)}
          >
            <option value="">None</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      {saveMutation.isError && (
        <p className="text-xs text-red-500">Failed to save.</p>
      )}
    </div>
  )
}

// ── SnapshotEntries ───────────────────────────────────────────────────────────

interface SnapshotEntriesProps {
  snapshotId: string
  snapshotStatus: SnapshotStatus
  detail: ReturnType<typeof useQuery<ReturnType<typeof getSnapshot> extends Promise<infer T> ? T : never>>
  conceptNames: Record<string, string>
  onProcess: () => void
  onComplete: () => void
  isProcessing: boolean
  isCompleting: boolean
}

function SnapshotEntries({
  snapshotId,
  snapshotStatus,
  detail,
  conceptNames,
  onProcess,
  onComplete,
  isProcessing,
  isCompleting,
}: SnapshotEntriesProps) {
  const sorted = detail.data
    ? [...detail.data.entries].sort((a, b) => {
        // Manual entries first, then auto
        const aAuto = a.carry_behaviour_used === 'auto' ? 1 : 0
        const bAuto = b.carry_behaviour_used === 'auto' ? 1 : 0
        return aAuto - bAuto
      })
    : []

  return (
    <div className="border-t border-[var(--border)] bg-[var(--code-bg)]">
      {detail.isLoading && (
        <p className="px-4 py-3 text-xs text-[var(--text)]">Loading entries…</p>
      )}
      {detail.isError && (
        <p className="px-4 py-3 text-xs text-red-500">Error loading entries.</p>
      )}
      {detail.data && sorted.length === 0 && (
        <p className="px-4 py-3 text-xs text-[var(--text)]">No entries.</p>
      )}
      {detail.data && sorted.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          snapshotId={snapshotId}
          snapshotStatus={snapshotStatus}
          conceptNames={conceptNames}
        />
      ))}

      {snapshotStatus === 'open' && detail.data && (
        <div className="px-4 py-3 flex items-center justify-between border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text)]">
            Fill in manual values, then process to compute automatic ones.
          </p>
          <Button variant="primary" size="sm" disabled={isProcessing} onClick={onProcess}>
            {isProcessing ? 'Processing…' : 'Process'}
          </Button>
        </div>
      )}

      {snapshotStatus === 'processed' && detail.data && (
        <div className="px-4 py-3 flex items-center justify-between border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text)]">
            Review the values. When correct, lock the snapshot.
          </p>
          <Button variant="primary" size="sm" disabled={isCompleting} onClick={onComplete}>
            {isCompleting ? 'Locking…' : 'Lock & Complete'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── SnapshotList ──────────────────────────────────────────────────────────────

export default function SnapshotList() {
  const qc = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots,
  })

  const detailQuery = useQuery({
    queryKey: ['snapshot', expandedId],
    queryFn: () => getSnapshot(expandedId!),
    enabled: expandedId !== null,
  })

  const { data: concepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const conceptNames: Record<string, string> = Object.fromEntries(
    (concepts ?? []).map((c) => [c.id, c.name]),
  )

  const processMutation = useMutation({
    mutationFn: (id: string) => processSnapshot(id),
    onSuccess: (detail) => {
      qc.setQueryData(['snapshot', detail.id], detail)
      qc.invalidateQueries({ queryKey: ['snapshot', detail.id] })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeSnapshot(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshot', expandedId] })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['concept-history'] })
    },
  })

  if (isLoading) return <p className="text-sm text-[var(--text)]">Loading snapshots...</p>
  if (isError) return <p className="text-sm text-red-500">Error loading snapshots.</p>
  if (!data?.length) return (
    <div className="text-center py-6 space-y-1">
      <p className="text-sm text-[var(--text-h)] font-medium">No snapshots yet</p>
      <p className="text-xs text-[var(--text)]">Take a snapshot to start tracking your net worth over time.</p>
    </div>
  )

  return (
    <ul className="-mx-4">
      {data.map((s) => {
        const isExpanded = expandedId === s.id
        const snapshotStatus = s.status as SnapshotStatus
        return (
          <li key={s.id} className="border-b border-[var(--border)] last:border-b-0">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-[var(--text-h)]">{s.date}</span>
                {s.label && (
                  <span className="text-xs text-[var(--text)] ml-2">— {s.label}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={statusVariant(snapshotStatus)}>
                  {s.status}
                </Badge>
                <button
                  type="button"
                  aria-label={isExpanded ? 'Collapse snapshot' : 'Expand snapshot'}
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="p-1 rounded text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--border)] transition-colors duration-150"
                >
                  <svg
                    className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
              </div>
            </div>

            {isExpanded && (
              <SnapshotEntries
                snapshotId={s.id}
                snapshotStatus={snapshotStatus}
                detail={detailQuery as Parameters<typeof SnapshotEntries>[0]['detail']}
                conceptNames={conceptNames}
                onProcess={() => processMutation.mutate(s.id)}
                onComplete={() => completeMutation.mutate(s.id)}
                isProcessing={processMutation.isPending}
                isCompleting={completeMutation.isPending}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
