import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConcepts } from '../lib/conceptsApi'
import ConceptTrendChart from '../features/charts/ConceptTrendChart'
import { selectClass } from '../components/ui/FormField'

export default function ReportsPage() {
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

  if (chartConcepts.length === 0) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-h)]">Reports</h2>
        </div>
        <div className="p-4">
          <p className="text-sm text-[var(--text)]">
            No concepts to chart yet. Add concepts and take snapshots to see trends here.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--text-h)]">Reports</h2>
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
  )
}
