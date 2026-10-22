import type { Episode, Evaluation, Experiment } from './experimentIndex.ts'
import type { ResultCatalog } from './resultCatalog.ts'
import { readJson } from './resultCatalog.ts'

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {}
const join = (root: string, tail: string) => (root ? `${root}/${tail}` : tail)
const parent = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
const title = (name: string) => name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const basename = (path: string) => path.split(/[\\/]/).pop() ?? ''

export interface CampaignLayout {
  campaign: string
  main: string
  root: string
  scene: string
  profiles: string[]
  previous: string[]
}

export interface DiagnosticLayout {
  root: string
  scene: string
  sources: { root: string; mode: string }[]
}

/** Hold diagnostics compare action modes and rewards; delayed traffic is a separate setup. */
export function diagnosticScenarios(paths: string[]): DiagnosticLayout[] {
  const groups = new Map<string, DiagnosticLayout>()
  for (const path of paths) {
    const match = path.match(
      /^(.*(?:^|\/)main)\/diagnostics\/(small-hold|large-hold)-(?:low-travel|strong-travel|coverage-strong-travel)(-delayed-transfer)?\/(deterministic|sampled)\/eval_manifest\.json$/
    )
    if (!match) continue
    const [, main, scene, delayed, mode] = match
    const root = join(main, `diagnostics/${delayed ? 'delayed-transfer' : 'standard'}/${scene}`)
    const layout = groups.get(root) ?? { root, scene, sources: [] }
    layout.sources.push({ root: parent(path), mode })
    groups.set(root, layout)
  }
  return [...groups.values()].sort((a, b) => a.root.localeCompare(b.root))
}

/** A saved adaptive selection identifies the layout without reading replay contents. */
export function campaignScenarios(paths: string[]): CampaignLayout[] {
  const all = new Set(paths)
  const layouts: CampaignLayout[] = []
  for (const marker of paths.filter(
    (p) => p === 'campaign_resolved.json' || p.endsWith('/campaign_resolved.json')
  )) {
    const campaign = parent(marker)
    const main = join(campaign, 'main')
    if (!all.has(join(main, 'selected_profile.json'))) continue
    const scenes = new Map<string, string[]>()
    for (const path of paths) {
      if (!path.startsWith(`${main}/`) || !path.endsWith('/experiment_plan.json')) continue
      const parts = path.slice(main.length + 1).split('/')
      if (parts.length !== 3 || parts[0] === 'references' || parts[1] === 'baseline-cache') continue
      const profiles = scenes.get(parts[0]) ?? []
      profiles.push(join(main, `${parts[0]}/${parts[1]}`))
      scenes.set(parts[0], profiles)
    }
    for (const [scene, profiles] of scenes) {
      const prefix = join(main, `references/${scene}/`)
      const previous = paths
        .filter((p) => p.startsWith(prefix) && p.endsWith('/eval_manifest.json'))
        .filter((p) => p.slice(prefix.length).split('/').length === 2)
        .map(parent)
      layouts.push({
        campaign,
        main,
        scene,
        root: join(main, scene),
        profiles: profiles.sort(),
        previous: previous.sort(),
      })
    }
  }
  return layouts.sort((a, b) => a.root.localeCompare(b.root))
}

export function campaignLayout(paths: string[], root: string): CampaignLayout | null {
  return campaignScenarios(paths).find((layout) => layout.root === root) ?? null
}

export function campaignEvaluationCount(paths: string[], layout: CampaignLayout): number {
  const roots = [...layout.profiles, ...layout.previous]
  return paths
    .filter(
      (p) =>
        roots.some((root) => p.startsWith(`${root}/`)) &&
        (p.endsWith('/eval_manifest.json') || p.endsWith('/online_manifest.json'))
    )
    .reduce((n, p) => n + (p.endsWith('/online_manifest.json') ? 2 : 1), 0)
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
    episodes: evaluation.episodes.map((e) => ({ ...e, label, evaluationKey: key })),
  }
}

export async function loadDiagnosticScenario(
  catalog: ResultCatalog,
  layout: DiagnosticLayout,
  load: Loader
): Promise<Experiment> {
  const experiment: Experiment = {
    root: layout.root,
    name: title(layout.scene),
    kind: 'collection',
    plan: null,
    comparison: null,
    comparisonPath: null,
    fetch: null,
    evaluations: [],
    issues: [],
    artifacts: [],
  }
  for (const source of layout.sources) {
    const result = await load(catalog, source.root)
    experiment.artifacts.push(...result.artifacts)
    experiment.issues.push(...result.issues)
    for (const evaluation of result.evaluations) {
      const reward = evaluation.label
        .replace(new RegExp(`^${layout.scene}-`), '')
        .replace(/-delayed-transfer$/, '')
      experiment.evaluations.push(relabel(evaluation, `${title(reward)} · ${title(source.mode)}`))
    }
  }
  return experiment
}

