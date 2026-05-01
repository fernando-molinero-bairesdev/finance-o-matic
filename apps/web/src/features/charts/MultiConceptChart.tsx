import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getConceptHistoryBatch } from '../../lib/conceptsApi'

const COLORS = [
  '#aa3bff',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
]

interface ConceptMeta {
  id: string
  name: string
}

interface Props {
  concepts: ConceptMeta[]
  dateFrom?: string
  dateTo?: string
  onDotClick?: (snapshotId: string, date: string) => void
}

interface TooltipPayloadItem {
  name: string
  value: number | null
  color: string
  payload: Record<string, number | null>
}

interface TooltipProps {
  active?: boolean
  label?: string
  payload?: TooltipPayloadItem[]
}

function ChartTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs shadow-[var(--shadow)] space-y-1">
      <p className="font-medium text-[var(--text-h)]">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }}>
          {item.name}: {item.value !== null && item.value !== undefined ? item.value.toLocaleString() : '—'}
        </p>
      ))}
    </div>
  )
}

function formatYAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

export default function MultiConceptChart({ concepts, dateFrom, dateTo, onDotClick }: Props) {
  const ids = concepts.map((c) => c.id)

  const { data: rawHistory, isLoading } = useQuery({
    queryKey: ['concept-history-batch', ids],
    queryFn: () => getConceptHistoryBatch(ids),
    enabled: ids.length > 0,
  })

  const chartData = useMemo(() => {
    if (!rawHistory) return []

    // Collect all dates across all concepts
    const dateSet = new Set<string>()
    for (const points of Object.values(rawHistory)) {
      for (const p of points) dateSet.add(p.date)
    }

    // Build snapshot_id lookup: date → snapshot_id (use first concept that has this date)
    const snapshotIdByDate: Record<string, string> = {}
    for (const points of Object.values(rawHistory)) {
      for (const p of points) {
        if (!snapshotIdByDate[p.date]) snapshotIdByDate[p.date] = p.snapshot_id
      }
    }

    // Build per-concept value lookup
    const valueByConceptDate: Record<string, Record<string, number | null>> = {}
    for (const [conceptId, points] of Object.entries(rawHistory)) {
      valueByConceptDate[conceptId] = {}
      for (const p of points) {
        valueByConceptDate[conceptId][p.date] = p.value
      }
    }

    let dates = Array.from(dateSet).sort()

    if (dateFrom) dates = dates.filter((d) => d >= dateFrom)
    if (dateTo) dates = dates.filter((d) => d <= dateTo)

    return dates.map((date) => {
      const row: Record<string, unknown> = { date, _snapshotId: snapshotIdByDate[date] }
      for (const { id, name } of concepts) {
        row[name] = valueByConceptDate[id]?.[date] ?? null
      }
      return row
    })
  }, [rawHistory, concepts, dateFrom, dateTo])

  if (isLoading || ids.length === 0) {
    return <div className="h-[220px] rounded-lg bg-[var(--code-bg)] animate-pulse" />
  }

  if (chartData.length < 2) {
    return (
      <p className="text-sm text-[var(--text)] py-6 text-center">
        Not enough data yet. Take at least two snapshots to see a trend.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e5e4e7" strokeDasharray="4 2" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--text)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--text)' }}
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={formatYAxis}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => <span style={{ color: 'var(--text)' }}>{value}</span>}
        />
        {concepts.map(({ id, name }, i) => (
          <Line
            key={id}
            type="monotone"
            dataKey={name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={
              onDotClick
                ? (props: Record<string, unknown>) => {
                    const { cx, cy, payload, stroke } = props as {
                      cx: number
                      cy: number
                      payload: Record<string, unknown>
                      stroke: string
                    }
                    return (
                      <circle
                        key={`${payload.date}-${name}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={stroke}
                        stroke="none"
                        style={{ cursor: 'pointer' }}
                        onClick={() =>
                          onDotClick(payload._snapshotId as string, payload.date as string)
                        }
                      />
                    )
                  }
                : false
            }
            connectNulls
            activeDot={
              onDotClick
                ? {
                    r: 5,
                    style: { cursor: 'pointer' },
                  }
                : { r: 4 }
            }
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
