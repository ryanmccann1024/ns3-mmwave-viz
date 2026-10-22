import type { Episode, Evaluation, Experiment } from './experimentIndex.ts'
import type { ResultCatalog } from './resultCatalog.ts'
import { readJson } from './resultCatalog.ts'
import { identityHashes, identityOf } from './experimentIndex.ts'
import { staticRewardLabel } from './rlLabels.ts'
import { missionMetadata, shortRewardTitle } from './missionComparison.ts'

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {}
const join = (root: string, tail: string) => (root ? `${root}/${tail}` : tail)
const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
const segment = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)

export interface MissionLayout {
  campaign: string
  root: string
  scene: string
}

/** Main is a review index; model, validation and replay artifacts keep their original paths. */
export function missionScenarios(paths: string[]): MissionLayout[] {
  const layouts = new Map<string, MissionLayout>()
  for (const path of paths) {
    const match = path.match(/^(?:(.*)\/)?main\/([^/]+)\/mission_scenario\.json$/)
    if (!match) continue
    const campaign = match[1] ?? ''
    const scene = match[2]
    if (!segment(scene)) continue
    layouts.set(join(campaign, `main/${scene}`), {
      campaign,
      scene,
      root: join(campaign, `main/${scene}`),
    })
  }
  for (const marker of paths.filter(
    (p) => p === 'final_models.json' || p.endsWith('/final_models.json')
  )) {
    const campaign = parent(marker)
    const prefix = join(campaign, 'operations/')
    for (const path of paths) {
      if (!path.startsWith(prefix) || !path.endsWith('/online_manifest.json')) continue
      const parts = path.slice(prefix.length).split('/')
      if (parts.length !== 4 || !segment(parts[0])) continue
      const scene = parts[0]
      const root = join(campaign, `main/${scene}`)
      layouts.set(root, { campaign, root, scene })
    }
  }
  return [...layouts.values()].sort((a, b) => a.root.localeCompare(b.root))
}

export function isMissionInternal(path: string, layouts: MissionLayout[]): boolean {
  return layouts.some(({ campaign }) =>
    ['models', 'validation', 'adaptation-validation', 'operations', 'baselines', 'preflight'].some(
      (dir) => path === join(campaign, dir) || path.startsWith(join(campaign, `${dir}/`))
    )
  )
}

type Loader = (catalog: ResultCatalog, root: string) => Promise<Experiment>
type Builder = (
  catalog: ResultCatalog,
  evaluation: Evaluation,
  policy: string,
  entry: Rec,
  buildings: Map<string, string[]>,
  fetched: boolean,
  episodeDir?: string
) => Episode

function relabel(evaluation: Evaluation, label: string): Evaluation {
  const key = `${label}#${evaluation.trainingSeed ?? 'baseline'}`
  return {
    ...evaluation,
    key,
    label,
    episodes: evaluation.episodes.map((episode) => ({
      ...episode,
      evaluationKey: key,
      label,
    })),
  }
}

