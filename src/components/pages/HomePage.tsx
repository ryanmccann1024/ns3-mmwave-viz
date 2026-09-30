import type { Workspace } from '../../hooks/useWorkspace'
import type { RunEntry } from '../../lib/assembleRuns'
import type { ExperimentRoot } from '../../lib/experimentIndex'
import { Button } from '../ui/Button'
import { BrandMark } from '../ui/BrandMark'
import { Panel } from '../ui/Panel'
import type { Section } from '../shell/NavRail'
import { truncateText } from './BaselineInfo'
import { ExperimentRow, ScenarioRow, groupRuns, groupScenarios, unplayableForBatch } from './shared'

interface Props {
  workspace: Workspace
  onNavigate: (section: Section) => void
  onOpenRun: (run: RunEntry) => void
  onOpenExperiment: (root: ExperimentRoot) => void
}

const RECENT = 5

function Tile({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tile px-4 py-3 text-left min-w-[8.5rem] hover:bg-white/80 transition-colors"
    >
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </button>
  )
}

export function HomePage({ workspace, onNavigate, onOpenRun, onOpenExperiment }: Props) {
  const {
    dirName,
    runs,
    experimentRoots,
    catalog,
    loadingDir,
    unplayableBaselines,
    baselineDiscoveryError,
  } = workspace

  if (!dirName) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="glass max-w-md w-full p-8 flex flex-col items-center text-center gap-3">
          <BrandMark size={52} />
          <h1 className="text-xl font-semibold tracking-tight text-ink-title mt-1">
            Open your outputs folder
          </h1>
          <p className="text-sm text-muted">
            Pick <span className="font-mono text-ink-2">scratch/mesh-sim/outputs</span>, or a single
            experiment or fetched-results folder. Simulation runs and RL experiments inside it
            appear here.
          </p>
          <Button
            variant="primary"
            onClick={workspace.openFolder}
            disabled={loadingDir}
            className="mt-2"
          >
            {loadingDir ? 'Reading folder…' : 'Open folder'}
          </Button>
        </div>
      </div>
    )
  }

  const scenarios = groupRuns(runs, unplayableBaselines).flatMap(([batch, batchRuns]) =>
    groupScenarios(batchRuns, unplayableForBatch(unplayableBaselines, batch))
  )
  const latestScenarios = scenarios.slice(0, RECENT)
  const latestExperiments = [...experimentRoots].reverse().slice(0, RECENT)

  return (
    <div className="flex flex-col gap-4">
      {/* Overview */}
      <section className="glass p-5 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4 flex-1 min-w-[16rem]">
          <div className="w-12 h-12 rounded-xl bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            >
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted">Open folder</div>
            <div className="text-lg font-semibold text-ink-title font-mono truncate">{dirName}</div>
            <div className="text-sm text-muted">
              Pick a run to play it, or an experiment to compare policies.
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Tile
            value={experimentRoots.length}
            label="RL experiments"
            onClick={() => onNavigate('experiments')}
          />
          <Tile value={runs.length} label="Simulation runs" onClick={() => onNavigate('runs')} />
          <Tile value={scenarios.length} label="Scenarios" onClick={() => onNavigate('runs')} />
        </div>
      </section>

      {catalog?.truncated && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          This folder exceeded the reader&apos;s file limit, so some experiments may be missing.
          Open one experiment or fetched-results folder directly.
        </div>
      )}

      {baselineDiscoveryError && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Baseline runs could not be listed: {truncateText(baselineDiscoveryError, 200)}. Simulation
          runs are unaffected.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel
          title="Latest RL experiments"
          meta={experimentRoots.length}
          actions={
            experimentRoots.length > RECENT && (
              <Button onClick={() => onNavigate('experiments')}>View all</Button>
            )
          }
          bodyClassName="px-2 pb-2"
        >
          {latestExperiments.length === 0 ? (
            <div className="px-2 pb-2 text-sm text-muted">No RL experiments in this folder.</div>
          ) : (
            latestExperiments.map((root) => (
              <ExperimentRow key={root.root} root={root} onOpen={() => onOpenExperiment(root)} />
            ))
          )}
        </Panel>

        <Panel
          title="Latest simulation scenarios"
          meta={scenarios.length}
          actions={
            scenarios.length > RECENT && (
              <Button onClick={() => onNavigate('runs')}>View all</Button>
            )
          }
          bodyClassName="px-2 pb-2"
        >
          {latestScenarios.length === 0 ? (
            <div className="px-2 pb-2 text-sm text-muted">No simulation runs in this folder.</div>
          ) : (
            latestScenarios.map((scenario) => (
              <ScenarioRow key={scenario.key} scenario={scenario} showBatch onOpen={onOpenRun} />
            ))
          )}
        </Panel>
      </div>
    </div>
  )
}
