import { useEffect, useState } from 'react'
import type { ExperimentRoot } from '../../lib/experimentIndex'
import { loadExperiment } from '../../lib/experimentIndex'
import { policyDelivery, type PolicyDelivery } from '../../lib/experimentSummary'
import type { ResultCatalog } from '../../lib/resultCatalog'
import { folderLabel } from '../../lib/format'
import { useTrainingRun } from '../../hooks/useRlData'
import { experimentLabel } from '../../lib/rlLabels'
import { MOTION } from '../../styles/motion'

interface ScenarioSummary {
  delivery: PolicyDelivery[]
  /** how many reward variants were evaluated */
  variants: number
}

// Each experiment is read once per session, however often its card mounts
const cache = new Map<string, Promise<ScenarioSummary | null>>()

function loadSummary(catalog: ResultCatalog, root: string): Promise<ScenarioSummary | null> {
  const key = `${catalog.name}:${root}`
  let pending = cache.get(key)
  if (!pending) {
    pending = loadExperiment(catalog, root)
      .then((experiment) => ({
        delivery: policyDelivery(experiment),
        variants: new Set(experiment.evaluations.map((e) => e.label)).size,
      }))
      .catch(() => null)
    cache.set(key, pending)
  }
  return pending
}

const loadDelivery = (catalog: ResultCatalog, root: string) =>
  loadSummary(catalog, root).then((s) => s?.delivery ?? null)

function useSummary(catalog: ResultCatalog | null, root: string) {
  const [summary, setSummary] = useState<ScenarioSummary | null | undefined>(undefined)
  useEffect(() => {
    if (!catalog) return
    let cancelled = false
    loadSummary(catalog, root).then((s) => {
      if (!cancelled) setSummary(s)
    })
    return () => {
      cancelled = true
    }
  }, [catalog, root])
  return summary
}

/** One scenario of an experiment: delivered share for the model and best baseline, and reward variants */
export function ScenarioCard({
  catalog,
  root,
  onOpen,
}: {
  catalog: ResultCatalog | null
  root: ExperimentRoot
  onOpen: () => void
}) {
  const summary = useSummary(catalog, root.root)
  const settled = summary !== undefined
  const model = summary?.delivery.find((r) => r.policy === 'model')
  const baseline = summary?.delivery.find((r) => r.policy !== 'model')
  const show = (v: number | undefined) => (!settled ? '\u00a0' : pctOf(v ?? null))
  const variants = summary?.variants ?? null
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`glass p-6 sm:p-7 flex flex-col gap-6 text-left min-w-0 hover:bg-white/80 ${MOTION.surface}`}
    >
      <span className="w-full text-xl font-semibold tracking-tight text-ink-title truncate">
        {experimentLabel(folderLabel(root.root).name || 'This experiment')}
      </span>
      <div className="w-full grid grid-cols-3 gap-4">
        <Figure value={show(model?.delivery)} label="Model" />
        <Figure value={show(baseline?.delivery)} label="Best baseline" />
        <Figure
          value={!settled ? '\u00a0' : variants === null ? '–' : String(variants)}
          label={variants === 1 ? 'Reward variant' : 'Reward variants'}
        />
      </div>
    </button>
  )
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const pctOf = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-4xl font-semibold tabular-nums tracking-tight text-ink-title">
        {value}
      </div>
      <div className="mt-1 text-base font-medium text-ink-2">{label}</div>
    </div>
  )
}

/**
 * One experiment as a single card: its name, how many scenarios it ran, and delivered share
 * averaged over those scenarios for the model and for each scenario's best baseline
 */
export function ExperimentCard({
  catalog,
  title,
  roots,
  onOpen,
}: {
  catalog: ResultCatalog | null
  title: string
  roots: ExperimentRoot[]
  onOpen: () => void
}) {
  const [summary, setSummary] = useState<{ model: number | null; baseline: number | null }>()
  const rootsKey = roots.map((r) => r.root).join('|')
  useEffect(() => {
    if (!catalog) return
    let cancelled = false
    Promise.all(roots.map((r) => loadDelivery(catalog, r.root))).then((all) => {
      if (cancelled) return
      const model: number[] = []
      const baseline: number[] = []
      for (const rows of all) {
        const m = rows?.find((r) => r.policy === 'model')
        const b = rows?.find((r) => r.policy !== 'model')
        if (m) model.push(m.delivery)
        if (b) baseline.push(b.delivery)
      }
      setSummary({ model: mean(model), baseline: mean(baseline) })
    })
    return () => {
      cancelled = true
    }
    // rootsKey stands in for roots, which is rebuilt on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, rootsKey])

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`glass p-6 sm:p-7 flex flex-col gap-6 text-left min-w-0 hover:bg-white/80 ${MOTION.surface}`}
    >
      <div className="w-full flex items-center justify-between gap-4">
        <span className="text-xl font-semibold tracking-tight text-ink-title truncate">
          {title}
        </span>
      </div>
      <div className="w-full grid grid-cols-3 gap-4">
        <Figure
          value={String(roots.length)}
          label={roots.length === 1 ? 'Scenario' : 'Scenarios'}
        />
        <Figure value={summary ? pctOf(summary.model) : '\u00a0'} label="Model" />
        <Figure value={summary ? pctOf(summary.baseline) : '\u00a0'} label="Best baseline" />
      </div>
    </button>
  )
}

function duration(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt || !endedAt) return null
  const s = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000
  if (!Number.isFinite(s) || s < 0) return null
  if (s < 60) return `${Math.round(s)} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  return `${(s / 3600).toFixed(1)} h`
}

/** A training run beside a project's experiments: how long and how much it trained */
export function TrainingCard({
  catalog,
  root,
  title,
  onOpen,
}: {
  catalog: ResultCatalog | null
  root: string
  title: string
  onOpen: () => void
}) {
  const loaded = useTrainingRun(catalog, root)
  const run = loaded?.state === 'ready' ? loaded.value : null
  const settled = loaded?.state === 'ready' || loaded?.state === 'error'
  const show = (v: string | null | undefined) => (settled ? (v ?? '–') : ' ')
  const episodes = run ? run.episodes.filter((e) => e.counted).length : null
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`glass p-6 sm:p-7 flex flex-col gap-6 text-left min-w-0 hover:bg-white/80 ${MOTION.surface}`}
    >
      <div className="w-full flex items-center justify-between gap-4">
        <span className="text-xl font-semibold tracking-tight text-ink-title truncate">
          {title}
        </span>
        <span className="flex-shrink-0 text-base font-medium text-ink-2">Training run</span>
      </div>
      <div className="w-full grid grid-cols-3 gap-4">
        <Figure
          value={show(episodes === null ? null : String(episodes))}
          label={episodes === 1 ? 'Episode' : 'Episodes'}
        />
        <Figure
          value={show(run?.totalTimesteps == null ? null : run.totalTimesteps.toLocaleString())}
          label="Timesteps"
        />
        <Figure
          value={show(run ? duration(run.startedAt, run.endedAt) : null)}
          label="Training time"
        />
      </div>
    </button>
  )
}
