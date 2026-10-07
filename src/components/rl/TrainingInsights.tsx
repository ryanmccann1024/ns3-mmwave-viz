import { useEffect, useMemo, useState } from 'react'
import { discoverTrainingRuns, loadTrainingRun, type TrainingRun } from '../../lib/trainingRun'
import type { ResultCatalog } from '../../lib/resultCatalog'
import { EpisodeMeanRewardChart } from '../charts/EpisodeMeanRewardChart'
import { defaultWindow, episodeMeanRewards, rolling } from '../../lib/rlStats'
import { shortNumber } from '../../lib/format'
import { CheckpointChart, ComponentTrendChart, LearningCurveChart } from '../charts/RlCharts'
import { Note } from '../ExperimentStatus'

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass p-6 min-w-0">
      <div className="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight text-ink-title truncate">
        {value}
      </div>
      <div className="mt-1 text-base font-medium text-ink-2">{label}</div>
    </div>
  )
}

/** Learning curve, periodic evaluations and reward make-up for one training run */
export function TrainingInsights({ run, catalog }: { run: TrainingRun; catalog?: ResultCatalog }) {
  const [family, setFamily] = useState<{
    root: string
    runs: TrainingRun[]
    errors: number
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    const parent = run.root.slice(0, run.root.lastIndexOf('/'))
    const roots =
      catalog && /(?:^|\/)train-seed-\d+$/.test(run.root)
        ? discoverTrainingRuns(catalog).filter(
            (root) => root !== run.root && root.slice(0, root.lastIndexOf('/')) === parent
          )
        : []
    const signature = (r: TrainingRun) =>
      JSON.stringify([
        r.algorithm,
        r.rewardComponents,
        r.rewardWeights,
        r.actionMeanings,
        r.slotNodeIds,
        r.hyperparameters,
      ])
    Promise.allSettled(roots.map((root) => loadTrainingRun(catalog!, root))).then((results) => {
      if (cancelled) return
      const seeds = new Set([run.seed])
      const runs = [run]
      let errors = 0
      for (const result of results) {
        if (result.status === 'rejected') {
          errors++
          continue
        }
        const peer = result.value
        if (peer.seed !== null && !seeds.has(peer.seed) && signature(peer) === signature(run)) {
          runs.push(peer)
          seeds.add(peer.seed)
        }
      }
      setFamily({ root: run.root, runs, errors })
    })
    return () => {
      cancelled = true
    }
  }, [run, catalog])
  const runs = useMemo(() => (family?.root === run.root ? family.runs : [run]), [family, run])
  const episodeCurve = useMemo(() => episodeMeanRewards(runs), [runs])
  const counted = useMemo(() => run.episodes.filter((e) => e.counted && e.return !== null), [run])
  const window = defaultWindow(counted.length)
  const curve = useMemo(
    () =>
      rolling(
        counted.map((e) => ({ x: e.index, value: e.return! })),
        window
      ),
    [counted, window]
  )
  const components = useMemo(
    () =>
      run.rewardComponents.length
        ? run.rewardComponents
        : [...new Set(counted.flatMap((e) => Object.keys(e.components)))],
    [run, counted]
  )
  // weighted, so the component lines sit on the same scale as the return
  const componentData = useMemo(() => {
    const weightOf = (c: string) => run.rewardWeights[run.rewardComponents.indexOf(c)] ?? 1
    const series = components.map((c) =>
      rolling(
        counted.map((e) => ({ x: e.index, value: (e.components[c] ?? 0) * weightOf(c) })),
        window
      )
    )
    return counted.map((e, i) => ({
      x: e.index,
      ...Object.fromEntries(components.map((c, ci) => [c, series[ci][i].mean])),
    }))
  }, [run, counted, window, components])

  const first = curve.slice(0, window)
  const last = curve.slice(-window)
  const avg = (xs: { value: number }[]) => xs.reduce((a, b) => a + b.value, 0) / (xs.length || 1)
  const change = curve.length >= window * 2 ? avg(last) - avg(first) : null
  const bestCheckpoint = run.checkpoints?.length
    ? Math.max(
        ...run.checkpoints.map(
          (c) => c.returns.reduce((a, b) => a + b, 0) / (c.returns.length || 1)
        )
      )
    : null

  if (counted.length === 0) {
    return <Note>No completed training episodes were found in {run.root || 'this folder'}.</Note>
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <Tile value={String(counted.length)} label="Training episodes" />
        <Tile
          value={run.totalTimesteps !== null ? run.totalTimesteps.toLocaleString() : 'n/a'}
          label="Timesteps"
        />
        <Tile
          value={change === null ? 'n/a' : `${change >= 0 ? '+' : ''}${shortNumber(change)}`}
          label="Return gain"
        />
        <Tile
          value={shortNumber(bestCheckpoint ?? run.bestMeanReward)}
          label="Best checkpoint eval"
        />
      </div>

      <EpisodeMeanRewardChart points={episodeCurve} seedCount={runs.length} />
      {family?.root === run.root && family.errors > 0 && (
        <Note>
          {family.errors} other training runs could not be read; the curve includes the available
          seeds.
        </Note>
      )}
      <LearningCurveChart points={curve} window={window} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {run.checkpoints && run.checkpoints.length > 0 ? (
          <CheckpointChart checkpoints={run.checkpoints} evalSeed={run.evalSeed} />
        ) : (
          <div className="glass p-6 text-base text-ink-2">
            {run.checkpointsError ??
              'No evaluations.npz was saved for this run, so there are no periodic evaluations.'}
          </div>
        )}
        {components.length > 0 && (
          <ComponentTrendChart data={componentData} components={components} window={window} />
        )}
      </div>
    </div>
  )
}
