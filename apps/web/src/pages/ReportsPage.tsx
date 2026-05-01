import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConcepts } from '../lib/conceptsApi'
import MultiConceptChart from '../features/charts/MultiConceptChart'
import SnapshotDetailDrawer from '../features/snapshots/SnapshotDetailDrawer'
import { inputClass } from '../components/ui/FormField'

export default function ReportsPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const { data: concepts } = useQuery({
    queryKey: ['concepts'],
    queryFn: getConcepts,
  })

  const chartConcepts = useMemo(
    () => (concepts ?? []).filter((c) => c.kind !== 'aux'),
    [concepts],
  )

  // Auto-select first concept when concepts load
  useEffect(() => {
    if (chartConcepts.length > 0 && selectedIds.length === 0) {
      setSelectedIds([chartConcepts[0].id])
    }
  }, [chartConcepts, selectedIds.length])

  // Close picker when clicking outside
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  function toggleConcept(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const selectedConcepts = chartConcepts.filter((c) => selectedIds.includes(c.id))

  const selectedLabel =
    selectedConcepts.length === 0
      ? 'Select concepts…'
      : selectedConcepts.length === 1
        ? selectedConcepts[0].name
        : `${selectedConcepts.length} concepts`

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
    <>
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-h)] shrink-0">Reports</h2>

          {/* concept multi-select */}
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              className={`${inputClass} min-w-[160px] text-left flex items-center justify-between gap-2 cursor-pointer`}
            >
              <span className="truncate text-xs">{selectedLabel}</span>
              <span className="text-[10px] opacity-60">▾</span>
            </button>

            {pickerOpen && (
              <div
                role="listbox"
                aria-multiselectable="true"
                aria-label="Select concepts"
                className="absolute top-full left-0 mt-1 z-30 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow)] py-1 max-h-64 overflow-y-auto"
              >
                {chartConcepts.map((c) => (
                  <label
                    key={c.id}
                    role="option"
                    aria-selected={selectedIds.includes(c.id)}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--code-bg)] text-xs text-[var(--text-h)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggleConcept(c.id)}
                      className="accent-[var(--accent)]"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* date range */}
          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
              className={`${inputClass} w-36 text-xs`}
            />
            <span className="text-xs text-[var(--text)]">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
              className={`${inputClass} w-36 text-xs`}
            />
          </div>
        </div>

        {/* chart */}
        <div className="p-4">
          {selectedConcepts.length === 0 ? (
            <p className="text-sm text-[var(--text)] py-6 text-center">
              Select at least one concept above to see the chart.
            </p>
          ) : (
            <MultiConceptChart
              concepts={selectedConcepts}
              dateFrom={dateFrom || undefined}
              dateTo={dateTo || undefined}
              onDotClick={(snapshotId) => setActiveSnapshotId(snapshotId)}
            />
          )}
        </div>
      </section>

      <SnapshotDetailDrawer
        snapshotId={activeSnapshotId}
        onClose={() => setActiveSnapshotId(null)}
      />
    </>
  )
}
