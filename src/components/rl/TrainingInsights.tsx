import { useMemo } from 'react'
import type { TrainingRun } from '../../lib/trainingRun'
import { defaultWindow, rolling } from '../../lib/rlStats'
import { shortNumber } from '../../lib/format'
import { CheckpointChart, ComponentTrendChart, LearningCurveChart } from '../charts/RlCharts'
import { Note } from '../ExperimentStatus'

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="tile px-4 py-3 min-w-[8.5rem]">
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  )
}

/** Learning curve, periodic evaluations and reward make-up for one training run */
export function TrainingInsights({ run }: { run: TrainingRun }) {
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
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        <Tile value={String(counted.length)} label="Training episodes" />
        <Tile
          value={run.totalTimesteps !== null ? run.totalTimesteps.toLocaleString() : 'n/a'}
          label="Timesteps"
        />
        <Tile
          value={change === null ? 'n/a' : `${change >= 0 ? '+' : ''}${shortNumber(change)}`}
          label={`Return, last vs first ${window} episodes`}
        />
        <Tile
          value={shortNumber(bestCheckpoint ?? run.bestMeanReward)}
          label="Best checkpoint eval"
        />
      </div>

      <LearningCurveChart points={curve} window={window} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {run.checkpoints && run.checkpoints.length > 0 ? (
          <CheckpointChart checkpoints={run.checkpoints} evalSeed={run.evalSeed} />
        ) : (
          <div className="glass p-4 text-sm text-muted">
            {run.checkpointsError ??
              'No evaluations.npz was saved for this run, so there are no periodic evaluations.'}
          </div>
        )}
        {components.length > 0 && (
          <ComponentTrendChart data={componentData} components={components} window={window} />
        )}
      </div>
      <div className="text-[11px] text-muted">
        This chart shows training seed {run.seed ?? 'unknown'} only. Shading is episode-to-episode
        variation within this model, not variation across independent models; switch training seeds
        in the experiment to inspect the others.
      </div>
    </div>
  )
}
