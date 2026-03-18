import type { SimFrame, SimMeta } from '../types'
import { Button } from './ui/Button'
import { StatItem } from './ui/StatItem'

interface Props {
  frame: SimFrame
  meta: SimMeta | null
  threshold: number
  onThresholdChange: (t: number) => void
  dimensions: 1 | 2 | 3
  onDimensionsChange: (d: 1 | 2 | 3) => void
}

function freqLabel(hz: number): string {
  return hz >= 1e9 ? `${(hz / 1e9).toFixed(0)} GHz` : `${(hz / 1e6).toFixed(0)} MHz`
}

export function StatsBar({
  frame,
  meta,
  threshold,
  onThresholdChange,
  dimensions,
  onDimensionsChange,
}: Props) {
  const { links } = frame
  const total = links.length
  const connected = links.filter((l) => l.connected).length
  const los = links.filter((l) => l.condition === 'LOS').length
  const losPct = total > 0 ? ((los / total) * 100).toFixed(0) : '—'
  const avgRx = total > 0 ? (links.reduce((s, l) => s + l.rxPower, 0) / total).toFixed(1) : '—'
  const airCount = frame.nodes.filter((n) => n.nodeType === 'air').length
  const groundCount = frame.nodes.filter((n) => n.nodeType === 'ground').length

  return (
    <div className="flex items-center gap-0 px-4 py-2 bg-slate-900/90 border-b border-slate-700 backdrop-blur">
      {/* Logo + scenario badge */}
      <div className="flex items-center gap-2 pr-4 border-r border-slate-700 mr-2">
        <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
        <span className="text-slate-300 text-sm font-semibold tracking-wide">NYU Mesh</span>
        {meta && (
          <span className="ml-1 px-2 py-0.5 bg-sky-900/60 border border-sky-700 rounded text-xs text-sky-300 font-mono">
            {meta.scenario} · {freqLabel(meta.frequency)}
          </span>
        )}
      </div>

      <div className="hidden md:flex">
        <StatItem
          label="Connected links"
          value={`${connected}/${total}`}
          accentClass={connected < total ? 'text-orange-400' : 'text-emerald-400'}
        />
        <StatItem label="LOS %" value={`${losPct}%`} />
        <StatItem label="Avg Rx Power" value={`${avgRx} dBm`} />
        <StatItem label="Nodes (air/gnd)" value={`${airCount}/${groundCount}`} />
      </div>

      {/* Dimension toggle */}
      <div className="flex items-center gap-1.5 ml-auto pl-4 border-l border-slate-700">
        <span className="text-xs text-slate-400 mr-1 hidden sm:inline">View</span>
        {([1, 2, 3] as const).map((d) => (
          <Button
            key={d}
            variant="ghost"
            active={dimensions === d}
            onClick={() => onDimensionsChange(d)}
          >
            {d}D
          </Button>
        ))}
      </div>

      {/* Threshold control */}
      <div className="flex items-center gap-2 pl-4 border-l border-slate-700">
        <span className="text-xs text-slate-400 whitespace-nowrap hidden sm:inline">
          Link threshold
        </span>
        <input
          type="number"
          value={threshold}
          step={1}
          onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
          className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
        />
        <span className="text-xs text-slate-500">dBm</span>
      </div>
    </div>
  )
}
