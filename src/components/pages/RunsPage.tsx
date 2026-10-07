import { useMemo, useState } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import type { RunEntry } from '../../lib/assembleRuns'
import { PageHeader } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'
import { truncateText } from './BaselineInfo'
import { ScenarioRow, groupRuns, groupScenarios, unplayableForBatch } from './shared'
import { MOTION } from '../../styles/motion'

interface Props {
  workspace: Workspace
  onHome: () => void
  onOpenRun: (run: RunEntry) => void
}

export function RunsPage({ workspace, onHome, onOpenRun }: Props) {
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
    return groupRuns(runs, baselines).map(([batch, batchRuns]) => ({
      batch,
      runs: batchRuns,
      scenarios: groupScenarios(batchRuns, unplayableForBatch(baselines, batch)),
    }))
  }, [workspace.runs, unplayable, query])

  const runCount = `${workspace.runs.length} run${workspace.runs.length === 1 ? '' : 's'}`
  const baselineCount =
    unplayable.length > 0
      ? ` · ${unplayable.length} baseline${unplayable.length === 1 ? '' : 's'} without telemetry`
      : ''

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        parents={[{ label: 'Home', onClick: onHome }]}
        title="Simulation runs"
        subtitle={`${runCount}${baselineCount} in ${workspace.dirName ?? 'no folder'}. Pick a seed to play that run.`}
        actions={
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter runs"
            className="w-64 px-3 py-2 rounded-xl text-sm bg-white border border-hairline shadow-control focus-visible:border-accent placeholder:text-faint"
          />
        }
      />

      {workspace.baselineDiscoveryError && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Baseline runs could not be listed: {truncateText(workspace.baselineDiscoveryError, 200)}.
          Simulation runs below are unaffected.
        </div>
      )}

      {batches.length === 0 && (
        <div className={`glass p-6 text-sm text-muted text-center ${MOTION.enterFade}`}>
          {workspace.runs.length === 0 && unplayable.length === 0
            ? 'No simulation runs in this folder.'
            : 'No runs match that filter.'}
        </div>
      )}

      {/* Keyed on the filter so a new result set fades in as a whole, never row by row */}
      <div key={query} className={`flex flex-col gap-4 ${MOTION.enterFade}`}>
        {batches.map(({ batch, runs, scenarios }) => (
          <Panel
            key={batch}
            title={<span className="font-mono">{batch}</span>}
            meta={`${scenarios.length} scenarios · ${runs.length} runs`}
            bodyClassName="px-2 pb-2"
          >
            {scenarios.map((scenario) => (
              <ScenarioRow key={scenario.key} scenario={scenario} onOpen={onOpenRun} />
            ))}
          </Panel>
        ))}
      </div>
    </div>
  )
}
