import { useQuery } from '@tanstack/react-query'
import { getSnapshots } from '../../lib/snapshotsApi'
import Badge from '../../components/ui/Badge'

type SnapshotStatus = 'pending' | 'complete' | 'failed'

function statusVariant(status: SnapshotStatus) {
  if (status === 'complete') return 'success'
  if (status === 'pending') return 'pending'
  return 'warning'
}

export default function SnapshotList() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots,
  })

  if (isLoading) return <p className="text-sm text-[var(--text)]">Loading snapshots...</p>
  if (isError) return <p className="text-sm text-red-500">Error loading snapshots.</p>
  if (!data?.length) return <p className="text-sm text-[var(--text)]">No snapshots yet.</p>

  return (
    <ul className="divide-y divide-[var(--border)] -mx-4">
      {data.map((s) => (
        <li key={s.id} className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <span className="text-sm font-medium text-[var(--text-h)]">{s.date}</span>
            {s.label && (
              <span className="text-xs text-[var(--text)] ml-2">— {s.label}</span>
            )}
          </div>
          <Badge variant={statusVariant(s.status as SnapshotStatus)}>{s.status}</Badge>
        </li>
      ))}
    </ul>
  )
}
