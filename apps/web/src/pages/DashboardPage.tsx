import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getProcesses } from '../lib/processesApi'
import { getSnapshots } from '../lib/snapshotsApi'
import { getConcepts } from '../lib/conceptsApi'
import Badge from '../components/ui/Badge'
import ConceptTrendChart from '../features/charts/ConceptTrendChart'
import { selectClass } from '../components/ui/FormField'

type SnapshotStatus = 'pending' | 'complete' | 'failed'

function statusVariant(status: SnapshotStatus) {
  if (status === 'complete') return 'success'
  if (status === 'pending') return 'pending'
  return 'warning'
}

export default function DashboardPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const { data: processes, isLoading: loadingProcesses } = useQuery({
    queryKey: ['processes'],
    queryFn: getProcesses,
  })

  const { data: snapshots, isLoading: loadingSnapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots,
  })

  const { data: concepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const activeProcesses = (processes ?? []).filter((p) => p.is_active)
  const recentSnapshots = (snapshots ?? []).slice(0, 5)

  const groupConcepts = useMemo(
    () => (concepts ?? []).filter((c) => c.kind === 'group'),
    [concepts],
  )

  const effectiveGroupId =
    selectedGroupId && groupConcepts.some((c) => c.id === selectedGroupId)
      ? selectedGroupId
      : (groupConcepts[0]?.id ?? null)

  const selectedGroup = groupConcepts.find((c) => c.id === effectiveGroupId)

  return (
    <>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-h)]">Active Processes</h2>
        </div>
        <div className="p-4">
          {loadingProcesses && <p className="text-sm text-[var(--text)]">Loading...</p>}
          {!loadingProcesses && !activeProcesses.length && (
            <p className="text-sm text-[var(--text)]">
              No active processes.{' '}
              <Link to="/processes" className="text-[var(--accent)] hover:underline">
                Processes →
              </Link>
            </p>
          )}
          {!loadingProcesses && activeProcesses.length > 0 && (
            <ul className="divide-y divide-[var(--border)] -mx-4">
              {activeProcesses.map((p) => (
                <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-[var(--text-h)]">{p.name}</span>
                    <span className="text-xs text-[var(--text)] ml-2">({p.cadence})</span>
                  </div>
                  <span className="text-xs text-[var(--text)] shrink-0">
                    {p.schedule?.next_run_at ? `next: ${p.schedule.next_run_at}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-h)]">Portfolio Trend</h2>
          {groupConcepts.length > 1 && (
            <select
              value={effectiveGroupId ?? ''}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className={`${selectClass} w-auto`}
              aria-label="Select group concept to chart"
            >
              {groupConcepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="p-4">
          {groupConcepts.length === 0 ? (
            <p className="text-sm text-[var(--text)]">
              No group concepts yet.{' '}
              <Link to="/concepts" className="text-[var(--accent)] hover:underline">
                Set one up →
              </Link>
            </p>
          ) : selectedGroup ? (
            <ConceptTrendChart
              conceptId={selectedGroup.id}
              conceptName={selectedGroup.name}
            />
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-h)]">Recent Snapshots</h2>
        </div>
        <div className="p-4">
          {loadingSnapshots && <p className="text-sm text-[var(--text)]">Loading...</p>}
          {!loadingSnapshots && !recentSnapshots.length && (
            <p className="text-sm text-[var(--text)]">
              No snapshots yet.{' '}
              <Link to="/reports" className="text-[var(--accent)] hover:underline">
                Take one →
              </Link>
            </p>
          )}
          {!loadingSnapshots && recentSnapshots.length > 0 && (
            <ul className="divide-y divide-[var(--border)] -mx-4">
              {recentSnapshots.map((s) => (
                <li key={s.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-[var(--text-h)]">{s.date}</span>
                    {s.label && <span className="text-xs text-[var(--text)] ml-2">— {s.label}</span>}
                  </div>
                  <Badge variant={statusVariant(s.status as SnapshotStatus)}>{s.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
