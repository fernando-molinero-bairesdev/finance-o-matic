import { useQuery } from '@tanstack/react-query'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getConceptHistory } from '../../lib/conceptsApi'
import type { ConceptHistoryPoint } from '../../lib/conceptsApi'

interface Props {
  conceptId: string
  conceptName: string
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ConceptHistoryPoint }>
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs shadow-[var(--shadow)]">
      <p className="font-medium text-[var(--text-h)]">{point.date}</p>
      <p className="text-[var(--text)]">
        {point.value !== null
          ? `${point.currency_code} ${point.value.toLocaleString()}`
          : 'No value'}
      </p>
    </div>
  )
}

function formatYAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

export default function ConceptTrendChart({ conceptId, conceptName }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['concept-history', conceptId],
    queryFn: () => getConceptHistory(conceptId),
  })

  if (isLoading) {
    return <div className="h-[200px] rounded-lg bg-[var(--code-bg)] animate-pulse" />
  }

  if (isError) {
    return (
      <p className="text-xs text-red-500">Failed to load history for {conceptName}.</p>
    )
  }

  if (!data || data.length < 2) {
    return (
      <p className="text-sm text-[var(--text)] py-6 text-center">
        Not enough data yet. Take at least two snapshots to see a trend.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
        <Line
          type="monotone"
          dataKey="value"
          stroke="#aa3bff"
          strokeWidth={2}
          dot={false}
          connectNulls
          activeDot={{ r: 4, fill: '#aa3bff' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
