import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { SinrSeries } from '../../hooks/useSinrSeries'

// Distinct colors for link lines
const LINK_PALETTE = [
  '#0ea5e9',
  '#f59e0b',
  '#10b981',
  '#a855f7',
  '#f43f5e',
  '#06b6d4',
  '#84cc16',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
]

interface Props {
  series: SinrSeries[]
  currentTime: number
  selectedLink: string | null
  onSelectLink: (key: string) => void
}

export function SinrChart({ series, currentTime, selectedLink, onSelectLink }: Props) {
  // Merge all series into a single data array keyed by time
  const { chartData, linkKeys } = useMemo(() => {
    const timeMap = new Map<number, Record<string, number>>()
    const keys = series.map((s) => s.linkKey)

    for (const s of series) {
      for (const pt of s.data) {
        let row = timeMap.get(pt.time)
        if (!row) {
          row = { time: pt.time }
          timeMap.set(pt.time, row)
        }
        row[s.linkKey] = pt.sinr
      }
    }

    const data = Array.from(timeMap.values()).sort((a, b) => a.time - b.time)
    return { chartData: data, linkKeys: keys }
  }, [series])

  if (series.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No SINR data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(v: number) => `${v.toFixed(1)}s`}
          stroke="#9ca3af"
          fontSize={11}
          label={{
            value: 'Time (s)',
            position: 'insideBottom',
            offset: -5,
            fontSize: 11,
            fill: '#6b7280',
          }}
        />
        <YAxis
          stroke="#9ca3af"
          fontSize={11}
          label={{
            value: 'SINR (dB)',
            angle: -90,
            position: 'insideLeft',
            offset: 10,
            fontSize: 11,
            fill: '#6b7280',
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}
          formatter={(value, name) => [`${Number(value).toFixed(1)} dB`, `Link ${name}`]}
          labelFormatter={(label) => `t = ${Number(label).toFixed(3)}s`}
        />
        <Legend
          wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
          formatter={(value: string) => `Link ${value}`}
          onClick={(data) => {
            if (typeof data.dataKey === 'string') onSelectLink(data.dataKey)
          }}
        />

        {/* Playback cursor */}
        <ReferenceLine x={currentTime} stroke="#0f172a" strokeWidth={2} strokeDasharray="4 2" />

        {linkKeys.map((key, i) => {
          const isSelected = selectedLink === key
          const hasSelection = selectedLink !== null
          return (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={LINK_PALETTE[i % LINK_PALETTE.length]}
              strokeWidth={isSelected ? 3 : 1.5}
              strokeOpacity={hasSelection && !isSelected ? 0.15 : 1}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              connectNulls
            />
          )
        })}
      </LineChart>
    </ResponsiveContainer>
  )
}