export async function loadMissionScenario(
  catalog: ResultCatalog,
  layout: MissionLayout,
  load: Loader,
  build: Builder,
  createEvaluation: (label: string, seed: number | null, dir: string) => Evaluation
): Promise<Experiment> {
  const buildingsByDir = new Map<string, string[]>()
  for (const path of catalog.paths()) {
    if (!/\/inputs\/buildings[^/]*\.json$/.test(path)) continue
    const directory = parent(path)
    buildingsByDir.set(directory, [...(buildingsByDir.get(directory) ?? []), path])
  }
  const marker = join(layout.root, 'mission_scenario.json')
  const saved = rec(await readJson(catalog, marker))
  const index = catalog.has(marker)
    ? saved.models
    : await readJson(catalog, join(layout.campaign, 'final_models.json'))
  if (catalog.has(marker) && ![1, 2, 3].includes(Number(saved.mission_scenario_version)))
    throw new Error('Unsupported mission scenario index')
  const rows = (Array.isArray(index) ? index : [])
    .map(rec)
    .filter((row) => row.scene === layout.scene)
  const experiment: Experiment = {
    root: layout.root,
    name: layout.scene,
    kind: 'campaign',
    plan: null,
    comparison: null,
    comparisonPath: null,
    fetch: null,
    evaluations: [],
    issues: [],
    artifacts: [
      {
        artifact: 'campaign',
        path: catalog.has(marker) ? marker : join(layout.campaign, 'final_models.json'),
        present: true,
        usable: true,
        message: null,
      },
    ],
  }
  const baselineDir =
    typeof saved.baseline_dir === 'string' && /^baselines\/[a-z0-9-]+$/.test(saved.baseline_dir)
      ? join(layout.campaign, saved.baseline_dir)
      : null
  const baselineData = baselineDir
    ? rec(await readJson(catalog, join(baselineDir, 'eval_manifest.json')))
    : {}
  const baselinePolicies = rec(baselineData.policies)
  const audit = rec(
    await readJson(catalog, join(layout.campaign, `preflight/${layout.scene}/reward_audit.json`))
  )
  const campaignRecord = rec(await readJson(catalog, join(layout.campaign, 'campaign_status.json')))
  experiment.campaignProgress = {
    status: typeof campaignRecord.status === 'string' ? campaignRecord.status : 'planned',
    trained: 0,
    expected: rows.length,
  }
  if (!rows.length) experiment.issues.push('No final models are recorded for this scenario.')
  for (const row of rows) {
    if (![row.reward, row.profile, row.comparison].every(segment)) {
      experiment.issues.push('Invalid mission model identity.')
      continue
    }
    const trainingSeed =
      typeof row.training_seed === 'number' && Number.isInteger(row.training_seed)
        ? row.training_seed
        : 101
    const reward =
      typeof row.reward_label === 'string'
        ? row.reward_label
        : row.reward === 'dynamic-balance'
          ? 'Dynamic Balance'
          : row.reward === 'coverage'
            ? 'Coverage Priority'
            : row.reward === 'investigation'
              ? 'Team Investigation'
              : 'Recovery Priority'
    const profile = String(row.profile)
    const ppo =
      typeof row.ppo_label === 'string'
        ? row.ppo_label
        : row.comparison === 'standard'
          ? 'Standard PPO'
          : row.comparison === 'candidate'
            ? 'Exploration PPO (entropy 0.01)'
            : `Tuned PPO (${profile})`
    const fixed = join(
      layout.campaign,
      `models/${layout.scene}/${profile}/eval/${row.reward}/train-seed-${trainingSeed}`
    )
    const fixedManifest = join(fixed, 'eval_manifest.json')
    const sourceCatalog: ResultCatalog = {
      ...catalog,
      paths: () => [
        ...new Set([...catalog.paths(), ...(catalog.has(fixedManifest) ? [fixedManifest] : [])]),
      ],
    }
    const source = await load(sourceCatalog, fixed)
    experiment.issues.push(...source.issues)
    experiment.artifacts.push(...source.artifacts)
    const train = rec(
      await readJson(
        catalog,
        join(
          layout.campaign,
          `models/${layout.scene}/${profile}/train/${row.reward}/train-seed-${trainingSeed}/train_manifest.json`
        )
      )
    )
    const settings = rec(train.hyperparameters)
    const trainDir = join(
      layout.campaign,
      `models/${layout.scene}/${profile}/train/${row.reward}/train-seed-${trainingSeed}`
    )
    if (train.status === 'completed') experiment.campaignProgress!.trained++
    const validationSeeds = (
      Array.isArray(rec(train.evaluation).seeds)
        ? rec(train.evaluation).seeds
        : Array.isArray(saved.validation_seeds)
          ? saved.validation_seeds
          : []
    ) as number[]
    if (!source.evaluations.length) {
      const pending = createEvaluation(
        String(row.reward),
        typeof train.seed === 'number' ? train.seed : trainingSeed,
        fixed
      )
      pending.declared = true
      pending.state = 'incomplete'
      pending.message =
        train.status === 'completed'
          ? 'Training completed; model evaluation has not been saved yet.'
          : 'Model training or evaluation is pending.'
      pending.trainingRunDir = trainDir
      pending.contract =
        (train.contract as Evaluation['contract']) ??
        (baselineData.contract as Evaluation['contract']) ??
        null
      pending.rewardSchema = train.reward_schema
      pending.observationSchema = train.observation_schema
      pending.selection = train.selection
      // Not evaluated yet, so which saved model it will use is not recorded; only a run
      // without a best checkpoint is known to have just its final model
      pending.modelSelection = typeof train.best_model_path === 'string' ? null : 'final'
      pending.modelSha256 =
        pending.modelSelection === 'final' && typeof train.model_sha256 === 'string'
          ? train.model_sha256
          : null
      pending.heldOut = false
      pending.policies = ['model']
      pending.episodesExpected = validationSeeds.length || 2
      pending.episodesCompleted = 0
      source.evaluations.push(pending)
    }
    for (const original of source.evaluations) {
      original.missionVariantKey = profile === 'reference-ppo' ? String(row.reward) : profile
      original.missionTags = missionMetadata(layout.campaign, row, train)
      original.missionTags.terms = original.missionTags.terms.length
        ? original.missionTags.terms
        : missionMetadata(layout.campaign, row, {
            ...train,
            reward_schema: original.rewardSchema,
          }).terms
      original.missionRewardTitle =
        original.missionTags.phase == null
          ? undefined
          : shortRewardTitle(original.rewardSchema, reward)
      original.missionPpoLabel = ppo
        .replace(/^Saved Phase \d+: /, '')
        .replace(/ · saved Phase \d+ control/, '')
      const rewardName = staticRewardLabel(original.rewardSchema) ?? reward
      const base = `${rewardName} · ${ppo}${row.stage === 'screen' ? ' · Screening' : row.stage === 'confirmation' ? ' · Confirmation' : ''}`
      original.missionKind = typeof saved.objective === 'string' ? saved.objective : undefined
      original.stage = typeof row.stage === 'string' ? row.stage : undefined
      const modelSeeds = new Set([
        ...validationSeeds,
        ...original.episodes.filter((e) => e.policy === 'model').map((e) => e.seed),
      ])
      if (baselineDir) {
        for (const [policy, value] of Object.entries(baselinePolicies)) {
          const block = rec(value)
          original.policySummaries[policy] = block.summary
          if (!original.policies.includes(policy)) original.policies.push(policy)
          for (const entry of (Array.isArray(block.episodes) ? block.episodes : []).map(rec)) {
            const name =
              typeof entry.episode_dir === 'string' ? entry.episode_dir.split(/[\\/]/).pop() : null
            if (!name || !/^episode-\d+$/.test(name) || !modelSeeds.has(Number(entry.seed)))
              continue
            if (Array.isArray(baselineData.seeds) && !baselineData.seeds.includes(entry.seed))
              continue
            const schemaHash = rec(original.rewardSchema).sha256
            const rescored =
              audit.reward_audit_version === 1
                ? Object.values(rec(audit.results))
                    .flatMap((value) => {
                      const episodes = rec(rec(value)[policy]).episodes
                      return (Array.isArray(episodes) ? episodes : []).map(rec)
                    })
                    .find(
                      (value) =>
                        value.seed === entry.seed &&
                        typeof schemaHash === 'string' &&
                        value.reward_schema_sha256 === schemaHash
                    )
                : undefined
            const baselineEpisode = build(
              catalog,
              original,
              policy,
              rescored
                ? {
                    ...entry,
                    return: rescored.return,
                    reward_components_sum: rescored.reward_components_sum,
                  }
                : row.reward === 'dynamic-balance'
                  ? entry
                  : { ...entry, return: null },
              buildingsByDir,
              false,
              join(baselineDir, `${policy}/${name}`)
            )
            baselineEpisode.rewardRescored = Boolean(rescored)
            // Shared baselines are checked against their own manifest's scenario identity
            baselineEpisode.files.inputHashes = identityHashes(
              identityOf(baselineData.scenario_identity)
            )
            original.episodes.push(baselineEpisode)
          }
        }
        original.episodesExpected =
          (modelSeeds.size || 2) + original.episodes.filter((e) => e.policy !== 'model').length
        original.episodesCompleted = original.episodes.filter(
          (e) => e.status === 'completed'
        ).length
      }
      const model =
        original.modelSelection === 'best'
          ? 'best checkpoint'
          : original.modelSelection === 'final'
            ? 'final model'
            : 'saved model'
      const deterministic = relabel(
        original,
        `${base} · ${typeof row.execution_label === 'string' ? row.execution_label : 'Frozen deterministic'}`
      )
      deterministic.provenance = {
        kind: 'new',
        profile,
        settings,
        description:
          typeof row.execution_description === 'string'
            ? row.execution_description
            : row.seed_role === 'validation diagnostics'
              ? `Frozen ${model}, deterministic actions, on pilot validation seeds; preliminary diagnostic results.`
              : `Frozen ${model} with deterministic actions on evaluation seeds.`,
      }
      experiment.evaluations.push(deterministic)
      const modes = (['fixed_sampled', 'online'] as const).filter(
        (mode) => !Array.isArray(row.operation_modes) || row.operation_modes.includes(mode)
      )
      if (!modes.length) continue
      const onlinePath = join(
        layout.campaign,
        `operations/${layout.scene}/${row.reward}/${row.comparison}/online_manifest.json`
      )
      if (!catalog.has(onlinePath)) {
        for (const mode of modes) {
          const pending = relabel(
            original,
            `${base} · ${mode === 'online' ? 'Online learning' : 'Frozen sampled'}`
          )
          pending.evalDir = parent(onlinePath)
          pending.state = 'incomplete'
          pending.message = 'Training saved; this operation comparison is pending.'
          pending.heldOut = false
          pending.heldOutSeeds = []
          pending.episodes = pending.episodes.filter((e) => e.policy !== 'model')
          pending.episodesExpected = (modelSeeds.size || 2) + pending.episodes.length
          pending.episodesCompleted = pending.episodes.filter(
            (e) => e.status === 'completed'
          ).length
          pending.provenance = {
            kind: mode === 'online' ? 'online' : 'fixed',
            profile,
            settings,
            description: `Planned comparison using the ${model}.`,
          }
          experiment.evaluations.push(pending)
        }
        continue
      }
      try {
        const data = rec(await readJson(catalog, onlinePath))
        if (![2, 3, 4].includes(Number(data.online_experiment_version)))
          throw new Error('Unsupported online experiment version')
        const recordedModes = Array.isArray(data.modes) ? data.modes : []
        if (
          data.online_experiment_version === 4 &&
          modes.some((mode) => !recordedModes.includes(mode))
        )
          throw new Error('Operation modes do not match the scenario index')
        const seeds = (Array.isArray(data.seeds) ? data.seeds : []).filter(
          (seed): seed is number => typeof seed === 'number' && Number.isInteger(seed)
        )
        const entries = (Array.isArray(data.episodes) ? data.episodes : []).map(rec)
        for (const mode of modes) {
          const evaluation = relabel(
            original,
            `${base} · ${mode === 'online' ? 'Online learning' : 'Frozen sampled'}`
          )
          evaluation.evalDir = parent(onlinePath)
          evaluation.provenance = {
            kind: mode === 'online' ? 'online' : 'fixed',
            profile,
            settings: mode === 'online' ? rec(data.settings) : settings,
            description:
              mode === 'online'
                ? `Weights update during the episode; each seed starts from a fresh copy of the ${model}.`
                : `Sampled actions from the same ${model}, with frozen weights; not online learning.`,
          }
          evaluation.heldOut = mode === 'fixed_sampled' && original.heldOut === true
          evaluation.heldOutSeeds = evaluation.heldOut ? seeds : []
          evaluation.policySummaries = {
            ...original.policySummaries,
            model: null,
          }
          evaluation.episodes = evaluation.episodes.filter((episode) => episode.policy !== 'model')
          const seen = new Set<number>()
          for (const entry of entries.filter((entry) => entry.mode === mode)) {
            const seed = entry.seed
            const name =
              typeof entry.episode_dir === 'string' ? entry.episode_dir.split(/[\\/]/).pop() : null
            if (
              typeof seed !== 'number' ||
              !seeds.includes(seed) ||
              seen.has(seed) ||
              !name ||
              !/^episode-\d+$/.test(name)
            )
              throw new Error('Invalid online episode identity')
            seen.add(seed)
            const dir = join(evaluation.evalDir, `${mode}/seed-${seed}/${name}`)
            const record = rec(await readJson(catalog, join(dir, 'rl_episode.json')))
            evaluation.episodes.push(
              build(
                catalog,
                evaluation,
                'model',
                {
                  ...entry,
                  status: record.status,
                  decisions: record.decisions ?? record.steps,
                  reward_components_sum: record.reward_components_sum,
                  exit_code: record.exit_code,
                  metrics: {
                    ...rec(entry.metrics),
                    update_cycles: entry.update_cycles,
                  },
                },
                buildingsByDir,
                false,
                dir
              )
            )
          }
          evaluation.episodesExpected =
            seeds.length + evaluation.episodes.filter((e) => e.policy !== 'model').length
          evaluation.episodesCompleted = evaluation.episodes.filter(
            (e) => e.status === 'completed'
          ).length
          evaluation.simulatorStatus = typeof data.status === 'string' ? data.status : null
          evaluation.state =
            data.status === 'completed' &&
            seeds.length > 0 &&
            seen.size === seeds.length &&
            evaluation.episodesCompleted === evaluation.episodesExpected
              ? 'ok'
              : 'incomplete'
          evaluation.message =
            evaluation.state === 'ok' ? null : 'Operation has incomplete episode records.'
          experiment.evaluations.push(evaluation)
        }
        experiment.artifacts.push({
          artifact: 'online_manifest',
          path: onlinePath,
          present: true,
          usable: true,
          message: null,
        })
      } catch (error) {
        experiment.issues.push(`${onlinePath}: ${String(error)}`)
        experiment.artifacts.push({
          artifact: 'online_manifest',
          path: onlinePath,
          present: catalog.has(onlinePath),
          usable: false,
          message: String(error),
        })
      }
    }
  }
  const review = rec(await readJson(catalog, join(layout.root, 'mission_review.json')))
  if (review.mission_review_version === 1) {
    const episodes = rec(review.episodes)
    for (const evaluation of experiment.evaluations)
      for (const episode of evaluation.episodes) {
        const relative = episode.dir.startsWith(layout.campaign + '/')
          ? episode.dir.slice(layout.campaign.length + 1)
          : episode.dir
        const diagnostics = rec(rec(episodes[relative]).metrics)
        episode.metrics = {
          ...episode.metrics,
          ...diagnostics,
        } as Episode['metrics']
      }
  }
  const reports = await Promise.all(
    [
      'phase_one_report.json',
      'phase_two_report.json',
      'phase_three_report.json',
      'phase_four_report.json',
      'phase_five_report.json',
      'phase_six_report.json',
      'phase_seven_report.json',
    ].map((file) => readJson(catalog, join(layout.root, file)))
  )
  for (const report of reports) mergeScenarioReport(experiment, layout.campaign, rec(report))
  // Imported controls carry their own small checked metrics file, even when their
  // original scenario report is outside the currently opened outputs folder.
  const checked = new Map<string, Promise<Rec>>()
  await Promise.all(
    experiment.evaluations.flatMap((evaluation) =>
      evaluation.episodes.map(async (episode) => {
        if (episode.status !== 'completed') return
        if (REPORT_METRICS.every((key) => key in (episode.metrics ?? {}))) return
        const path = join(episode.dir, 'scenario_check_metrics.json')
        if (!catalog.has(path)) return
        let pending = checked.get(path)
        if (!pending) {
          pending = readJson(catalog, path).then(rec)
          checked.set(path, pending)
        }
        const metrics = await pending
        if (metrics.check_metrics_version === 1) addReportMetrics(episode, metrics)
      })
    )
  )
  return experiment
}

