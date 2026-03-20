import type { SimFrame, SimMeta } from '../types'
import { StatItem } from './ui/StatItem'

interface Props {
  frame: SimFrame
  meta: SimMeta | null
  onChangeSim: () => void
}

function freqLabel(hz: number): string {
  return hz >= 1e9 ? `${(hz / 1e9).toFixed(1)} GHz` : `${(hz / 1e6).toFixed(0)} MHz`
}

export function StatsBar({ frame, meta, onChangeSim }: Props) {
  const { links } = frame
  const total = links.length
  const sinrLinks = links.filter((l) => l.sinr !== undefined)
  const avgSNR =
    sinrLinks.length > 0
      ? (sinrLinks.reduce((s, l) => s + (l.sinr ?? 0), 0) / sinrLinks.length).toFixed(1)
      : null

  return (
    <div className="flex items-center gap-0 px-4 py-2 bg-white border-b border-gray-200">
      {/* Scenario info */}
      <div className="flex items-center gap-2 pr-4 border-r border-gray-200 mr-2">
        <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
        <span className="text-gray-700 text-sm font-semibold tracking-wide">mmWave Sim</span>
        {meta && (
          <span className="ml-1 px-2 py-0.5 bg-sky-50 border border-sky-200 rounded text-xs text-sky-700 font-mono">
            {meta.scenario} · {freqLabel(meta.frequency)}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="hidden md:flex">
        <StatItem label="Links" value={String(total)} />
        {avgSNR !== null && <StatItem label="Avg SINR" value={`${avgSNR} dB`} />}
      </div>

      <button
        onClick={onChangeSim}
        className="ml-auto text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 transition-colors"
      >
        ← change sim
      </button>
    </div>
  )
}
