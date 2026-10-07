import type { ReactNode } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import type { RunEntry } from '../../lib/assembleRuns'
import type { ExperimentRoot } from '../../lib/experimentIndex'
import { Button } from '../ui/Button'
import { BrandMark } from '../ui/BrandMark'
import type { Section } from '../shell/NavRail'
import { truncateText } from './BaselineInfo'
import {
  LIST_ROW,
  ListCard,
  ListEmpty,
  ScenarioItem,
  groupRuns,
  groupScenarios,
  unplayableForBatch,
} from './shared'
import { MOTION } from '../../styles/motion'
import { folderLabel } from '../../lib/format'
import { experimentLabel } from '../../lib/rlLabels'

interface Props {
  workspace: Workspace
  onNavigate: (section: Section) => void
  onOpenRun: (run: RunEntry) => void
  onOpenExperiment: (root: ExperimentRoot) => void
}

const RECENT = 5

function Stat({ value, label, onClick }: { value: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass p-6 sm:p-7 text-center hover:bg-white/80 ${MOTION.surface}`}
    >
      <div className="text-4xl sm:text-5xl font-semibold tabular-nums tracking-tight text-ink-title">
        {value}
      </div>
      <div className="mt-2 text-base font-medium text-ink-2">{label}</div>
    </button>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      {children}
    </div>
  )
}

function ExperimentItem({
  root,
  evaluations,
  onOpen,
}: {
  root: ExperimentRoot
  evaluations: number
  onOpen: () => void
}) {
  const { name } = folderLabel(root.root)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${LIST_ROW} hover:bg-white/70 ${MOTION.colors}`}
    >
      <span className="flex-1 min-w-0 text-lg font-medium text-ink truncate">
        {experimentLabel(name || 'This experiment')}
      </span>
      <span className="flex-shrink-0 text-base text-ink-2 tabular-nums">
        {evaluations === 1 ? '1 evaluation' : `${evaluations} evaluations`}
      </span>
    </button>
  )
}

/** Saved evaluations per experiment root, counted from the listing in one pass */
function evaluationCounts(paths: string[], roots: ExperimentRoot[]): Map<string, number> {
  const counts = new Map(roots.map((r) => [r.root, 0]))
  for (const path of paths) {
    if (!path.endsWith('/eval_manifest.json') && path !== 'eval_manifest.json') continue
    for (const { root } of roots) {
      if (root === '' || path.startsWith(`${root}/`)) counts.set(root, (counts.get(root) ?? 0) + 1)
    }
  }
  return counts
}

/** First screen: open a folder, or a quiet spinner while one is being read */
function Welcome({ loading, onOpen }: { loading: boolean; onOpen: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div
        className={`glass w-full max-w-lg px-8 py-12 sm:px-12 sm:py-14 flex flex-col items-center text-center ${MOTION.enter}`}
      >
        <BrandMark size={64} />
        <h1 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight text-ink-title">
          mmWave Viz
        </h1>
        {/* Keyed on the state so the loading and ready contents cross-fade */}
        <div key={loading ? 'loading' : 'ready'} className={`w-full ${MOTION.enterFade}`}>
          {loading ? (
            <div
              className="mt-10 flex flex-col items-center gap-4"
              role="status"
              aria-live="polite"
            >
              <div
                className="w-10 h-10 rounded-full border-[3px] border-accent/20 border-t-accent animate-spin"
                aria-hidden="true"
              />
              <p className="text-lg font-medium text-ink-2">Loading simulations</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <p className="mt-4 text-lg text-ink-2">Open your outputs folder to begin.</p>
              <Button variant="secondary" onClick={onOpen} className="mt-8 !h-12 !px-8 !text-lg">
                Open folder
              </Button>
              <p className="mt-6 text-base text-ink-2">
                Usually <span className="font-mono text-ink">scratch/mesh-sim/outputs</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
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

  if (!dirName || loadingDir) {
    return <Welcome loading={loadingDir} onOpen={workspace.openFolder} />
  }

  const scenarios = groupRuns(runs, unplayableBaselines).flatMap(([batch, batchRuns]) =>
    groupScenarios(batchRuns, unplayableForBatch(unplayableBaselines, batch))
  )
  const latestScenarios = scenarios.slice(0, RECENT)
  const latestExperiments = [...experimentRoots].reverse().slice(0, RECENT)
  const evalCounts = evaluationCounts(catalog?.paths() ?? [], latestExperiments)

  return (
    <div className="flex flex-col gap-6 sm:gap-8 py-4 sm:py-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        <Stat
          value={experimentRoots.length}
          label="RL experiments"
          onClick={() => onNavigate('experiments')}
        />
        <Stat value={runs.length} label="Simulation runs" onClick={() => onNavigate('runs')} />
        <Stat value={scenarios.length} label="Scenarios" onClick={() => onNavigate('runs')} />
      </div>

      {(catalog?.truncated || baselineDiscoveryError) && (
        <div className="flex flex-col gap-3">
          {catalog?.truncated && (
            <Notice>Some experiments may be missing. Open a smaller folder to see them all.</Notice>
          )}
          {baselineDiscoveryError && (
            <Notice>
              Baseline runs could not be listed: {truncateText(baselineDiscoveryError, 200)}
            </Notice>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 items-start gap-5">
        <ListCard
          title="Recent experiments"
          showAll={experimentRoots.length > RECENT}
          onShowAll={() => onNavigate('experiments')}
        >
          {latestExperiments.length === 0 ? (
            <ListEmpty>No RL experiments yet.</ListEmpty>
          ) : (
            latestExperiments.map((root) => (
              <ExperimentItem
                key={root.root}
                root={root}
                evaluations={evalCounts.get(root.root) ?? 0}
                onOpen={() => onOpenExperiment(root)}
              />
            ))
          )}
        </ListCard>

        <ListCard
          title="Recent scenarios"
          showAll={scenarios.length > RECENT}
          onShowAll={() => onNavigate('runs')}
        >
          {latestScenarios.length === 0 ? (
            <ListEmpty>No simulation runs yet.</ListEmpty>
          ) : (
            latestScenarios.map((scenario) => (
              <ScenarioItem key={scenario.key} scenario={scenario} onOpen={onOpenRun} />
            ))
          )}
        </ListCard>
      </div>
    </div>
  )
}