export async function loadCampaignScenario(
  catalog: ResultCatalog,
  layout: CampaignLayout,
  load: Loader,
  build: Builder
): Promise<Experiment> {
  const config = rec(await readJson(catalog, join(layout.campaign, 'campaign_resolved.json')))
  if (config.campaign_kind !== 'adaptive-ppo-v1')
    throw new Error('Unsupported adaptive campaign format')
  const selection = rec(await readJson(catalog, join(layout.main, 'selected_profile.json')))
  const winner = typeof selection.winner === 'string' ? selection.winner : null
  const experiment: Experiment = {
    root: layout.root,
    name: title(layout.scene),
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
        path: join(layout.campaign, 'campaign_resolved.json'),
        present: true,
        usable: true,
        message: null,
      },
    ],
  }
  const profiles = [...layout.profiles].sort(
    (a, b) =>
      Number(b.endsWith(`/${winner}`)) - Number(a.endsWith(`/${winner}`)) || a.localeCompare(b)
  )
  for (const root of [...profiles, ...layout.previous]) {
    const source = await load(catalog, root)
    experiment.artifacts.push(...source.artifacts)
    experiment.issues.push(...source.issues)
    const previous = layout.previous.includes(root)
    const profile = basename(root)
    const trainPath = catalog
      .paths()
      .find((p) => p.startsWith(`${root}/train/`) && p.endsWith('/train_manifest.json'))
    const training = trainPath ? rec(await readJson(catalog, trainPath)) : {}
    const settings = Object.keys(rec(training.hyperparameters)).length
      ? rec(training.hyperparameters)
      : null
    for (const original of source.evaluations) {
      const label = previous
        ? `${title(original.label)} · Previous`
        : `Dynamic Balance · ${profile === 'reference' ? 'Default PPO' : title(profile)}`
      const evaluation = relabel(original, label)
      evaluation.provenance = {
        kind: previous ? 'previous' : 'new',
        profile: previous ? null : profile,
        settings,
        description: previous
          ? 'Saved 10-09-2 model evaluated on the fresh comparison seeds; no retraining.'
          : `New Dynamic Balance model${profile === winner ? '; selected PPO profile' : ''}.`,
      }
      experiment.evaluations.push(evaluation)
      const onlinePath = join(root, 'online/online_manifest.json')
      if (!previous && catalog.has(onlinePath)) {
        try {
          const data = rec(await readJson(catalog, onlinePath))
          if (data.online_experiment_version !== 1)
            throw new Error('Unsupported online experiment version')
          experiment.artifacts.push({
            artifact: 'online_manifest',
            path: onlinePath,
            present: true,
            usable: true,
            message: null,
          })
          for (const mode of ['fixed_sampled', 'online'] as const) {
            const online = relabel(
              original,
              `Dynamic Balance · ${mode === 'online' ? 'Online Learning' : 'Sampled Control'}`
            )
            online.provenance = {
              kind: mode === 'online' ? 'online' : 'fixed',
              profile,
              settings: mode === 'online' ? rec(data.settings) : settings,
              description:
                mode === 'online'
                  ? 'PPO continues updating during this episode. Each seed starts from a fresh copy of the same checkpoint.'
                  : 'Sampled actions from the same checkpoint with no parameter updates.',
            }
            online.evalDir = parent(onlinePath)
            online.heldOut = mode !== 'online'
            online.heldOutSeeds = mode === 'online' ? [] : original.heldOutSeeds
            online.episodes = online.episodes.filter((e) => e.policy !== 'model')
            online.policySummaries = { ...original.policySummaries, model: null }
            const entries = (Array.isArray(data.episodes) ? data.episodes : [])
              .map(rec)
              .filter((e) => e.mode === mode)
            const seeds = Array.isArray(data.seeds)
              ? data.seeds.filter((s): s is number => typeof s === 'number' && Number.isInteger(s))
              : []
            const identities = new Set<number>()
            for (const entry of entries) {
              const seed = entry.seed
              const name =
                typeof entry.episode_dir === 'string' ? basename(entry.episode_dir) : null
              if (
                typeof seed !== 'number' ||
                !seeds.includes(seed) ||
                identities.has(seed) ||
                !name ||
                !/^episode-\d+$/.test(name)
              )
                throw new Error('Invalid online episode identity')
              identities.add(seed)
              const dir = join(parent(onlinePath), `${mode}/seed-${seed}/${name}`)
              const record = rec(await readJson(catalog, join(dir, 'rl_episode.json')))
              const episode = build(
                catalog,
                online,
                'model',
                {
                  ...entry,
                  status: record.status,
                  decisions: record.decisions ?? record.steps,
                  reward_components_sum: record.reward_components_sum,
                  exit_code: record.exit_code,
                  return: entry.return ?? record.cumulative_reward,
                  metrics: { ...rec(entry.metrics), update_cycles: entry.update_cycles },
                },
                new Map(),
                false,
                dir
              )
              online.episodes.push(episode)
              if (!online.contract && Object.keys(rec(record.contract)).length)
                online.contract = record.contract as Evaluation['contract']
            }
            online.episodesExpected =
              seeds.length + online.episodes.filter((e) => e.policy !== 'model').length
            online.episodesCompleted = online.episodes.filter(
              (e) => e.status === 'completed'
            ).length
            online.simulatorStatus = typeof data.status === 'string' ? data.status : null
            online.state =
              data.status === 'completed' &&
              seeds.length > 0 &&
              entries.length === seeds.length &&
              online.episodesCompleted === online.episodesExpected
                ? 'ok'
                : 'incomplete'
            online.message =
              online.state === 'ok' ? null : 'Online operation has incomplete episode records.'
            experiment.evaluations.push(online)
          }
        } catch (error) {
          experiment.issues.push(`${onlinePath}: ${String(error)}`)
          experiment.artifacts.push({
            artifact: 'online_manifest',
            path: onlinePath,
            present: true,
            usable: false,
            message: String(error),
          })
        }
      }
    }
  }
  return experiment
}
