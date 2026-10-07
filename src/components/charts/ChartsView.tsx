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
import { MOTION } from '../../styles/motion'

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
      <div className="px-5 pt-4 pb-3 flex flex-col gap-3 flex-shrink-0 min-w-0">
        <div className="overflow-x-auto min-w-0">
          <Segmented
            size="lg"
            options={METRICS.map((m) => ({
              value: m.id,
              label: m.label,
              disabled: !available.has(m.id),
            }))}
            value={selectedMetric}
            onChange={setSelectedMetric}
          />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink-title">
          {config.label}
          {config.unit && <span className="font-medium text-ink-2"> ({config.unit})</span>}
        </h2>
      </div>
      <div key={selectedMetric} className={`flex-1 min-h-0 ${MOTION.enterFade}`}>
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
