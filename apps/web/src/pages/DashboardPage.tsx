import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getProcesses } from '../lib/processesApi'
import { getSnapshots } from '../lib/snapshotsApi'
import Badge from '../components/ui/Badge'

type SnapshotStatus = 'pending' | 'complete' | 'failed'

function statusVariant(status: SnapshotStatus) {
  if (status === 'complete') return 'success'
  if (status === 'pending') return 'pending'
  return 'warning'
}

export default function DashboardPage() {
  const { data: processes, isLoading: loadingProcesses } = useQuery({
    queryKey: ['processes'],
    queryFn: getProcesses,
  })

  const { data: snapshots, isLoading: loadingSnapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots,
  })

  const activeProcesses = (processes ?? []).filter((p) => p.is_active)
  const recentSnapshots = (snapshots ?? []).slice(0, 5)

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
