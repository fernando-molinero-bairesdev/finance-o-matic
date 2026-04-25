import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getConcepts } from '../../lib/conceptsApi'
import { getSnapshot, getSnapshots, resolveEntry } from '../../lib/snapshotsApi'
import type { ConceptEntryRead, SnapshotDetail } from '../../lib/snapshotsApi'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { inputClass } from '../../components/ui/FormField'

type SnapshotStatus = 'pending' | 'complete' | 'failed'

function statusVariant(s: SnapshotStatus) {
  if (s === 'complete') return 'success'
  if (s === 'pending') return 'pending'
  return 'warning'
}

// ── EntryRow ────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: ConceptEntryRead
  snapshotId: string
  conceptNames: Record<string, string>
}

function EntryRow({ entry, snapshotId, conceptNames }: EntryRowProps) {
  const qc = useQueryClient()
  const [localValue, setLocalValue] = useState(
    entry.value !== null ? String(entry.value) : '',
  )

  const saveMutation = useMutation({
    mutationFn: (val: number) => resolveEntry(snapshotId, entry.id, val),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshot', snapshotId] })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })

  const conceptName =
    conceptNames[entry.concept_id] ?? entry.concept_id.slice(0, 8) + '…'

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-4 py-2 border-b border-[var(--border)] last:border-b-0">
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
        {entry.is_pending ? (
          <Badge variant="pending">pending</Badge>
        ) : (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓</span>
        )}
      </div>

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
          if (!isNaN(num)) saveMutation.mutate(num)
        }}
        className="shrink-0"
      >
        {saveMutation.isPending ? '…' : 'Save'}
      </Button>

      {saveMutation.isError && (
        <p className="col-span-4 text-xs text-red-500 -mt-1">Failed to save.</p>
      )}
    </div>
  )
}

// ── SnapshotEntries ─────────────────────────────────────────────────────────

interface SnapshotEntriesProps {
  snapshotId: string
  detail: SnapshotDetail | undefined
  isLoading: boolean
  isError: boolean
  conceptNames: Record<string, string>
}

function SnapshotEntries({ snapshotId, detail, isLoading, isError, conceptNames }: SnapshotEntriesProps) {
  const sorted = detail
    ? [...detail.entries].sort((a, b) => {
        if (a.is_pending === b.is_pending) return 0
        return a.is_pending ? -1 : 1
      })
    : []

  return (
    <div className="border-t border-[var(--border)] bg-[var(--code-bg)]">
      {isLoading && (
        <p className="px-4 py-3 text-xs text-[var(--text)]">Loading entries…</p>
      )}
      {isError && (
        <p className="px-4 py-3 text-xs text-red-500">Error loading entries.</p>
      )}
      {detail && sorted.length === 0 && (
        <p className="px-4 py-3 text-xs text-[var(--text)]">No entries.</p>
      )}
      {detail && sorted.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          snapshotId={snapshotId}
          conceptNames={conceptNames}
        />
      ))}
    </div>
  )
}

// ── SnapshotList ─────────────────────────────────────────────────────────────

export default function SnapshotList() {
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
                <Badge variant={statusVariant(s.status as SnapshotStatus)}>
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
                detail={detailQuery.data}
                isLoading={detailQuery.isLoading}
                isError={detailQuery.isError}
                conceptNames={conceptNames}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
