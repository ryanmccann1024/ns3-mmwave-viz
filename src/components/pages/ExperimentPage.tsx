import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ResultCatalog } from '../../lib/resultCatalog'
import type {
  EvalBaselineInfo,
  Episode,
  Evaluation,
  Experiment,
  PlanInfo,
  TrainingSummary,
} from '../../lib/experimentIndex'
import { loadTrainingSummary } from '../../lib/experimentIndex'
import { formatNumber } from '../../lib/comparisonView'
import { folderLabel, shortNumber as fmt } from '../../lib/format'
import { trailColor } from '../../styles/tokens'
import { MissionComparison } from '../rl/MissionComparison'
import {
  ALL_FILTERS,
  matchesMissionFilters,
  executionMode,
  shortEvaluationTitle,
} from '../../lib/missionComparison'
import { PageHeader } from '../ui/PageHeader'
import type { Crumb } from '../ui/Breadcrumbs'
import { Panel } from '../ui/Panel'
import { Segmented } from '../ui/Segmented'
import { Disclosure } from '../ui/Disclosure'
import { PhasePill } from '../ui/PhasePill'
import { missionObjective, missionSummary, objectiveValue } from '../../lib/missionObjective'
import { ComparisonSection } from '../ComparisonTable'
import { PerSeedChart } from '../charts/PerSeedChart'
import { EvaluationInsights } from '../rl/EvaluationInsights'
import { TrainingInsights } from '../rl/TrainingInsights'
import { ExperimentSetup } from '../rl/ExperimentSetup'
import { useTrainingRun } from '../../hooks/useRlData'
import { matchTrainingRun } from '../../lib/trainingRun'
import { Button } from '../ui/Button'
import { ExperimentStatus, Note, Section as StatusSection, StateBadge } from '../ExperimentStatus'
import {
  baselineStatusLabel,
  experimentLabel,
  modelSelectionLabel,
  objectiveLabel,
  policyLabel,
  rewardLabel,
} from '../../lib/rlLabels'
import { MOTION } from '../../styles/motion'
import { Skeleton } from '../ui/Skeleton'
import { Loading, Spinner } from '../ui/Spinner'
import { BaselineProvenance, BaselineSetupLine, sourceMismatchKeys } from './BaselineInfo'

interface Props {
  catalog: ResultCatalog
  experiment: Experiment
  /** message from the last episode that could not be opened */
  openError: string | null
  openingEpisode: Episode | null
  onOpenEpisode: (episode: Episode) => void
  onHome: () => void
  onExperiments: () => void
  /** the experiment this scenario belongs to, between RL experiments and this page */
  groupCrumbs?: Crumb[]
  tab: ExperimentTab
  onTab: (tab: ExperimentTab) => void
  /** training run folders in the open folder, to find this evaluation's model */
  trainingRoots: string[]
  onOpenTrainingRun: (root: string) => void
  /** the same scenario at other team sizes, switched in place; the page is titled without the size */
  sizes?: { family: string; peers: number[]; value: number; onChange: (peers: number) => void }
}

export type ExperimentTab = 'results' | 'learning' | 'episodes' | 'setup' | 'details'

const MAX_METRIC_COLUMNS = 4

const evalTitle = (e: Evaluation) =>
  e.trainingSeed === null
    ? `${variantTitle(shortEvaluationTitle(e))} · baselines only`
    : `${variantTitle(shortEvaluationTitle(e))} · training seed ${e.trainingSeed}`

const ACRONYMS = new Set(['los', 'nlos', 'sinr', 'snr', 'mcs', 'rx', 'tx', 'uav', 'bs'])

/** Short names for the mission metrics, so tabs and table headers stay one line */
const METRIC_NAMES: Record<string, string> = {
  reactive_recovery_success: 'Reactive recovery',
  last_minute_travel_m: 'Final minute travel',
  active_post_failure_hold_fraction: 'Post-failure hold',
  post_failure_service_dip: 'Service after failure',
  furthest_peer_target_distance_m: 'Furthest from target',
  blocked_active_slot_fraction: 'Blocked move share',
  delivery_ratio: 'Delivery',
  travel_m_total: 'Travel',
  final_minute_survivor_delivery: 'Final service',
  final_minute_coverage: 'Final coverage',
  investigation_success: 'Completed',
  investigation_completion_s: 'Completion time',
  team_arrival_fraction_final: 'Team at target',
  goal_coverage_final: 'Target coverage',
  recovery_sustained_final: 'Sustained recovery',
  recovery_success: 'Recovered',
  recovery_delay_s: 'Recovery delay',
  post_failure_survivor_delivery: 'Post-failure service',
  survivor_outage_s: 'Outage time',
  post_failure_travel_m: 'Post-failure travel',
  post_failure_original_demand_delivery: 'Original demand',
  jammer_disruption_s: 'Disruption',
  // scenario-check outcomes from the phase report, after the case's event gate
  event_outage_s: 'Outage after event',
  pre_event_delivery: 'Service before event',
  post_event_delivery: 'Service after event',
  event_completed_ever: 'Event recovered',
  event_completion_s: 'Event recovered at',
  event_delay_s: 'Event recovery delay',
  event_sustained_through_end: 'Event sustained',
  post_jammer_delivery_ratio: 'After jamming',
  recovery_time_s: 'Recovery time',
  active_mean_sinr_db: 'Mean SINR',
  coverage_gain_final: 'Coverage gain',
  coverage_fraction_final: 'Coverage',
  coverage_fraction_mean: 'Mean coverage',
  worst_node_delivery_fraction: 'Worst node',
}

