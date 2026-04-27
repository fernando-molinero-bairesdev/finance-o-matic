import { useState } from 'react'
import TakeSnapshotForm from '../features/snapshots/TakeSnapshotForm'
import SnapshotList from '../features/snapshots/SnapshotList'
import Button from '../components/ui/Button'

export default function SnapshotsPage() {
  const [showForm, setShowForm] = useState(false)

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-h)]">Snapshots</h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            New Snapshot
          </Button>
        )}
      </div>
      <div className="p-4 space-y-4">
        {showForm && (
          <TakeSnapshotForm
            onSuccess={() => setShowForm(false)}
            onCancel={() => setShowForm(false)}
          />
        )}
        <SnapshotList />
      </div>
    </section>
  )
}