/**
 * Scenario-check outcomes from a phase report's diagnostics. Each is computed by the
 * simulator's scenario check from the saved steps (window delivery after the case's event
 * gate), not by the evaluation manifest, so they keep their own names and never fill or
 * replace a manifest metric.
 */
export const REPORT_METRICS = [
  'event_outage_s',
  'event_completion_s',
  'event_delay_s',
  'event_completed_ever',
  'event_sustained_through_end',
  'pre_event_delivery',
  'post_event_delivery',
  'final_minute_event_delivery',
  'final_minute_worst_service',
  'final_team_arrival_fraction',
  'final_team_max_distance_m',
  'team_completed_ever',
  'team_sustained_through_end',
  'final_minute_coverage',
  'final_minute_original_delivery',
  'travel_m_total',
] as const

const hostSegments = (p: string) => p.split(/[\\/]+/).filter(Boolean)

/** Match versioned phase diagnostics by complete episode path, seed and policy. */
export function mergeScenarioReport(experiment: Experiment, campaign: string, report: Rec) {
  let rows: Rec[]
  if (report.phase_one_report_version === 1 || report.phase_two_report_version === 1) {
    if (!Array.isArray(report.diagnostics)) return
    rows = report.diagnostics.map(rec)
  } else if (
    report.phase_three_report_version === 1 ||
    report.phase_four_report_version === 1 ||
    report.phase_five_report_version === 1 ||
    report.phase_six_report_version === 1 ||
    report.phase_seven_report_version === 1
  ) {
    const groups = [
      ...(Array.isArray(report.variants) ? report.variants : []),
      ...(Array.isArray(report.escape) ? report.escape : []),
    ]
    rows = [
      ...(Array.isArray(report.baselines) ? report.baselines : []),
      ...groups.flatMap((group) => {
        const diagnostics = rec(group).diagnostics
        return Array.isArray(diagnostics) ? diagnostics : []
      }),
    ].map(rec)
  } else return
  for (const evaluation of experiment.evaluations)
    for (const episode of evaluation.episodes) {
      if (episode.policy === 'model' && episode.status !== 'completed') continue
      const relative = hostSegments(
        episode.dir.startsWith(campaign + '/')
          ? episode.dir.slice(campaign.length + 1)
          : episode.dir
      )
      const row = rows.find((r) => {
        if (r.seed !== episode.seed || typeof r.episode_dir !== 'string') return false
        const policy = String(r.policy)
        if (
          episode.policy === 'model'
            ? ![
                'frozen_deterministic',
                'frozen_sampled',
                'online',
                'initial-sampling',
                'stall-burst',
              ].includes(policy)
            : policy !== episode.policy
        )
          return false
        const host = hostSegments(r.episode_dir)
        return (
          host.length >= relative.length &&
          relative.every((part, i) => host[host.length - relative.length + i] === part)
        )
      })
      if (!row) continue
      addReportMetrics(episode, row)
    }
}

function addReportMetrics(episode: Episode, row: Rec) {
  const added: Record<string, number | null> = {}
  for (const key of REPORT_METRICS) {
    if (
      episode.metrics &&
      typeof episode.metrics[key] === 'number' &&
      Number.isFinite(episode.metrics[key])
    )
      continue
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) added[key] = value
    else if (typeof value === 'boolean') added[key] = value ? 1 : 0
    else if (value === null) added[key] = null
  }
  if (!Object.keys(added).length) return
  episode.metrics = { ...(episode.metrics ?? {}), ...added }
  episode.reportMetrics = [...new Set([...(episode.reportMetrics ?? []), ...Object.keys(added)])]
}
