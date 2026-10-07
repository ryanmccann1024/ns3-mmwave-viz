import type { ReactNode } from 'react'
import type { RunEntry } from '../../lib/assembleRuns'
import type { ExperimentRoot } from '../../lib/experimentIndex'
import { folderLabel } from '../../lib/format'
import { experimentLabel } from '../../lib/rlLabels'

/** Runs grouped by their batch folder, newest batch first */
export function groupRuns(runs: RunEntry[]): [string, RunEntry[]][] {
  const map = new Map<string, RunEntry[]>()
  for (const r of runs) {
    const g = `${r.yearMonth}/${r.day}`
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(r)
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
}

export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'good'
}) {
  const cls =
    tone === 'accent'
      ? 'bg-accent-wash text-accent-ink border-accent/20'
      : tone === 'good'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-white/70 text-muted border-hairline'
  return (
    <span
      className={`text-xs font-medium border rounded-full px-2.5 py-0.5 whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  )
}

export interface Scenario {
  key: string
  name: string
  batch: string
  point?: string
  buildings: boolean
  runs: RunEntry[]
}

const seedNumber = (seed: string) => seed.replace(/^seed-/, '')

/** Seeds of the same scenario collapse into one entry, in first-seen order */
export function groupScenarios(runs: RunEntry[]): Scenario[] {
  const map = new Map<string, Scenario>()
  for (const r of runs) {
    const batch = `${r.yearMonth}/${r.day}`
    const key = `${batch}/${r.time}/${r.point ?? ''}`
    let s = map.get(key)
    if (!s) {
      s = { key, name: r.time, batch, point: r.point, buildings: false, runs: [] }
      map.set(key, s)
    }
    s.runs.push(r)
    s.buildings ||= Boolean(r.buildingsFile)
  }
  for (const s of map.values()) {
    s.runs.sort((a, b) =>
      seedNumber(a.seed).localeCompare(seedNumber(b.seed), undefined, { numeric: true })
    )
  }
  return [...map.values()]
}

/** One scenario: its name, then one button per seed */
export function ScenarioRow({
  scenario,
  onOpen,
  showBatch,
}: {
  scenario: Scenario
  onOpen: (run: RunEntry) => void
  showBatch?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/60 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink truncate">{scenario.name}</div>
        {showBatch && <div className="text-[11px] text-muted truncate">{scenario.batch}</div>}
      </div>
      {scenario.point && <Tag>{scenario.point}</Tag>}
      {scenario.buildings && <Tag tone="good">buildings</Tag>}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[11px] text-muted mr-1">Seed</span>
        {scenario.runs.map((run) => (
          <button
            key={run.key}
            onClick={() => onOpen(run)}
            title={`Play ${scenario.name} ${run.seed}`}
            className="min-w-[1.75rem] h-7 px-1.5 rounded-lg text-xs font-medium tabular-nums bg-white border border-hairline text-ink-2 shadow-control hover:border-accent hover:text-accent-ink transition-colors"
          >
            {seedNumber(run.seed)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** One row in a list of RL experiment folders */
export function ExperimentRow({ root, onOpen }: { root: ExperimentRoot; onOpen: () => void }) {
  const { name, date } = folderLabel(root.root)
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-white/80 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-ink truncate">
          {experimentLabel(name || 'This experiment')}
        </div>
        <div className="text-sm text-muted">
          {date ? `${date} · ` : ''}Compare policies and watch replays
        </div>
      </div>
      <Tag tone="accent">Open →</Tag>
    </button>
  )
}
