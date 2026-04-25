import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConcepts } from '../lib/conceptsApi'
import type { SnapshotDetail } from '../lib/snapshotsApi'
import TakeSnapshotForm from '../features/snapshots/TakeSnapshotForm'
import PendingEntriesForm from '../features/snapshots/PendingEntriesForm'
import SnapshotList from '../features/snapshots/SnapshotList'
import Button from '../components/ui/Button'

type SnapshotStep = 'idle' | 'form' | 'pending'

export default function ReportsPage() {
  const [snapshotStep, setSnapshotStep] = useState<SnapshotStep>('idle')
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotDetail | null>(null)

  const { data: concepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const conceptNames: Record<string, string> = Object.fromEntries(
    (concepts ?? []).map((c) => [c.id, c.name]),
  )

  function handleSnapshotTaken(snapshot: SnapshotDetail) {
    setActiveSnapshot(snapshot)
    setSnapshotStep(snapshot.entries.some((e) => e.is_pending) ? 'pending' : 'idle')
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-h)]">Reports</h2>
        {snapshotStep === 'idle' && (
          <Button size="sm" onClick={() => setSnapshotStep('form')}>
            Take snapshot
          </Button>
        )}
      </div>
      <div className="p-4 space-y-4">
        {snapshotStep === 'form' && (
          <TakeSnapshotForm
            onSnapshot={handleSnapshotTaken}
            onCancel={() => setSnapshotStep('idle')}
          />
        )}
        {snapshotStep === 'pending' && activeSnapshot && (
          <PendingEntriesForm
            snapshot={activeSnapshot}
            conceptNames={conceptNames}
            onDone={() => {
              setSnapshotStep('idle')
              setActiveSnapshot(null)
            }}
          />
        )}
        <SnapshotList />
      </div>
    </section>
  )
}
