import { useEffect, useState } from 'react'
import type { SimFrame } from '../../types'
import {
  useMetricSeries,
  useAvailableMetrics,
  METRICS,
  type MetricId,
} from '../../hooks/useMetricSeries'
import { MetricChart } from './MetricChart'
import { Segmented } from '../ui/Segmented'

interface Props {
  frames: SimFrame[]
  frameIndex: number
  selectedLink: string | null
  onSelectLink: (key: string) => void
  /** a preferred metric carried across compatible episodes; used only when this run has it */
  preferredMetric?: MetricId | null
  onMetricChange?: (metric: MetricId) => void
}

export function ChartsView({
  frames,
  frameIndex,
  selectedLink,
  onSelectLink,
  preferredMetric,
  onMetricChange,
}: Props) {
  const available = useAvailableMetrics(frames)
  const [chosenMetric, setChosenMetric] = useState<MetricId>(preferredMetric ?? 'sinr')
  // Fall back to the first metric this run actually has rather than an empty chart
  const selectedMetric: MetricId = available.has(chosenMetric)
    ? chosenMetric
    : (METRICS.find((m) => available.has(m.id))?.id ?? chosenMetric)
  useEffect(() => {
    onMetricChange?.(selectedMetric)
  }, [selectedMetric, onMetricChange])
  const setSelectedMetric = (metric: MetricId) => setChosenMetric(metric)
  const series = useMetricSeries(frames, selectedMetric)
  const config = METRICS.find((m) => m.id === selectedMetric)!
  const currentTime = frames[frameIndex]?.time ?? 0

  return (
    <div className="glass flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-3 flex-shrink-0 min-w-0">
        <h2 className="text-[13px] font-semibold text-ink-title flex-shrink-0">Metrics</h2>
        <div className="overflow-x-auto min-w-0">
          <Segmented
            size="sm"
            options={METRICS.map((m) => ({
              value: m.id,
              label: m.label,
              disabled: !available.has(m.id),
            }))}
            value={selectedMetric}
            onChange={setSelectedMetric}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 px-2 pb-2">
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
