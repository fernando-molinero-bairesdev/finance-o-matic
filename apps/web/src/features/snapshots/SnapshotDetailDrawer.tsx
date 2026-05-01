import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSnapshot } from '../../lib/snapshotsApi'
import { getConcepts } from '../../lib/conceptsApi'
import Badge from '../../components/ui/Badge'

interface Props {
  snapshotId: string | null
  onClose: () => void
}

export default function SnapshotDetailDrawer({ snapshotId, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    if (!snapshotId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [snapshotId, onClose])

  const { data: snapshot } = useQuery({
    queryKey: ['snapshot', snapshotId],
    queryFn: () => getSnapshot(snapshotId!),
    enabled: snapshotId !== null,
  })

  const { data: concepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
    enabled: snapshotId !== null,
  })

  if (!snapshotId) return null

  const conceptNameById = Object.fromEntries((concepts ?? []).map((c) => [c.id, c.name]))

  const statusVariant =
    snapshot?.status === 'complete'
      ? 'success'
      : snapshot?.status === 'processed'
        ? 'purple'
        : 'pending'

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Snapshot detail"
        className="fixed top-0 right-0 h-full w-[420px] max-w-full z-50 flex flex-col bg-[var(--bg)] border-l border-[var(--border)] shadow-[var(--shadow)] overflow-hidden"
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-h)]">
              {snapshot?.date ?? '…'}
            </span>
            {snapshot?.label && (
              <span className="text-xs text-[var(--text)]">{snapshot.label}</span>
            )}
            {snapshot && <Badge variant={statusVariant}>{snapshot.status}</Badge>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--text)] hover:text-[var(--text-h)] text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          {!snapshot ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 rounded bg-[var(--code-bg)] animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* entries table */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--code-bg)]">
                    <th className="text-left px-4 py-2 font-medium text-[var(--text)]">Concept</th>
                    <th className="text-right px-4 py-2 font-medium text-[var(--text)]">Value</th>
                    <th className="text-right px-4 py-2 font-medium text-[var(--text)]">Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-4 py-2 text-[var(--text-h)]">
                        {conceptNameById[entry.concept_id] ?? entry.concept_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--text)]">
                        {entry.value !== null ? entry.value.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--text)]">
                        {entry.currency_code}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* FX rates panel */}
              {snapshot.fx_rates.length > 0 && (
                <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--code-bg)]">
                  <p className="text-[10px] font-medium text-[var(--text)] mb-1">
                    Exchange rates ({snapshot.fx_rates[0].as_of})
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {snapshot.fx_rates.map((r) => (
                      <span key={r.quote_code} className="text-[10px] text-[var(--text)]">
                        1 {r.base_code} = {r.rate.toFixed(4)} {r.quote_code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
