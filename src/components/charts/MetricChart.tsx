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
} from 'recharts'
import type { MetricSeries, MetricConfig } from '../../hooks/useMetricSeries'

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
  series: MetricSeries[]
  config: MetricConfig
  currentTime: number
  selectedKey: string | null
  onSelectKey: (key: string) => void
}

export function MetricChart({ series, config, currentTime, selectedKey, onSelectKey }: Props) {
  const { chartData, keys } = useMemo(() => {
    const timeMap = new Map<number, Record<string, number>>()
    const ks = series.map((s) => s.key)

    for (const s of series) {
      for (const pt of s.data) {
        let row = timeMap.get(pt.time)
        if (!row) {
          row = { time: pt.time }
          timeMap.set(pt.time, row)
        }
        row[s.key] = pt.value
      }
    }

    const data = Array.from(timeMap.values()).sort((a, b) => a.time - b.time)
    return { chartData: data, keys: ks }
  }, [series])

  if (series.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No {config.label} data available
      </div>
    )
  }

  const yLabel = config.unit ? `${config.label} (${config.unit})` : config.label
  const tooltipSuffix = config.unit ? ` ${config.unit}` : ''
  const isFlowMetric = config.source === 'flow'
  const keyPrefix = isFlowMetric ? 'Flow ' : 'Link '

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,19,36,0.08)" />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => `${v.toFixed(1)}s`}
              stroke="#94a3b8"
              fontSize={11}
              label={{
                value: 'Time (s)',
                position: 'insideBottom',
                offset: -5,
                fontSize: 11,
                fill: '#6a7b96',
              }}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              label={{
                value: yLabel,
                angle: -90,
                position: 'insideLeft',
                offset: 10,
                fontSize: 11,
                fill: '#6a7b96',
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 14px 34px -16px rgba(10,19,36,0.3)',
                border: '1px solid rgba(255,255,255,0.8)',
                borderRadius: '12px',
                fontSize: '11px',
                fontFamily: 'monospace',
              }}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)}${tooltipSuffix}`,
                `${keyPrefix}${name}`,
              ]}
              labelFormatter={(label) => `t = ${Number(label).toFixed(3)}s`}
            />

            <ReferenceLine
              x={currentTime}
              stroke="#1e63e9"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />

            {keys.map((key, i) => {
              const isSelected = selectedKey === key
              const hasSelection = selectedKey !== null
              return (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  stroke={LINK_PALETTE[i % LINK_PALETTE.length]}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeOpacity={hasSelection && !isSelected ? 0.15 : 1}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Custom scrollable legend */}
      <div className="max-h-16 overflow-y-auto px-2 py-1.5 border-t border-ink/[0.06]">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {keys.map((key, i) => {
            const isSelected = selectedKey === key
            return (
              <button
                key={key}
                onClick={() => onSelectKey(key)}
                className={`flex items-center gap-1 text-[11px] font-mono cursor-pointer hover:opacity-80 ${
                  isSelected ? 'font-bold' : ''
                }`}
              >
                <span
                  className="inline-block rounded"
                  style={{
                    backgroundColor: LINK_PALETTE[i % LINK_PALETTE.length],
                    width: isSelected ? '14px' : '10px',
                    height: isSelected ? '3px' : '2px',
                  }}
                />
                <span className={isSelected ? 'text-ink' : 'text-muted'}>
                  {keyPrefix}
                  {key}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
