import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConcepts } from '../lib/conceptsApi'
import type { SnapshotDetail } from '../lib/snapshotsApi'
import TakeSnapshotForm from '../features/snapshots/TakeSnapshotForm'
import PendingEntriesForm from '../features/snapshots/PendingEntriesForm'
import SnapshotList from '../features/snapshots/SnapshotList'
import ConceptTrendChart from '../features/charts/ConceptTrendChart'
import Button from '../components/ui/Button'
import { selectClass } from '../components/ui/FormField'

type SnapshotStep = 'idle' | 'form' | 'pending'

export default function ReportsPage() {
  const [snapshotStep, setSnapshotStep] = useState<SnapshotStep>('idle')
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotDetail | null>(null)
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null)

  const { data: concepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const chartConcepts = useMemo(
    () => (concepts ?? []).filter((c) => c.kind !== 'aux'),
    [concepts],
  )

  useEffect(() => {
    if (chartConcepts.length > 0 && selectedConceptId === null) {
      setSelectedConceptId(chartConcepts[0].id)
    }
  }, [chartConcepts, selectedConceptId])

  const selectedConcept = chartConcepts.find((c) => c.id === selectedConceptId)

  const conceptNames: Record<string, string> = Object.fromEntries(
    (concepts ?? []).map((c) => [c.id, c.name]),
  )

  function handleSnapshotTaken(snapshot: SnapshotDetail) {
    setActiveSnapshot(snapshot)
    setSnapshotStep(snapshot.entries.some((e) => e.is_pending) ? 'pending' : 'idle')
  }

  return (
    <>
      {chartConcepts.length > 0 && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold text-[var(--text-h)]">Concept Trend</h2>
            <select
              value={selectedConceptId ?? ''}
              onChange={(e) => setSelectedConceptId(e.target.value)}
              className={`${selectClass} w-auto`}
              aria-label="Select concept to chart"
            >
              {chartConcepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="p-4">
            {selectedConcept && (
              <ConceptTrendChart
                conceptId={selectedConcept.id}
                conceptName={selectedConcept.name}
              />
            )}
          </div>
        </section>
      )}

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
    </>
  )
}