/** delivery_ratio -> Delivery ratio, los_fraction -> LOS fraction */
const humanize = (key: string) =>
  METRIC_NAMES[key] ??
  key
    .split('_')
    .map((w, i) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : i === 0
          ? w.charAt(0).toUpperCase() + w.slice(1)
          : w
    )
    .join(' ')

const pct0 = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`)

/** coverage-strong-travel -> Coverage strong travel */
const variantTitle = (label: string) => {
  const words = label.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const mean = (values: (number | null | undefined)[]) => {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** Method/objective/status of a placement-baseline policy, plus its measured setup numbers */
function BaselineSummary({ info }: { info: EvalBaselineInfo }) {
  return (
    <div className="flex flex-col gap-1 text-base text-ink-2">
      <div>
        {[
          info.objective !== null ? objectiveLabel(info.objective) : null,
          info.manifest?.status ? baselineStatusLabel(info.manifest.status) : null,
          !info.manifest && info.manifestError ? 'manifest unreadable' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
      <BaselineSetupLine
        className="text-base text-ink-2"
        initialDisplacementMTotal={info.initialDisplacementMTotal}
        plannerWallS={info.plannerWallS}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results: one leaderboard per evaluation
// ---------------------------------------------------------------------------

interface PolicyRow {
  policy: string
  returnMean: number | null
  metricMeans: Record<string, number | null>
  completed: number
  total: number
}

function policyRows(evaluation: Evaluation, metricKeys: string[]): PolicyRow[] {
  return evaluation.policies.map((policy) => {
    const eps = evaluation.episodes.filter((e) => e.policy === policy)
    const done = eps.filter((e) => e.status === 'completed')
    return {
      policy,
      returnMean: mean(done.map((e) => e.return)),
      metricMeans: Object.fromEntries(
        metricKeys.map((k) => [k, mean(done.map((e) => e.metrics?.[k]))])
      ),
      completed: done.length,
      total: eps.length,
    }
  })
}

const POLICY_ORDER = ['model', 'hold', 'random_valid']
const policyRank = (policy: string) =>
  POLICY_ORDER.includes(policy) ? POLICY_ORDER.indexOf(policy) : POLICY_ORDER.length

function useMetricKeys(evaluation: Evaluation) {
  return useMemo(() => {
    const keys = new Set<string>()
    for (const e of evaluation.episodes) for (const k of Object.keys(e.metrics ?? {})) keys.add(k)
    const objective = missionObjective(evaluation)
    const mission = objective
      ? { kind: objective.kind }
      : (evaluation.contract?.mission as { kind?: string } | undefined)
    const priority =
      mission?.kind === 'investigation'
        ? [
            'investigation_success',
            'team_arrival_fraction_final',
            'team_distance_remaining_m',
            'furthest_peer_target_distance_m',
            'last_minute_travel_m',
            'travel_m_total',
            'final_minute_survivor_delivery',
            'goal_coverage_final',
            'investigation_completion_s',
            'delivery_ratio',
          ]
        : mission?.kind === 'recovery'
          ? [
              'reactive_recovery_success',
              'recovery_sustained_final',
              'post_failure_service_dip',
              'post_failure_travel_m',
              'active_post_failure_hold_fraction',
              'blocked_active_slot_fraction',
              'final_minute_survivor_delivery',
              'recovery_success',
              'recovery_delay_s',
              'post_failure_survivor_delivery',
              'survivor_outage_s',
              'post_failure_travel_m',
              'final_minute_survivor_delivery',
              'travel_m_total',
              'post_failure_original_demand_delivery',
            ]
          : mission?.kind === 'jamming'
            ? [
                'jammer_disruption_s',
                'event_outage_s',
                'post_event_delivery',
                'last_minute_travel_m',
                'post_jammer_delivery_ratio',
                'final_minute_survivor_delivery',
                'recovery_time_s',
                'active_mean_sinr_db',
                'travel_m_total',
              ]
            : [
                'coverage_gain_final',
                'last_minute_travel_m',
                'final_minute_coverage',
                'coverage_fraction_final',
                'coverage_fraction_mean',
                'delivery_ratio',
                'worst_node_delivery_fraction',
                'travel_m_total',
              ]
    const scalar = [...keys].filter((key) =>
      evaluation.episodes.some(
        (episode) => typeof episode.metrics?.[key] === 'number' || episode.metrics?.[key] === null
      )
    )
    return mission
      ? [
          ...[...new Set(priority)].filter((key) => scalar.includes(key)),
          ...scalar.filter((key) => !priority.includes(key)),
        ]
      : scalar.slice(0, MAX_METRIC_COLUMNS)
  }, [evaluation])
}

const pct1 = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : `${(v * 100).toFixed(1)}%`

/** A section of the page: a large heading, optional controls on the right, then its content */
function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 min-w-0">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-2xl font-semibold tracking-tight text-ink-title">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

/** One card per policy: traffic delivered and return, the trained model first */
function PolicyResults({ evaluation }: { evaluation: Evaluation }) {
  const [tableOpen, setTableOpen] = useState(false)
  const metricKeys = useMetricKeys(evaluation)
  const rows = useMemo(
    () =>
      policyRows(evaluation, metricKeys).sort(
        (a, b) => policyRank(a.policy) - policyRank(b.policy)
      ),
    [evaluation, metricKeys]
  )
  const returns = rows.map((r) => r.returnMean).filter((v): v is number => v !== null)
  const best = returns.length ? Math.max(...returns) : null
  const objective = missionObjective(evaluation)
  const secondary =
    objective && objective.secondary !== objective.metric ? objective.secondary : null

  return (
    <Section
      title={`Policies · ${variantTitle(shortEvaluationTitle(evaluation))}`}
      aside={
        rows.length > 0 && (
          <Button variant="secondary" onClick={() => setTableOpen((open) => !open)}>
            {tableOpen ? 'Hide all metrics' : 'Show all metrics'}
          </Button>
        )
      }
    >
      {evaluation.state !== 'ok' && evaluation.message && (
        <Note tone={evaluation.state === 'failed' ? 'error' : 'warn'}>{evaluation.message}</Note>
      )}
      {evaluation.episodes.some((e) => e.rewardRescored) && (
        <p className="text-base text-ink-2">Baseline rewards are rescored with this reward.</p>
      )}
      {rows.length === 0 ? (
        <div className="glass p-6 text-base text-ink-2">
          No episodes are indexed for this evaluation.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {rows.map((row) => (
            <div key={row.policy} className="glass p-6 flex flex-col gap-5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: trailColor(row.policy) }}
                />
                <span className="text-xl font-semibold tracking-tight text-ink-title truncate">
                  {policyLabel(row.policy)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Figure
                  value={
                    objective
                      ? objectiveValue(row.metricMeans[objective.metric], objective)
                      : pct1(row.metricMeans.delivery_ratio)
                  }
                  label={objective?.label ?? 'Delivered'}
                />
                <Figure
                  value={secondary ? pct1(row.metricMeans[secondary]) : fmt(row.returnMean)}
                  label={secondary ? objective!.secondaryLabel : 'Return'}
                />
              </div>
              {row.completed < row.total && (
                <div className="text-base text-ink-2">
                  {row.completed} of {row.total} episodes completed
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {tableOpen && (
        <div className={`glass p-6 overflow-x-auto ${MOTION.enterFade}`}>
          <table className="w-full text-base">
            <thead>
              <tr className="text-left text-sm text-ink-2">
                <th className="font-medium pb-3 pr-4 text-left">Policy</th>
                <th className="font-medium pb-3 pr-4 text-right">Mean return</th>
                <th className="font-medium pb-3 pr-6 text-right">Gap to best</th>
                {metricKeys.map((k) => (
                  <th key={k} className="font-medium pb-3 pr-4 text-right whitespace-nowrap">
                    {humanize(k)}
                  </th>
                ))}
                <th className="font-medium pb-3 text-right">Episodes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.policy} className="border-t border-hairline">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: trailColor(r.policy) }}
                      />
                      <span className="font-medium text-ink whitespace-nowrap">
                        {policyLabel(r.policy)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums font-semibold text-ink">
                    {fmt(r.returnMean)}
                  </td>
                  <td className="py-3 pr-6 text-right tabular-nums text-ink-2">
                    {best === null || r.returnMean === null
                      ? '–'
                      : r.returnMean === best
                        ? 'Best'
                        : `-${fmt(best - r.returnMean)}`}
                  </td>
                  {metricKeys.map((k) => (
                    <td key={k} className="py-3 pr-4 text-right tabular-nums text-ink-2">
                      {fmt(r.metricMeans[k])}
                    </td>
                  ))}
                  <td className="py-3 text-right tabular-nums text-ink-2">
                    {r.completed}/{r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

/** Every policy on each evaluation seed, so a win can be seen to hold seed by seed */
function SeedComparison({ evaluation }: { evaluation: Evaluation }) {
  const metricKeys = useMetricKeys(evaluation)
  if (evaluation.episodes.length === 0) return null
  return (
    <Section title="Seed by seed">
      <div className="glass p-6">
        <PerSeedChart
          evaluation={evaluation}
          metricKeys={metricKeys.slice(0, 6)}
          label={humanize}
        />
      </div>
    </Section>
  )
}

interface VariantSummary {
  label: string
  title: string
  /** the reward's name when the title does not already carry it */
  reward: string | null
  /** the mission's headline metric, e.g. Final service */
  metricLabel: string
  model: string
  baseline: string
  travel: string
  pending: string | null
}

/** Seed-averaged headline numbers for one reward variant (all its training seeds) */
function variantSummary(group: Evaluation[]): VariantSummary {
  const evaluation = group[0]
  const objective = missionObjective(evaluation)
  const metric = objective?.metric ?? 'delivery_ratio'
  const show = (v: number | null) => (objective ? objectiveValue(v, objective) : pct0(v))
  const result = (policy: string, key: string) =>
    mean(
      group.map(
        (entry) => policyRows(entry, [key]).find((row) => row.policy === policy)?.metricMeans[key]
      )
    )
  const higher = objective?.higher ?? true
  const baselines = evaluation.policies
    .filter((policy) => policy !== 'model')
    .map((policy) => result(policy, metric))
    .filter((v): v is number => v !== null)
  const travel = result('model', 'travel_m_total')
  const modelValue = result('model', metric)
  const title = evaluation.missionRewardTitle
    ? `${evaluation.missionRewardTitle} · ${executionMode(evaluation)}`
    : variantTitle(shortEvaluationTitle(evaluation))
  const reward = rewardLabel(evaluation)
  return {
    label: evaluation.label,
    title,
    reward: evaluation.missionRewardTitle
      ? (evaluation.missionPpoLabel ?? null)
      : title.toLowerCase().includes(reward.toLowerCase())
        ? null
        : reward,
    metricLabel: objective?.label ?? 'Model delivery',
    model: show(modelValue),
    baseline: show(
      baselines.length ? (higher ? Math.max(...baselines) : Math.min(...baselines)) : null
    ),
    travel: travel === null ? '–' : `${Math.round(travel).toLocaleString()} m`,
    pending: evaluation.state === 'ok' ? null : (evaluation.message ?? 'Comparison pending'),
  }
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight text-ink-title truncate">
        {value}
      </div>
      <div className="mt-1 text-base font-medium text-ink-2">{label}</div>
    </div>
  )
}

/** One card per policy with its evaluation seeds as joined buttons; a click plays that replay */
/** A policy's evaluation seeds as one joined button group; a click plays that replay */
function SeedButtons({
  policy,
  episodes,
  openingEpisode,
  onOpenEpisode,
}: {
  policy: string
  episodes: Episode[]
  openingEpisode: Episode | null
  onOpenEpisode: (episode: Episode) => void
}) {
  return (
    <div className="flex rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-x divide-hairline">
      {episodes.map((e) => {
        const busy = openingEpisode === e
        return (
          <button
            key={e.dir}
            type="button"
            onClick={() => onOpenEpisode(e)}
            disabled={!e.playable || openingEpisode !== null}
            title={e.playable ? `Play seed ${e.seed}` : (e.message ?? 'No playback files')}
            aria-label={`Play ${policyLabel(policy)} on evaluation seed ${e.seed}`}
            className={`flex-1 h-11 px-3 text-base font-medium tabular-nums ${MOTION.colors} ${
              busy
                ? 'bg-accent-wash text-accent-ink'
                : e.playable
                  ? 'text-ink hover:bg-accent-wash hover:text-accent-ink'
                  : 'text-ink-2/50 cursor-not-allowed'
            }`}
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                Opening
              </span>
            ) : (
              e.seed
            )}
          </button>
        )
      })}
    </div>
  )
}

const policyEpisodes = (evaluation: Evaluation, policy: string) =>
  evaluation.episodes.filter((e) => e.policy === policy).sort((a, b) => a.seed - b.seed)

/**
 * The header's Watch in 3D: a menu of every policy's seeds for the chosen variant, so a
 * replay opens without scrolling to the Watch in 3D tab
 */
function WatchMenu({
  evaluation,
  openingEpisode,
  onOpenEpisode,
}: {
  evaluation: Evaluation | undefined
  openingEpisode: Episode | null
  onOpenEpisode: (episode: Episode) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !ref.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const policies = evaluation
    ? [...evaluation.policies]
        .sort((a, b) => policyRank(a) - policyRank(b))
        .filter((policy) => policyEpisodes(evaluation, policy).length > 0)
    : []
  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={policies.length === 0}
      >
        Watch in 3D
      </Button>
      {open && evaluation && (
        <div
          role="dialog"
          aria-label="Choose a replay"
          className={`absolute right-0 top-full mt-3 z-20 w-[min(30rem,calc(100vw-2rem))] flex flex-col rounded-2xl border border-hairline bg-white shadow-glass ${MOTION.enter}`}
        >
          <div className="px-6 pt-5 pb-4 border-b border-hairline text-lg font-semibold tracking-tight text-ink-title">
            {variantTitle(shortEvaluationTitle(evaluation))}
          </div>
          <div className="px-6 pt-5 pb-6 flex flex-col gap-5">
            {policies.map((policy) => (
              <div key={policy} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: trailColor(policy) }}
                  />
                  <span className="text-base font-semibold text-ink truncate">
                    {policyLabel(policy)}
                  </span>
                </div>
                <SeedButtons
                  policy={policy}
                  episodes={policyEpisodes(evaluation, policy)}
                  openingEpisode={openingEpisode}
                  onOpenEpisode={onOpenEpisode}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReplayCards({
  evaluation,
  openingEpisode,
  onOpenEpisode,
}: {
  evaluation: Evaluation
  openingEpisode: Episode | null
  onOpenEpisode: (episode: Episode) => void
}) {
  const policies = [...evaluation.policies].sort((a, b) => policyRank(a) - policyRank(b))
  return (
    <Section title={`Replays · ${variantTitle(shortEvaluationTitle(evaluation))}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
        {policies.map((policy) => {
          const episodes = evaluation.episodes
            .filter((e) => e.policy === policy)
            .sort((a, b) => a.seed - b.seed)
          return (
            <div key={policy} className="glass p-6 flex flex-col gap-5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: trailColor(policy) }}
                />
                <span className="text-xl font-semibold tracking-tight text-ink-title truncate">
                  {policyLabel(policy)}
                </span>
              </div>
              {episodes.length === 0 ? (
                <div className="text-base text-ink-2">No saved episodes</div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-base font-medium text-ink-2">Evaluation seed</div>
                  <SeedButtons
                    policy={policy}
                    episodes={episodes}
                    openingEpisode={openingEpisode}
                    onOpenEpisode={onOpenEpisode}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Details: plan, artifacts, per-evaluation manifests
// ---------------------------------------------------------------------------

function PlanView({ plan, evaluations }: { plan: PlanInfo; evaluations: Evaluation[] }) {
  const ready = evaluations.filter((evaluation) => evaluation.state === 'ok').length
  const planned = plan.rows.length * plan.seeds.training.length
  return (
    <Panel title="Experiment plan">
      <p className="text-sm text-ink-2 leading-relaxed mb-4">
        {ready} of {planned} planned row-and-training-seed evaluations are saved. Each reward row
        trains one independent model per training seed.
      </p>
      <div className="text-sm text-ink-2 flex flex-wrap gap-x-6 gap-y-2 mb-4">
        <span>
          <span className="text-ink-2">Training seeds</span>{' '}
          {plan.seeds.training.join(', ') || 'none'}
        </span>
        <span>
          <span className="text-ink-2">Model-selection seed</span>{' '}
          {plan.seeds.model_selection ?? 'none'}
        </span>
        <span>
          <span className="text-ink-2">Held-out seeds</span>{' '}
          {plan.seeds.held_out.join(', ') || 'none'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left text-ink-2">
              <th className="font-medium pr-4 py-1">Row</th>
              <th className="font-medium pr-4">Scene input</th>
              <th className="font-medium pr-4">Observation preset</th>
              <th className="font-medium pr-4">Action profile</th>
              <th className="font-medium">Reward components (weight)</th>
              <th className="font-medium pl-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={row.name} className="border-t border-ink/[0.06]">
                <td className="pr-4 py-3 text-ink font-semibold">{row.name}</td>
                <td className="pr-4 text-ink-2 break-all">{row.run_config ?? 'not recorded'}</td>
                <td className="pr-4 text-ink-2">{row.observation_preset ?? 'not recorded'}</td>
                <td className="pr-4 text-ink-2">{row.action_profile ?? 'not recorded'}</td>
                <td className="text-ink-2">
                  {(row.reward_components ?? [])
                    .map((c, i) => `${c} (${formatNumber(row.reward_weights?.[i])})`)
                    .join(', ') || 'not recorded'}
                </td>
                <td className="pl-4 whitespace-nowrap text-ink-2">
                  {
                    evaluations.filter(
                      (evaluation) => evaluation.label === row.name && evaluation.state === 'ok'
                    ).length
                  }
                  /{plan.seeds.training.length} saved
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-ink-2 mt-4 leading-relaxed">
        Training seeds generate PPO rollouts; the model-selection seed picks a saved checkpoint;
        evaluation seeds test that frozen checkpoint. A seed is a simulator random-number setting,
        not an episode number. “Ablation” means changing one input at a time, not a physical scene.
      </div>
    </Panel>
  )
}

function KeyValues({ entries }: { entries: [string, string][] }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <span className="text-ink-2">{k}</span>
          <span className="text-ink-2 break-all">{v}</span>
        </div>
      ))}
    </div>
  )
}

function TrainingSummaryView({ summary }: { summary: TrainingSummary }) {
  if (!summary.present) return <Note tone="warn">Training manifest not found: {summary.path}</Note>
  if (summary.message) return <Note tone="warn">{summary.message}</Note>
  const entries: [string, string][] = [
    ['Training seed', formatNumber(summary.seed)],
    ['Status', summary.status ?? 'not recorded'],
    ['Algorithm', summary.algorithm ?? 'not recorded'],
    ['Model used by this evaluation', modelSelectionLabel(summary.modelUsedByEval)],
    [
      'Best mean evaluation reward during training',
      summary.bestMeanReward === null
        ? 'none: no best checkpoint was selected'
        : formatNumber(summary.bestMeanReward),
    ],
    ['Selection', summary.selection === null ? 'not recorded' : JSON.stringify(summary.selection)],
  ]
  if (summary.hyperparameters) {
    entries.push([
      'Hyperparameters',
      Object.entries(summary.hyperparameters)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join('  '),
    ])
  }
  return (
    <div className="flex flex-col gap-2">
      <KeyValues entries={entries} />
      <div className="text-[11px] text-ink-2">
        A single saved value from model selection, not a learning curve. Source: {summary.path}
      </div>
    </div>
  )
}

function EvaluationDetails({
  catalog,
  experiment,
  evaluation,
}: {
  catalog: ResultCatalog
  experiment: Experiment
  evaluation: Evaluation
}) {
  const [training, setTraining] = useState<TrainingSummary | null>(null)
  const [requested, setRequested] = useState(false)

  const entries: [string, string][] = [
    ['Folder', evaluation.evalDir],
    ['Simulator status', evaluation.simulatorStatus ?? 'not recorded'],
    [
      'Episodes',
      `${formatNumber(evaluation.episodesCompleted)} of ${formatNumber(evaluation.episodesExpected)}`,
    ],
    [
      'Seeds',
      evaluation.heldOut === true
        ? 'held-out'
        : evaluation.heldOut === false
          ? 'not held-out'
          : 'not recorded',
    ],
    ['Model', modelSelectionLabel(evaluation.modelSelection)],
  ]
  if (evaluation.fetchTaskState) entries.push(['Fetch snapshot', evaluation.fetchTaskState])
  // Placement-baseline policies, in the evaluation's policy order
  const baselineEntries = evaluation.policies
    .filter((policy) => evaluation.baselines[policy])
    .map((policy) => [policy, evaluation.baselines[policy]] as const)

  return (
    <StatusSection title={evalTitle(evaluation)} aside={<StateBadge state={evaluation.state} />}>
      <div className="flex flex-col gap-3">
        <KeyValues entries={entries} />
        {!evaluation.declared && experiment.plan && (
          <Note tone="warn">This evaluation is not declared in the plan.</Note>
        )}
        {evaluation.message && (
          <Note tone={evaluation.state === 'failed' ? 'error' : 'warn'}>{evaluation.message}</Note>
        )}
        {evaluation.overlap.length > 0 && (
          <Note tone="warn">
            The manifest records evaluation seeds that overlap with training or model-selection
            seeds: {evaluation.overlap.join(', ')}.
          </Note>
        )}
        {evaluation.compatibilityNote && <Note>{evaluation.compatibilityNote}</Note>}
        {baselineEntries.map(([policy, info]) => {
          const mismatched = sourceMismatchKeys(info.sourceIdentityCheck)
          return (
            mismatched.length > 0 && (
              <Note key={policy} tone="warn">
                {policyLabel(policy)}: source scenario differs from the baseline&apos;s recorded
                source: {mismatched.join(', ')}.
              </Note>
            )
          )
        })}
        {baselineEntries.length > 0 && (
          <div>
            {baselineEntries.map(([policy, info]) => (
              <div key={policy}>
                <div className="text-lg font-semibold text-ink-title mt-3">
                  {policyLabel(policy)}
                </div>
                <BaselineSummary info={info} />
                <BaselineProvenance
                  title={`Baseline provenance · ${policyLabel(policy)}`}
                  manifest={info.manifest}
                  evalInfo={info}
                  sourceIdentityCheck={info.sourceIdentityCheck}
                  manifestError={info.manifestError}
                />
              </div>
            ))}
          </div>
        )}
        <div
          onClick={() => {
            if (requested) return
            setRequested(true)
            loadTrainingSummary(catalog, experiment.root, evaluation).then(setTraining)
          }}
        >
          <Disclosure title="Training summary">
            {training ? (
              <div className={MOTION.page}>
                <TrainingSummaryView summary={training} />
              </div>
            ) : (
              <div className="flex flex-col gap-4" aria-busy="true">
                <Loading label="Reading training summary" size="sm" />
                <Skeleton lines={3} />
              </div>
            )}
          </Disclosure>
        </div>
      </div>
    </StatusSection>
  )
}

// ---------------------------------------------------------------------------
// Learning: the linked training run, with this evaluation's means for reference
// ---------------------------------------------------------------------------

function LearningForEvaluation({
  catalog,
  evaluation,
  trainingRoots,
  onOpenTrainingRun,
}: {
  catalog: ResultCatalog
  evaluation: Evaluation
  trainingRoots: string[]
  onOpenTrainingRun: (root: string) => void
}) {
  const root = matchTrainingRun(evaluation.trainingRunDir, trainingRoots)
  const loaded = useTrainingRun(catalog, root)
  if (!root) {
    return (
      <Note>
        The model was trained in{' '}
        {evaluation.trainingRunDir ?? 'a folder the manifest does not name'}, which is not inside
        the open folder. Open the outputs folder that contains it to see its learning curve.
      </Note>
    )
  }
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Section
        title="Training"
        aside={
          <Button variant="secondary" onClick={() => onOpenTrainingRun(root)}>
            Open training run
          </Button>
        }
      ></Section>
      {(!loaded || loaded.state === 'loading') && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Loading label="Reading training run" />
          <Skeleton lines={3} />
        </div>
      )}
      {loaded?.state === 'error' && <Note tone="error">{loaded.message}</Note>}
      {loaded?.state === 'ready' && (
        <div className={MOTION.page}>
          <TrainingInsights run={loaded.value} catalog={catalog} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ExperimentPage({
  catalog,
  experiment,
  openError,
  openingEpisode,
  onOpenEpisode,
  onHome,
  onExperiments,
  groupCrumbs = [],
  tab,
  onTab,
  trainingRoots,
  onOpenTrainingRun,
  sizes,
}: Props) {
  const { name } = folderLabel(experiment.root)
  const evaluations = experiment.evaluations
  const problems =
    experiment.issues.length +
    evaluations.filter(
      (e) =>
        e.state === 'failed' ||
        e.state === 'not_fetched' ||
        (e.state === 'incomplete' &&
          e.simulatorStatus !== null &&
          !['running', 'planned'].includes(e.simulatorStatus))
    ).length
  const [missionFilters, setMissionFilters] = useState(ALL_FILTERS)
  const allSavedEvaluations = evaluations.filter((e) => e.state !== 'missing')
  const savedEvaluations = allSavedEvaluations.filter((e) =>
    matchesMissionFilters(e, missionFilters)
  )
  const pendingEvaluations = evaluations.length - allSavedEvaluations.length
  const filtering = Object.values(missionFilters).some((v) => v !== 'All')
  const [selectedEvaluationKey, setSelectedEvaluationKey] = useState('')
  const missionBest = useMemo(() => missionSummary(experiment), [experiment])
  const selectedEvaluation =
    savedEvaluations.find((e) => e.key === selectedEvaluationKey) ??
    savedEvaluations.find((e) => e.label === missionBest?.model?.label) ??
    savedEvaluations[0]
  const variantGroups = [...new Set(savedEvaluations.map((evaluation) => evaluation.label))].map(
    (label) => savedEvaluations.filter((evaluation) => evaluation.label === label)
  )
  const selectedGroup = variantGroups.find((group) => group[0].label === selectedEvaluation?.label)
  const variantSummaries = variantGroups.map(variantSummary)
  const selectGroup = (label: string) => {
    const group = variantGroups.find((g) => g[0].label === label)
    if (!group) return
    const sameSeed = group.find((entry) => entry.trainingSeed === selectedEvaluation?.trainingSeed)
    setSelectedEvaluationKey((sameSeed ?? group[0]).key)
  }
  const hasModel = evaluations.some((e) => e.trainingSeed !== null)

  return (
    <div className="flex flex-col gap-8 sm:gap-10 py-4 sm:py-8">
      <PageHeader
        parents={[
          { label: 'Home', onClick: onHome },
          { label: 'RL experiments', onClick: onExperiments },
          ...groupCrumbs,
        ]}
        title={sizes?.family ?? experimentLabel(name || experiment.plan?.name || experiment.name)}
        actions={
          <>
            {sizes && (
              <Segmented
                size="lg"
                options={sizes.peers.map((p) => ({ value: p, label: `${p} peers` }))}
                value={sizes.value}
                onChange={sizes.onChange}
              />
            )}
            <WatchMenu
              evaluation={selectedEvaluation}
              openingEpisode={openingEpisode}
              onOpenEpisode={onOpenEpisode}
            />
          </>
        }
      />
      {experiment.campaignProgress &&
        experiment.campaignProgress.status !== 'completed' &&
        experiment.evaluations.some((evaluation) => evaluation.state !== 'ok') && (
          <Note tone={experiment.campaignProgress.status === 'failed' ? 'error' : 'warn'}>
            {experiment.campaignProgress.trained} of {experiment.campaignProgress.expected} models
            trained
            {experiment.campaignProgress.status === 'failed' ? '; the campaign stopped.' : '.'}
          </Note>
        )}

      {(catalog.truncated || openError || pendingEvaluations > 0) && (
        <div className="flex flex-col gap-3 -mt-2">
          {catalog.truncated && (
            <Note tone="warn">
              The folder listing was cut off, so some files may be missing. Open the experiment
              folder itself.
            </Note>
          )}
          {openError && <Note tone="error">{openError}</Note>}
          {pendingEvaluations > 0 && (
            <Note tone="warn">
              {pendingEvaluations} planned evaluation
              {pendingEvaluations === 1 ? ' has' : 's have'} no results yet.
            </Note>
          )}
        </div>
      )}

      {experiment.kind === 'campaign' &&
        allSavedEvaluations.some((e) => e.missionTags?.phase != null) && (
          <MissionComparison
            catalog={catalog}
            root={experiment.root}
            evaluations={allSavedEvaluations}
            visible={savedEvaluations}
            mission={allSavedEvaluations[0]?.missionKind ?? ''}
            filters={missionFilters}
            onFilters={setMissionFilters}
            onSelect={(e) => setSelectedEvaluationKey(e.key)}
          />
        )}

      {(variantGroups.length > 0 || filtering) && (
        <Section
          title={
            experiment.kind === 'campaign'
              ? 'Model comparisons'
              : variantGroups.length === 1
                ? 'Reward variant'
                : 'Reward variants'
          }
          aside={
            selectedGroup &&
            selectedGroup.length > 1 && (
              <Segmented
                size="lg"
                options={selectedGroup.map((e) => ({
                  value: e.key,
                  label: `Training seed ${e.trainingSeed ?? 'none'}`,
                }))}
                value={selectedEvaluation?.key ?? ''}
                onChange={setSelectedEvaluationKey}
              />
            )
          }
        >
          {!variantSummaries.length && (
            <p className="text-base text-ink-2">No saved models match this filter.</p>
          )}
          {variantSummaries.length > 0 && (
            <Disclosure
              // a filter change reopens the cards, so picking a phase shows its models
              key={filtering ? JSON.stringify(missionFilters) : 'all'}
              title={`${missionFilters.phase === 'All' ? 'Browse model cards' : `Phase ${missionFilters.phase} model cards`} (${variantSummaries.length})`}
              defaultOpen={
                filtering || !allSavedEvaluations.some((e) => e.missionTags?.phase != null)
              }
            >
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
                {variantSummaries.map((row, i) => {
                  const active = selectedEvaluation?.label === row.label
                  const tags = savedEvaluations.find((e) => e.label === row.label)?.missionTags
                  return (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() => selectGroup(row.label)}
                      aria-pressed={active}
                      className={`glass p-6 sm:p-7 flex flex-col gap-6 text-left min-w-0 ${MOTION.surface} ${MOTION.enter} ${active ? 'ring-2 ring-accent bg-white/90' : 'hover:bg-white/80'}`}
                      style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'backwards' }}
                    >
                      <div className="w-full flex flex-col gap-2">
                        <span className="text-xl font-semibold tracking-tight text-ink-title">
                          {row.title}
                        </span>
                        {tags && (
                          <span className="flex items-center gap-2">
                            <PhasePill phase={tags.phase} />
                            <span className="text-sm text-ink-2">{tags.origin}</span>
                          </span>
                        )}
                        {row.reward && (
                          <span className="text-base font-medium text-ink-2">{row.reward}</span>
                        )}
                      </div>
                      {row.pending && <span className="text-base text-ink-2">{row.pending}</span>}
                      <div className="w-full grid grid-cols-3 gap-4">
                        <Figure value={row.model} label={row.metricLabel} />
                        <Figure value={row.baseline} label="Best baseline" />
                        <Figure value={row.travel} label="Model travel" />
                      </div>
                    </button>
                  )
                })}
              </div>
            </Disclosure>
          )}
        </Section>
      )}

      <div className="flex flex-col gap-6">
        <div className="max-w-full overflow-x-auto">
          <Segmented
            size="lg"
            options={[
              { value: 'results', label: 'Results' },
              ...(hasModel ? [{ value: 'learning' as const, label: 'Learning' }] : []),
              { value: 'episodes', label: 'Watch in 3D' },
              { value: 'setup', label: 'How it works' },
              {
                value: 'details',
                label: problems > 0 ? `Files & details (${problems})` : 'Files & details',
              },
            ]}
            value={tab}
            onChange={onTab}
          />
        </div>

        {evaluations.length === 0 && tab !== 'details' && (
          <div className="glass p-6 text-base text-ink-2">
            No evaluations found in this folder. Files &amp; details lists what was read.
          </div>
        )}

        <div key={tab} className={`flex flex-col gap-8 sm:gap-10 ${MOTION.enter}`}>
          {tab === 'results' && selectedEvaluation && (
            <>
              <PolicyResults evaluation={selectedEvaluation} />
              <SeedComparison evaluation={selectedEvaluation} />
              <Section title="Behaviour">
                <EvaluationInsights catalog={catalog} evaluation={selectedEvaluation} />
              </Section>
              {experiment.comparison && (
                <div className="glass px-6">
                  <Disclosure title="Compare all reward variants, with detailed statistics">
                    <ComparisonSection catalog={catalog} experiment={experiment} />
                  </Disclosure>
                </div>
              )}
            </>
          )}

          {tab === 'learning' &&
            savedEvaluations
              .filter((e) => e.key === selectedEvaluation?.key && e.trainingSeed !== null)
              .map((e) => (
                <LearningForEvaluation
                  key={e.key}
                  catalog={catalog}
                  evaluation={e}
                  trainingRoots={trainingRoots}
                  onOpenTrainingRun={onOpenTrainingRun}
                />
              ))}

          {tab === 'episodes' && (
            <>
              {selectedEvaluation && (
                <ReplayCards
                  key={selectedEvaluation.key}
                  evaluation={selectedEvaluation}
                  openingEpisode={openingEpisode}
                  onOpenEpisode={onOpenEpisode}
                />
              )}
            </>
          )}

          {tab === 'setup' && (
            <>
              {selectedEvaluation && (
                <ExperimentSetup
                  key={selectedEvaluation.key}
                  evaluation={selectedEvaluation}
                  reference={evaluations.find((e) => rewardLabel(e) === 'Dynamic Balance')}
                />
              )}
              {experiment.plan && (
                <div className="glass px-6">
                  <Disclosure title="Full experiment plan and seed roles">
                    <PlanView plan={experiment.plan} evaluations={evaluations} />
                  </Disclosure>
                </div>
              )}
            </>
          )}

          {tab === 'details' && (
            <>
              <ExperimentStatus experiment={experiment} />
              {!experiment.comparison && (
                <ComparisonSection catalog={catalog} experiment={experiment} />
              )}
              {selectedEvaluation && (
                <EvaluationDetails
                  key={selectedEvaluation.key}
                  catalog={catalog}
                  experiment={experiment}
                  evaluation={selectedEvaluation}
                />
              )}
              {evaluations.length > 1 && (
                <div className="glass px-6">
                  <Disclosure
                    title={`Show files for all ${evaluations.length} model-and-seed evaluations`}
                  >
                    <div className="flex flex-col gap-4 pb-4">
                      {evaluations
                        .filter((e) => e.key !== selectedEvaluation?.key)
                        .map((e) => (
                          <EvaluationDetails
                            key={e.key}
                            catalog={catalog}
                            experiment={experiment}
                            evaluation={e}
                          />
                        ))}
                    </div>
                  </Disclosure>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
