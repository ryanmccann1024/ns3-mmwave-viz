import type { SimFrame, SimMeta } from '../types'
import { freqLabel } from '../lib/format'
import { StatItem } from './ui/StatItem'
import { Button } from './ui/Button'

type ViewMode = 'canvas' | 'charts' | 'split'

interface Props {
  frame: SimFrame
  meta: SimMeta | null
  activeView: ViewMode
  onChangeView: (view: ViewMode) => void
  compact: boolean
  onToggleCompact: () => void
  onChangeSim: () => void
}

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: 'canvas', label: '3D' },
  { key: 'split', label: 'Split' },
  { key: 'charts', label: 'Charts' },
]

export function StatsBar({
  frame,
  meta,
  activeView,
  onChangeView,
  compact,
  onToggleCompact,
  onChangeSim,
}: Props) {
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

      {/* View tabs */}
      <div className="flex items-center gap-0.5 pr-3 border-r border-gray-200 mr-2">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChangeView(tab.key)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeView === tab.key
                ? 'bg-sky-100 text-sky-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Compact toggle */}
      <div className="flex items-center gap-0.5 pr-3 border-r border-gray-200 mr-2">
        <button
          onClick={onToggleCompact}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            compact
              ? 'bg-violet-100 text-violet-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {compact ? 'Compact' : 'To Scale'}
        </button>
      </div>

      {/* Stats */}
      <div className="hidden md:flex">
        <StatItem label="Links" value={String(total)} />
        {avgSNR !== null && <StatItem label="Avg SINR" value={`${avgSNR} dB`} />}
        {meta && meta.rainRate > 0 && <StatItem label="Rain" value={`${meta.rainRate} mm/hr`} />}
      </div>

      <Button variant="ghost" className="ml-auto" onClick={onChangeSim}>
        ← change sim
      </Button>
    </div>
  )
}
