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
import { AXIS, GRID, INK_2 } from './chartStyle'
import { MOTION } from '../../styles/motion'

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
      <div className="flex items-center justify-center h-full text-ink-2 text-base">
        No {config.label} data available
      </div>
    )
  }

  const tooltipSuffix = config.unit ? ` ${config.unit}` : ''
  const isFlowMetric = config.source === 'flow'
  const keyPrefix = isFlowMetric ? 'Flow ' : 'Link '

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 24, left: 4, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => `${Math.round(v)} s`}
              {...AXIS}
            />
            <YAxis
              {...AXIS}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => Number(v.toFixed(1)).toLocaleString()}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                boxShadow: '0 14px 34px -16px rgba(10,19,36,0.3)',
                border: '1px solid #e4e9f2',
                borderRadius: '12px',
                fontSize: '14px',
                color: INK_2,
              }}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)}${tooltipSuffix}`,
                `${keyPrefix}${name}`,
              ]}
              labelFormatter={(label) => `${Number(label).toFixed(1)} s`}
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
      <div className="max-h-24 overflow-y-auto px-4 py-3 border-t border-hairline">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {keys.map((key, i) => {
            const isSelected = selectedKey === key
            return (
              <button
                key={key}
                onClick={() => onSelectKey(key)}
                className={`flex items-center gap-2 text-base ${MOTION.colors} ${
                  isSelected ? 'font-semibold text-ink' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <span
                  className="w-4 h-1 rounded-full"
                  style={{ backgroundColor: LINK_PALETTE[i % LINK_PALETTE.length] }}
                />
                <span>
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
