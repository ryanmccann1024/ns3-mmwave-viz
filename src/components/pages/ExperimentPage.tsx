import { useMemo, useState } from 'react'
import type { ResultCatalog } from '../../lib/resultCatalog'
import type {
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
import { ExperimentStatus, Note, StateBadge } from '../ExperimentStatus'
import { Tag } from './shared'
import { experimentLabel, policyLabel, rewardLabel } from '../../lib/rlLabels'
import { ReplayPicker } from '../rl/ReplayPicker'

interface Props {
  catalog: ResultCatalog
  experiment: Experiment
  /** message from the last episode that could not be opened */
  openError: string | null
  openingEpisode: Episode | null
  onOpenEpisode: (episode: Episode) => void
  onHome: () => void
  onExperiments: () => void
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
    ? `${rewardLabel(e)} · baselines only`
    : `${rewardLabel(e)} · training seed ${e.trainingSeed}`

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

const mean = (values: (number | null | undefined)[]) => {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
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

function Leaderboard({ evaluation }: { evaluation: Evaluation }) {
  const [tableOpen, setTableOpen] = useState(false)
  const metricKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const e of evaluation.episodes) for (const k of Object.keys(e.metrics ?? {})) keys.add(k)
    return [...keys].slice(0, MAX_METRIC_COLUMNS)
  }, [evaluation])
  const rows = useMemo(
    () =>
      policyRows(evaluation, metricKeys).sort((a, b) => {
        const order = ['model', 'hold', 'random_valid']
        const rank = (policy: string) =>
          order.includes(policy) ? order.indexOf(policy) : order.length
        return rank(a.policy) - rank(b.policy)
      }),
    [evaluation, metricKeys]
  )
  const returns = rows.map((r) => r.returnMean).filter((v): v is number => v !== null)
  const best = returns.length ? Math.max(...returns) : null

  return (
    <Panel
      title={evalTitle(evaluation)}
      actions={<StateBadge state={evaluation.state} />}
      bodyClassName="px-5 pb-5"
    >
      {rows.length === 0 ? (
        <div className="text-sm text-muted">No episodes are indexed for this evaluation.</div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {rows.map((row) => (
              <div key={row.policy} className="tile px-4 py-4">
                <div className="flex items-center gap-2 text-base font-semibold text-ink">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: trailColor(row.policy) }}
                  />
                  {policyLabel(row.policy)}
                </div>
                <div className="text-xl font-semibold tabular-nums text-ink mt-2">
                  {row.metricMeans.delivery_ratio === null ||
                  row.metricMeans.delivery_ratio === undefined
                    ? 'n/a'
                    : `${(row.metricMeans.delivery_ratio * 100).toFixed(1)}%`}
                </div>
                <div className="text-sm text-muted">Mean traffic delivered</div>
                <div className="text-sm text-ink-2 mt-3">
                  Return {fmt(row.returnMean)} · {row.completed}/{row.total} episodes
                </div>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setTableOpen((open) => !open)}>
            {tableOpen ? 'Hide full metrics table' : 'Show full metrics table'}
          </Button>
          {tableOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="font-medium py-2 pr-4 text-left">Policy</th>
                    <th className="font-medium py-2 pr-4 text-right">Mean return</th>
                    <th className="font-medium py-2 pr-6 text-right">Gap to best</th>
                    {metricKeys.map((k) => (
                      <th key={k} className="font-medium py-2 pr-4 text-right whitespace-nowrap">
                        {humanize(k)}
                      </th>
                    ))}
                    <th className="font-medium py-2 text-right">Episodes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isBest = best !== null && r.returnMean === best && rows.length > 1
                    return (
                      <tr key={r.policy} className="border-t border-ink/[0.06]">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: trailColor(r.policy) }}
                            />
                            <span className="font-medium text-ink">{r.policy}</span>
                            {isBest && <Tag tone="good">Best</Tag>}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums font-semibold text-ink">
                          {fmt(r.returnMean)}
                        </td>
                        <td className="py-2.5 pr-6 text-right font-mono tabular-nums text-muted">
                          {best === null || r.returnMean === null
                            ? 'n/a'
                            : r.returnMean === best
                              ? '0'
                              : `-${fmt(best - r.returnMean)}`}
                        </td>
                        {metricKeys.map((k) => (
                          <td
                            key={k}
                            className="py-2.5 pr-4 text-right font-mono tabular-nums text-ink-2"
                          >
                            {fmt(r.metricMeans[k])}
                          </td>
                        ))}
                        <td className="py-2.5 text-right font-mono tabular-nums text-muted">
                          {r.completed}/{r.total}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink/[0.06]">
          <PerSeedChart evaluation={evaluation} metricKeys={metricKeys} label={humanize} />
        </div>
      )}
      <div className="text-sm text-muted mt-4">
        Each point pairs policies on the same evaluation seed. This is not a training-time curve.
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Episodes: policy × seed grid, one number per cell
// ---------------------------------------------------------------------------

function EpisodeCell({
  episode,
  busy,
  onOpen,
}: {
  episode: Episode
  busy: boolean
  onOpen: (episode: Episode) => void
}) {
  const completed = episode.status === 'completed'
  const metrics = Object.entries(episode.metrics ?? {})
    .map(([k, v]) => `${k} ${formatNumber(v)}`)
    .join('\n')
  return (
    <button
      onClick={() => onOpen(episode)}
      disabled={!episode.playable || busy}
      title={
        episode.message ??
        `${episode.name}\nreturn ${formatNumber(episode.return)}${metrics ? `\n${metrics}` : ''}${
          episode.hasTelemetry ? '\nhas decision telemetry' : ''
        }`
      }
      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
        episode.playable
          ? 'bg-white/70 border-white/80 shadow-control hover:border-accent/50 hover:bg-white'
          : 'border-dashed border-hairline-strong bg-transparent cursor-not-allowed'
      } ${busy ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${completed ? 'bg-emerald-500' : 'bg-rose-500'}`}
        />
        <span className="font-mono tabular-nums text-sm font-semibold text-ink">
          {fmt(episode.return)}
        </span>
      </div>
      <div className="text-[11px] text-muted mt-0.5">
        {busy ? 'Opening…' : episode.playable ? 'Play' : 'No playback files'}
      </div>
    </button>
  )
}

function EpisodeGrid({
  evaluation,
  openingEpisode,
  onOpenEpisode,
}: {
  evaluation: Evaluation
  openingEpisode: Episode | null
  onOpenEpisode: (episode: Episode) => void
}) {
  const seeds = [...new Set(evaluation.episodes.map((e) => e.seed))].sort((a, b) => a - b)
  return (
    <Panel
      title={evalTitle(evaluation)}
      meta={`${formatNumber(evaluation.episodesCompleted)}/${formatNumber(evaluation.episodesExpected)}`}
      bodyClassName="px-5 pb-5"
    >
      {evaluation.episodes.length === 0 ? (
        <div className="text-sm text-muted">No episodes are indexed for this evaluation.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1.5 -mx-1.5">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="font-medium pr-2" />
                {seeds.map((s) => (
                  <th key={s} className="font-medium px-1">
                    Evaluation seed {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evaluation.policies.map((policy) => (
                <tr key={policy}>
                  <td className="pr-3 align-middle">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink whitespace-nowrap">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: trailColor(policy) }}
                      />
                      {policyLabel(policy)}
                    </div>
                  </td>
                  {seeds.map((seed) => {
                    const found = evaluation.episodes.filter(
                      (e) => e.policy === policy && e.seed === seed
                    )
                    return (
                      <td key={seed} className="align-top min-w-[7.5rem]">
                        <div className="flex flex-col gap-1">
                          {found.map((e) => (
                            <EpisodeCell
                              key={e.dir}
                              episode={e}
                              busy={openingEpisode === e}
                              onOpen={onOpenEpisode}
                            />
                          ))}
                          {found.length === 0 && (
                            <span className="text-xs text-faint px-3">None</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-sm text-muted mt-3">
        Each cell is one saved replay. The number is episode return under this row’s reward; click
        to play it.
      </div>
    </Panel>
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
          <span className="text-muted">Training seeds</span>{' '}
          {plan.seeds.training.join(', ') || 'none'}
        </span>
        <span>
          <span className="text-muted">Model-selection seed</span>{' '}
          {plan.seeds.model_selection ?? 'none'}
        </span>
        <span>
          <span className="text-muted">Held-out seeds</span>{' '}
          {plan.seeds.held_out.join(', ') || 'none'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left text-muted">
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
      <div className="text-sm text-muted mt-4 leading-relaxed">
        Training seeds generate PPO rollouts; the model-selection seed picks a saved checkpoint;
        evaluation seeds test that frozen checkpoint. A seed is a simulator random-number setting,
        not an episode number. “Ablation” means changing one input at a time, not a physical scene.
      </div>
    </Panel>
  )
}

function KeyValues({ entries }: { entries: [string, string][] }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <span className="text-muted">{k}</span>
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
      <div className="text-[11px] text-muted">
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

  return (
    <Panel title={evalTitle(evaluation)} actions={<StateBadge state={evaluation.state} />}>
      <div className="flex flex-col gap-2">
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
              <div className="text-xs text-muted">Reading…</div>
            )}
          </Disclosure>
        </div>
      </div>
    </Panel>
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted">
          Model trained in <span className="font-mono text-ink-2">{root}</span>
        </div>
        <Button variant="secondary" onClick={() => onOpenTrainingRun(root)}>
          Open training run
        </Button>
      </div>
      {(!loaded || loaded.state === 'loading') && (
        <div className="text-sm text-muted">Reading training run…</div>
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
  tab,
  onTab,
  trainingRoots,
  onOpenTrainingRun,
}: Props) {
  const { name, date } = folderLabel(experiment.root)
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
    <div className="flex flex-col gap-4">
      <PageHeader
        parents={[
          { label: 'Home', onClick: onHome },
          { label: 'RL experiments', onClick: onExperiments },
        ]}
        title={experimentLabel(experiment.plan?.name || name || experiment.name)}
        subtitle={[
          date,
          `${savedEvaluations.length} of ${evaluations.length} model-and-seed evaluations saved`,
          `${variantGroups.length} reward variants`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <Button variant="primary" onClick={() => onTab('episodes')}>
            Choose a 3D replay
          </Button>
        }
      />

      {catalog.truncated && (
        <Note tone="warn">
          The folder listing was cut off at its entry limit, so some files may appear missing. Open
          the experiment folder itself instead of a large parent folder.
        </Note>
      )}
      {openError && <Note tone="error">{openError}</Note>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          const delivery = (policy: string) => {
            const value = result(policy, 'delivery_ratio')
            return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`
          }
          const travel = (policy: string) => {
            const value = result(policy, 'travel_m_total')
            return value === null ? 'n/a' : `${Math.round(value).toLocaleString()} m`
          }
          const active = selectedEvaluation?.label === evaluation.label
          return (
            <button
              key={evaluation.label}
              onClick={() => {
                const sameSeed = group.find(
                  (entry) => entry.trainingSeed === selectedEvaluation?.trainingSeed
                )
                setSelectedEvaluationKey((sameSeed ?? evaluation).key)
              }}
              aria-pressed={active}
              className={`glass p-5 text-left transition-colors ${active ? 'ring-2 ring-accent/50 bg-white/85' : 'hover:bg-white/80'}`}
            >
              <div className="text-sm font-medium text-accent-ink">Reward variant</div>
              <div className="text-lg font-semibold text-ink-title mt-1">
                {rewardLabel(evaluation)}
              </div>
              <div className="text-sm text-muted mt-1">
                {evaluation.label} · {group.length} trained model{group.length === 1 ? '' : 's'}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <div className="text-xl font-semibold text-ink">{delivery('model')}</div>
                  <div className="text-sm text-muted">Mean model delivery</div>
                </div>
                <div>
                  <div className="text-xl font-semibold text-ink">{delivery('hold')}</div>
                  <div className="text-sm text-muted">Mean hold delivery</div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-ink/[0.08] text-sm text-ink-2">
                Mean model travel <strong className="text-ink">{travel('model')}</strong> · Hold{' '}
                <strong className="text-ink">{travel('hold')}</strong>
              </div>
            </button>
          )
        })}
      </div>

      {selectedGroup && selectedGroup.length > 1 && (
        <div className="glass p-4 flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-ink-2 flex items-center gap-3">
            Inspect trained model
            <select
              className="rounded-xl border border-hairline bg-white/85 px-3 py-2 text-base text-ink"
              value={selectedEvaluation?.key ?? ''}
              onChange={(event) => setSelectedEvaluationKey(event.target.value)}
            >
              {selectedGroup.map((evaluation) => (
                <option key={evaluation.key} value={evaluation.key}>
                  Training seed {evaluation.trainingSeed ?? 'none'}
                </option>
              ))}
            </select>
          </label>
          <span className="text-sm text-muted">
            Cards average the saved models; the tabs below inspect the selected model.
          </span>
        </div>
      )}

      <div>
        <Segmented
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
        <div className="glass p-6 text-sm text-muted text-center">
          No evaluations found in this folder. The Details tab lists what was read.
        </div>
      )}

      {tab === 'results' && (
        <>
          {selectedEvaluation && (
            <Note>
              Showing <strong>{rewardLabel(selectedEvaluation)}</strong> from training seed{' '}
              <strong>{selectedEvaluation.trainingSeed ?? 'none'}</strong>. Select another reward
              card{selectedGroup && selectedGroup.length > 1 ? ' or training seed' : ''} above to
              switch results. Delivery is the physical outcome; returns from different rewards have
              different scales.
            </Note>
          )}
          {pendingEvaluations > 0 && (
            <Note tone="warn">
              {pendingEvaluations} planned evaluation{pendingEvaluations === 1 ? ' has' : 's have'}{' '}
              no saved result yet. This plan is incomplete, not a failed comparison. Only saved
              results appear below.
            </Note>
          )}
          {selectedEvaluation && (
            <div className="flex flex-col gap-4">
              <Leaderboard evaluation={selectedEvaluation} />
              <EvaluationInsights catalog={catalog} evaluation={selectedEvaluation} />
            </div>
          )}
          {experiment.comparison && (
            <div className="glass px-5">
              <Disclosure title="Compare all reward variants and see detailed statistics">
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
          <ReplayPicker
            key={selectedEvaluation?.key}
            evaluations={savedEvaluations}
            preferredEvaluationKey={selectedEvaluation?.key}
            current={null}
            onOpen={onOpenEpisode}
            opening={openingEpisode}
          />
          <div className="glass px-5">
            <Disclosure title="Browse every saved episode">
              <div className="flex flex-col gap-4 pb-4">
                {savedEvaluations.map((e) => (
                  <EpisodeGrid
                    key={e.key}
                    evaluation={e}
                    openingEpisode={openingEpisode}
                    onOpenEpisode={onOpenEpisode}
                  />
                ))}
              </div>
            </Disclosure>
          </div>
        </>
      )}

      {tab === 'setup' && (
        <>
          {selectedEvaluation && (
            <ExperimentSetup key={selectedEvaluation.key} evaluation={selectedEvaluation} />
          )}
          {experiment.plan && (
            <div className="glass px-5">
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
            <div className="glass px-5">
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
  )
}
