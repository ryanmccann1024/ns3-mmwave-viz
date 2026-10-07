import { useMemo, useState } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import type { RunEntry } from '../../lib/assembleRuns'
import { batchLabel } from '../../lib/format'
import { truncateText } from './BaselineInfo'
import {
  GroupSection,
  ListEmpty,
  ScenarioCard,
  groupRuns,
  groupScenarios,
  unplayableForBatch,
} from './shared'
import { MOTION } from '../../styles/motion'

interface Props {
  workspace: Workspace
  onOpenRun: (run: RunEntry) => void
}

export function RunsPage({ workspace, onOpenRun }: Props) {
  const [query, setQuery] = useState('')
  const unplayable = workspace.unplayableBaselines
  const batches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const runs = q
      ? workspace.runs.filter((r) =>
          `${r.yearMonth}/${r.day}/${r.time}/${r.point ?? ''}/${r.seed}`.toLowerCase().includes(q)
        )
      : workspace.runs
    const baselines = q
      ? unplayable.filter((b) => `${b.yearMonth}/${b.day}/${b.time}`.toLowerCase().includes(q))
      : unplayable
    return groupRuns(runs, baselines)
      .map(([batch, batchRuns]) => {
        const scenarios = groupScenarios(batchRuns, unplayableForBatch(baselines, batch))
        return { batch, scenarios, ...batchLabel(scenarios[0]?.runDir ?? '') }
      })
      .sort((a, b) => (b.sortKey ?? b.batch).localeCompare(a.sortKey ?? a.batch))
  }, [workspace.runs, unplayable, query])

  const empty = workspace.runs.length === 0 && unplayable.length === 0

  return (
    <div className="flex flex-col gap-6 sm:gap-8 py-4 sm:py-8">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink-title">
          Simulation runs
        </h1>
        {!empty && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <label className="relative flex-1 sm:flex-none sm:w-64">
              <span className="sr-only">Filter runs</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter"
                className={`w-full h-11 pl-10 pr-4 rounded-xl text-base text-ink bg-white border border-hairline shadow-control focus-visible:border-accent placeholder:text-ink-2/60 ${MOTION.colors}`}
              />
            </label>
          </div>
        )}
      </header>

      {workspace.baselineDiscoveryError && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Baseline runs could not be listed: {truncateText(workspace.baselineDiscoveryError, 200)}
        </div>
      )}

      {batches.length === 0 && (
        <div className={`glass ${MOTION.enterFade}`}>
          <ListEmpty>
            {empty ? 'No simulation runs yet.' : 'Nothing matches that filter.'}
          </ListEmpty>
        </div>
      )}

      {/* Keyed on the filter so a new result set fades in as a whole, never row by row */}
      <div key={query} className={`flex flex-col gap-4 ${MOTION.enterFade}`}>
        {batches.map(({ batch, scenarios, name, date }) => (
          <GroupSection
            key={batch}
            title={date ?? name ?? batch}
            meta={[
              date ? name : null,
              `${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            defaultOpen={query.trim() !== ''}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-5">
              {scenarios.map((scenario) => (
                <ScenarioCard key={scenario.key} scenario={scenario} onOpen={onOpenRun} />
              ))}
            </div>
          </GroupSection>
        ))}
      </div>
    </div>
  )
}
