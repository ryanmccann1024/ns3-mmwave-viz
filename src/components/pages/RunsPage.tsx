import { useMemo, useState } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import type { RunEntry } from '../../lib/assembleRuns'
import { PageHeader } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'
import { ScenarioRow, groupRuns, groupScenarios } from './shared'

interface Props {
  workspace: Workspace
  onHome: () => void
  onOpenRun: (run: RunEntry) => void
}

export function RunsPage({ workspace, onHome, onOpenRun }: Props) {
  const [query, setQuery] = useState('')
  const batches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? workspace.runs.filter((r) =>
          `${r.yearMonth}/${r.day}/${r.time}/${r.point ?? ''}/${r.seed}`.toLowerCase().includes(q)
        )
      : workspace.runs
    return groupRuns(filtered)
  }, [workspace.runs, query])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        parents={[{ label: 'Home', onClick: onHome }]}
        title="Simulation runs"
        subtitle={`${workspace.runs.length} runs in ${workspace.dirName ?? 'no folder'}. Pick a seed to play that run.`}
        actions={
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter runs"
            className="w-64 px-3 py-2 rounded-xl text-sm bg-white border border-hairline shadow-control outline-none focus:border-accent placeholder:text-faint"
          />
        }
      />

      {batches.length === 0 && (
        <div className="glass p-6 text-sm text-muted text-center">
          {workspace.runs.length === 0
            ? 'No simulation runs in this folder.'
            : 'No runs match that filter.'}
        </div>
      )}

      {batches.map(([batch, runs]) => (
        <Panel
          key={batch}
          title={<span className="font-mono">{batch}</span>}
          meta={`${groupScenarios(runs).length} scenarios · ${runs.length} runs`}
          bodyClassName="px-2 pb-2"
        >
          {groupScenarios(runs).map((scenario) => (
            <ScenarioRow key={scenario.key} scenario={scenario} onOpen={onOpenRun} />
          ))}
        </Panel>
      ))}
    </div>
  )
}
