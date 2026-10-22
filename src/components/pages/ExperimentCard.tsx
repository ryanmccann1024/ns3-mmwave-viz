import { useEffect, useState } from 'react'
import type { ExperimentRoot } from '../../lib/experimentIndex'
import { loadExperiment } from '../../lib/experimentIndex'
import { policyDelivery, type PolicyDelivery } from '../../lib/experimentSummary'
import type { ResultCatalog } from '../../lib/resultCatalog'
import { folderLabel } from '../../lib/format'
import { useTrainingRun } from '../../hooks/useRlData'
import { experimentLabel } from '../../lib/rlLabels'
import { MOTION } from '../../styles/motion'
import { missionSummary, objectiveValue } from '../../lib/missionObjective'
import { Spinner } from '../ui/Spinner'

interface ScenarioSummary {
  mission: ReturnType<typeof missionSummary>
  delivery: PolicyDelivery[]
  /** how many reward variants were evaluated */
  variants: number
}

// Reuse summaries within one folder scan; refreshing creates a new catalog.
const cache = new WeakMap<ResultCatalog, Map<string, Promise<ScenarioSummary | null>>>()

function loadSummary(catalog: ResultCatalog, root: string): Promise<ScenarioSummary | null> {
  let summaries = cache.get(catalog)
  if (!summaries) {
    summaries = new Map()
    cache.set(catalog, summaries)
  }
  let pending = summaries.get(root)
  if (!pending) {
    pending = loadExperiment(catalog, root)
      .then((experiment) => ({
        mission: missionSummary(experiment),
        delivery: policyDelivery(experiment),
        variants: new Set(experiment.evaluations.map((e) => e.label)).size,
      }))
      .catch(() => null)
    summaries.set(root, pending)
  }
  return pending
}

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
  const show = (v: number | undefined) => (settled ? pctOf(v ?? null) : null)
  const variants = summary?.variants ?? null
  const mission = summary?.mission
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
        <Figure
          value={
            mission
              ? objectiveValue(mission.model?.value, mission.objective)
              : show(model?.delivery)
          }
          label="Model"
        />
        <Figure
          value={
            mission
              ? objectiveValue(mission.baseline?.value, mission.objective)
              : show(baseline?.delivery)
          }
          label="Best baseline"
        />
        <Figure
          value={!settled ? null : variants === null ? '–' : String(variants)}
          label={variants === 1 ? 'Variant' : 'Variants'}
        />
      </div>
    </button>
  )
}

const pctOf = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)

/** The model's headline result in one scenario, as the scenario card shows it */
function modelFigure(summary: ScenarioSummary | null): string {
  if (summary?.mission)
    return objectiveValue(summary.mission.model?.value, summary.mission.objective)
  return pctOf(summary?.delivery.find((r) => r.policy === 'model')?.delivery ?? null)
}

/** A scenario run at several team sizes: the model's result at each size */
export function ScenarioFamilyCard({
  catalog,
  title,
  sizes,
  onOpen,
}: {
  catalog: ResultCatalog | null
  title: string
  sizes: { peers: number | null; root: ExperimentRoot }[]
  onOpen: () => void
}) {
  const [figures, setFigures] = useState<string[]>()
  const rootsKey = sizes.map((s) => s.root.root).join('|')
  useEffect(() => {
    if (!catalog) return
    let cancelled = false
    Promise.all(sizes.map((s) => loadSummary(catalog, s.root.root))).then((all) => {
      if (!cancelled) setFigures(all.map(modelFigure))
    })
    return () => {
      cancelled = true
    }
    // rootsKey stands in for sizes, which is rebuilt on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, rootsKey])

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`glass p-6 sm:p-7 flex flex-col gap-6 text-left min-w-0 hover:bg-white/80 ${MOTION.surface}`}
    >
      <span className="w-full text-xl font-semibold tracking-tight text-ink-title truncate">
        {title}
      </span>
      <div
        className="w-full grid gap-4"
        style={{ gridTemplateColumns: `repeat(${Math.max(3, sizes.length)}, minmax(0, 1fr))` }}
      >
        {sizes.map((s, i) => (
          <Figure
            key={s.root.root}
            value={figures ? figures[i] : null}
            label={`${s.peers} peers`}
          />
        ))}
      </div>
    </button>
  )
}

/** A headline number; `null` means it is still being read, shown as a spinner at the same height */
function Figure({ value, label }: { value: string | null; label: string }) {
  return (
    <div className="min-w-0">
      <div className="h-10 flex items-center text-4xl font-semibold tabular-nums tracking-tight text-ink-title">
        {/* The number fades in where the spinner was, so it never pops */}
        {value === null ? <Spinner size="sm" /> : <span className={MOTION.page}>{value}</span>}
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
  const [summary, setSummary] = useState<{ cases: number; variants: number }>()
  const rootsKey = roots.map((r) => r.root).join('|')
  useEffect(() => {
    if (!catalog) return
    let cancelled = false
    Promise.all(roots.map((r) => loadSummary(catalog, r.root))).then((all) => {
      if (cancelled) return
      setSummary({
        cases: all.filter((s) => s?.mission?.model || s?.delivery.some((r) => r.policy === 'model'))
          .length,
        variants: all.reduce((sum, s) => sum + (s?.variants ?? 0), 0),
      })
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
        <Figure value={summary ? String(summary.cases) : null} label="With results" />
        <Figure value={summary ? String(summary.variants) : null} label="Variants" />
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
  const show = (v: string | null | undefined) => (settled ? (v ?? '–') : null)
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
