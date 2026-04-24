import { useQuery } from '@tanstack/react-query'
import { getSnapshots } from '../../lib/snapshotsApi'

export default function SnapshotList() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['snapshots'],
    queryFn: getSnapshots,
  })

  if (isLoading) return <p>Loading snapshots...</p>
  if (isError) return <p>Error loading snapshots.</p>
  if (!data?.length) return <p>No snapshots yet.</p>

  return (
    <ul>
      {data.map((s) => (
        <li key={s.id}>
          <span>{s.date}</span>
          {s.label && <span> — {s.label}</span>}
          <span> [{s.status}]</span>
        </li>
      ))}
    </ul>
  )
}
