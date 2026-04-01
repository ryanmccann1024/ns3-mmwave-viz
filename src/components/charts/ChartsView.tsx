import type { SimFrame } from '../../types'
import { useSinrSeries } from '../../hooks/useSinrSeries'
import { SinrChart } from './SinrChart'

interface Props {
  frames: SimFrame[]
  frameIndex: number
  selectedLink: string | null
  onSelectLink: (key: string) => void
}

export function ChartsView({ frames, frameIndex, selectedLink, onSelectLink }: Props) {
  const series = useSinrSeries(frames)
  const currentTime = frames[frameIndex]?.time ?? 0

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
          SINR Time Series
        </span>
      </div>
      <div className="flex-1 min-h-0 p-2">
        <SinrChart
          series={series}
          currentTime={currentTime}
          selectedLink={selectedLink}
          onSelectLink={onSelectLink}
        />
      </div>
    </div>
  )
}
