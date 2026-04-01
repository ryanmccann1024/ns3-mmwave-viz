import { useState } from 'react'
import type { SimFrame } from '../../types'
import {
  useMetricSeries,
  useAvailableMetrics,
  METRICS,
  type MetricId,
} from '../../hooks/useMetricSeries'
import { MetricChart } from './MetricChart'

interface Props {
  frames: SimFrame[]
  frameIndex: number
  selectedLink: string | null
  onSelectLink: (key: string) => void
}

export function ChartsView({ frames, frameIndex, selectedLink, onSelectLink }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricId>('sinr')
  const available = useAvailableMetrics(frames)
  const series = useMetricSeries(frames, selectedMetric)
  const config = METRICS.find((m) => m.id === selectedMetric)!
  const currentTime = frames[frameIndex]?.time ?? 0

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50 flex items-center gap-1 overflow-x-auto">
        {METRICS.map((m) => {
          const isAvailable = available.has(m.id)
          const isActive = m.id === selectedMetric
          return (
            <button
              key={m.id}
              onClick={() => isAvailable && setSelectedMetric(m.id)}
              disabled={!isAvailable}
              className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-sky-100 text-sky-700 border border-sky-200'
                  : isAvailable
                    ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      <div className="flex-1 min-h-0 p-2">
        <MetricChart
          series={series}
          config={config}
          currentTime={currentTime}
          selectedKey={selectedLink}
          onSelectKey={onSelectLink}
        />
      </div>
    </div>
  )
}
