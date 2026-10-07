import { useMemo, useState, type ReactNode } from 'react'
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
import { PageHeader } from '../ui/PageHeader'
import type { Crumb } from '../ui/Breadcrumbs'
import { Panel } from '../ui/Panel'
import { Segmented } from '../ui/Segmented'
import { Disclosure } from '../ui/Disclosure'
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
  objectiveLabel,
  policyLabel,
  rewardLabel,
} from '../../lib/rlLabels'
import { MOTION } from '../../styles/motion'
import { Skeleton } from '../ui/Skeleton'
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
}

export type ExperimentTab = 'results' | 'learning' | 'episodes' | 'setup' | 'details'

const MAX_METRIC_COLUMNS = 4

const evalTitle = (e: Evaluation) =>
  e.trainingSeed === null
    ? `${variantTitle(e.label)} · baselines only`
    : `${variantTitle(e.label)} · training seed ${e.trainingSeed}`

const ACRONYMS = new Set(['los', 'nlos', 'sinr', 'snr', 'mcs', 'rx', 'tx', 'uav', 'bs'])

/** delivery_ratio -> Delivery ratio, los_fraction -> LOS fraction */
const humanize = (key: string) =>
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
    return [...keys].slice(0, MAX_METRIC_COLUMNS)
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

  return (
    <Section
      title={`Policies · ${variantTitle(evaluation.label)}`}
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
                <Figure value={pct1(row.metricMeans.delivery_ratio)} label="Delivered" />
                <Figure value={fmt(row.returnMean)} label="Return" />
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
        <PerSeedChart evaluation={evaluation} metricKeys={metricKeys} label={humanize} />
      </div>
    </Section>
  )
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
    <Section title={`Replays · ${variantTitle(evaluation.label)}`}>
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
                  <div className="flex rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-x divide-hairline">
                    {episodes.map((e) => {
                      const busy = openingEpisode === e
                      return (
                        <button
                          key={e.dir}
                          type="button"
                          onClick={() => onOpenEpisode(e)}
                          disabled={!e.playable || openingEpisode !== null}
                          title={
                            e.playable ? `Play seed ${e.seed}` : (e.message ?? 'No playback files')
                          }
                          aria-label={`Play ${policyLabel(policy)} on evaluation seed ${e.seed}`}
                          className={`flex-1 h-11 px-3 text-base font-medium tabular-nums ${MOTION.colors} ${
                            busy
                              ? 'bg-accent-wash text-accent-ink'
                              : e.playable
                                ? 'text-ink hover:bg-accent-wash hover:text-accent-ink'
                                : 'text-ink-2/50 cursor-not-allowed'
                          }`}
                        >
                          {busy ? 'Opening' : e.seed}
                        </button>
                      )
                    })}
                  </div>
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
    ['Model used by this evaluation', summary.modelUsedByEval ?? 'not recorded'],
    ['Best mean evaluation reward during training', formatNumber(summary.bestMeanReward)],
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
    ['Model', evaluation.modelSelection ?? 'not recorded'],
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
              <TrainingSummaryView summary={training} />
            ) : (
              <div role="status" aria-busy="true" aria-label="Reading training summary">
                <span className="sr-only">Reading training summary…</span>
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
        <div role="status" aria-busy="true" aria-label="Reading training run">
          <span className="sr-only">Reading training run…</span>
          <Skeleton lines={3} />
        </div>
      )}
      {loaded?.state === 'error' && <Note tone="error">{loaded.message}</Note>}
      {loaded?.state === 'ready' && <TrainingInsights run={loaded.value} />}
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
}: Props) {
  const { name } = folderLabel(experiment.root)
  const evaluations = experiment.evaluations
  const problems =
    experiment.issues.length +
    evaluations.filter((e) => e.state !== 'ok' && e.state !== 'missing').length
  const savedEvaluations = evaluations.filter((e) => e.state !== 'missing')
  const pendingEvaluations = evaluations.length - savedEvaluations.length
  const [selectedEvaluationKey, setSelectedEvaluationKey] = useState('')
  const selectedEvaluation =
    savedEvaluations.find((e) => e.key === selectedEvaluationKey) ?? savedEvaluations[0]
  const variantGroups = [...new Set(savedEvaluations.map((evaluation) => evaluation.label))].map(
    (label) => savedEvaluations.filter((evaluation) => evaluation.label === label)
  )
  const selectedGroup = variantGroups.find((group) => group[0].label === selectedEvaluation?.label)
  const hasModel = evaluations.some((e) => e.trainingSeed !== null)

  return (
    <div className="flex flex-col gap-8 sm:gap-10 py-4 sm:py-8">
      <PageHeader
        parents={[
          { label: 'Home', onClick: onHome },
          { label: 'RL experiments', onClick: onExperiments },
          ...groupCrumbs,
        ]}
        title={experimentLabel(name || experiment.plan?.name || experiment.name)}
        actions={
          <Button variant="secondary" onClick={() => onTab('episodes')}>
            Watch in 3D
          </Button>
        }
      />

      {(catalog.truncated || openError || pendingEvaluations > 0) && (
        <div className="flex flex-col gap-3 -mt-2">
          {catalog.truncated && (
            <Note tone="warn">
              The folder listing was cut off at its entry limit, so some files may appear missing.
              Open the experiment folder itself instead of a large parent folder.
            </Note>
          )}
          {openError && <Note tone="error">{openError}</Note>}
          {pendingEvaluations > 0 && (
            <Note tone="warn">
              {pendingEvaluations} planned evaluation
              {pendingEvaluations === 1 ? ' has' : 's have'} no saved result yet, so this plan is
              incomplete. Only saved results are shown.
            </Note>
          )}
        </div>
      )}

      {variantGroups.length > 0 && (
        <Section
          title={variantGroups.length === 1 ? 'Reward variant' : 'Reward variants'}
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
            {variantGroups.map((group) => {
              const evaluation = group[0]
              const result = (policy: string, metric: string) =>
                mean(
                  group.map(
                    (entry) =>
                      policyRows(entry, [metric]).find((row) => row.policy === policy)?.metricMeans[
                        metric
                      ]
                  )
                )
              const baselines = evaluation.policies
                .filter((policy) => policy !== 'model')
                .map((policy) => result(policy, 'delivery_ratio'))
                .filter((v): v is number => v !== null)
              const travel = result('model', 'travel_m_total')
              const active = selectedEvaluation?.label === evaluation.label
              return (
                <button
                  key={evaluation.label}
                  type="button"
                  onClick={() => {
                    const sameSeed = group.find(
                      (entry) => entry.trainingSeed === selectedEvaluation?.trainingSeed
                    )
                    setSelectedEvaluationKey((sameSeed ?? evaluation).key)
                  }}
                  aria-pressed={active}
                  className={`glass p-6 sm:p-7 flex flex-col gap-6 text-left min-w-0 ${MOTION.surface} ${active ? 'ring-2 ring-accent bg-white/90' : 'hover:bg-white/80'}`}
                >
                  <div className="w-full flex items-center justify-between gap-4">
                    <span className="text-xl font-semibold tracking-tight text-ink-title truncate">
                      {variantTitle(evaluation.label)}
                    </span>
                    <span className="flex-shrink-0 text-base font-medium text-ink-2">
                      {rewardLabel(evaluation)}
                    </span>
                  </div>
                  <div className="w-full grid grid-cols-3 gap-4">
                    <Figure value={pct0(result('model', 'delivery_ratio'))} label="Model" />
                    <Figure
                      value={pct0(baselines.length ? Math.max(...baselines) : null)}
                      label="Best baseline"
                    />
                    <Figure
                      value={travel === null ? '–' : `${Math.round(travel).toLocaleString()} m`}
                      label="Model travel"
                    />
                  </div>
                </button>
              )
            })}
          </div>
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
                <ExperimentSetup key={selectedEvaluation.key} evaluation={selectedEvaluation} />
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
