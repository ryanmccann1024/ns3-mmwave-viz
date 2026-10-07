import { useEffect, useMemo, useRef } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
  seriesLabel?: (key: string, compact?: boolean) => string
  /** the playback time right now, read every animation frame (moves between saved frames) */
  playheadTime: () => number
  selectedKey: string | null
  onSelectKey: (key: string) => void
}

// Plot-area geometry, matching the LineChart margins and axis sizes below
const MARGIN = { top: 12, right: 24, left: 4, bottom: 4 }
const Y_AXIS_WIDTH = 56
const X_AXIS_HEIGHT = 30

export function MetricChart({
  series,
  config,
  seriesLabel,
  playheadTime,
  selectedKey,
  onSelectKey,
}: Props) {
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

  // The "now" line is drawn over the plot and moved every animation frame, so it slides
  // continuously instead of stepping once per saved frame like a chart re-render would
  const plotRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef(playheadTime)
  useEffect(() => {
    timeRef.current = playheadTime
  }, [playheadTime])
  const t0 = chartData.length ? chartData[0].time : 0
  const t1 = chartData.length ? chartData[chartData.length - 1].time : 0
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const plot = plotRef.current
      const line = playheadRef.current
      if (plot && line) {
        const left = MARGIN.left + Y_AXIS_WIDTH
        const width = plot.clientWidth - left - MARGIN.right
        const p = t1 > t0 ? (timeRef.current() - t0) / (t1 - t0) : 0
        line.style.transform = `translateX(${left + Math.min(1, Math.max(0, p)) * width}px)`
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [t0, t1])

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
  const label = (key: string) => seriesLabel?.(key) ?? `${keyPrefix}${key}`
  const legendLabel = (key: string) => seriesLabel?.(key, true) ?? `${keyPrefix}${key}`

  return (
    <div className="flex flex-col h-full">
      <div ref={plotRef} className="relative flex-1 min-h-0">
        <div
          ref={playheadRef}
          aria-hidden="true"
          className="absolute left-0 w-0 border-l-2 border-dashed border-accent pointer-events-none z-10"
          style={{ top: MARGIN.top, bottom: MARGIN.bottom + X_AXIS_HEIGHT }}
        />
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={MARGIN}>
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
              width={Y_AXIS_WIDTH}
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
                label(String(name)),
              ]}
              labelFormatter={(label) => `${Number(label).toFixed(1)} s`}
            />

            {keys.map((key, i) => {
              const isSelected = selectedKey === key
              const hasSelection = selectedKey !== null
              return (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  className={`${MOTION.chart} [&_.recharts-line-curve]:cursor-pointer`}
                  onClick={() => onSelectKey(key)}
                  stroke={LINK_PALETTE[i % LINK_PALETTE.length]}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeOpacity={hasSelection && !isSelected ? 0.15 : 1}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, onClick: () => onSelectKey(key) }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Custom scrollable legend */}
      <div className="min-w-0 flex-shrink-0 max-h-24 sm:max-h-32 overflow-y-auto overflow-x-hidden px-3 py-2 border-t border-hairline">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-2">
          {keys.map((key, i) => {
            const isSelected = selectedKey === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectKey(key)}
                aria-pressed={isSelected}
                aria-label={label(key)}
                title={label(key)}
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-medium active:scale-[0.98] ${MOTION.select} ${
                  isSelected
                    ? 'border-accent/30 bg-accent-wash text-accent-ink shadow-control'
                    : 'border-transparent text-ink-2 hover:bg-white/80 hover:text-ink'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-4 h-1 flex-shrink-0 rounded-full ${MOTION.lift} ${isSelected ? 'scale-x-125' : ''}`}
                  style={{ backgroundColor: LINK_PALETTE[i % LINK_PALETTE.length] }}
                />
                <span className="min-w-0 truncate">{legendLabel(key)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
