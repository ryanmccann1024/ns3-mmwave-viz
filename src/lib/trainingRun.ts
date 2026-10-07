import type { ResultCatalog } from './resultCatalog.ts'
import type { EpisodeFilePaths } from './experimentIndex.ts'
import { parseNpz } from './npz.ts'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const rec = (v: unknown): Rec => (isRec(v) ? v : {})
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const join = (dir: string, rest: string) => (dir === '' ? rest : `${dir}/${rest}`)
const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

const EPISODE_RECORD = /(?:^|\/)episode-(\d+)\/rl_episode\.json$/

export interface TrainingEpisode {
  index: number
  dir: string
  status: string | null
  stopReason: string | null
  /** cumulative_reward as the simulator recorded it */
  return: number | null
  decisions: number | null
  components: Record<string, number>
  /**
   * A learning episode: completed with at least one decision. The records at the
   * start (stop_reason "reset") and end ("close") of a run are environment
   * bookkeeping with no decisions, and are left out of curves.
   */
  counted: boolean
  files: EpisodeFilePaths
  playable: boolean
}

export interface EvalCheckpoint {
  timesteps: number
  /** one value per evaluation episode at this checkpoint */
  returns: number[]
}

export interface TrainingRun {
  root: string
  status: string | null
  algorithm: string | null
  seed: number | null
  startedAt: string | null
  endedAt: string | null
  totalTimesteps: number | null
  bestMeanReward: number | null
  hyperparameters: Rec | null
  rewardComponents: string[]
  rewardWeights: number[]
  actionMeanings: string[]
  slotNodeIds: string[]
  evalSeed: number | null
  episodes: TrainingEpisode[]
  /** periodic evaluations from evaluations.npz, when it was saved and readable */
  checkpoints: EvalCheckpoint[] | null
  checkpointsError: string | null
}

/** Folders holding a train_manifest.json, newest path last. */
export function discoverTrainingRuns(catalog: ResultCatalog): string[] {
  return catalog
    .paths()
    .filter((p) => p === 'train_manifest.json' || p.endsWith('/train_manifest.json'))
    .map(dirname)
    .sort()
}

/**
 * The training run an evaluation used, from the eval manifest's bundle.run_dir. That
 * path is written relative to the simulator (e.g. "outputs/2026-09/22/17-50-56"), so it
 * is matched against catalog folders by its trailing segments.
 */
export function matchTrainingRun(runDir: string | null, roots: string[]): string | null {
  if (!runDir) return null
  const parts = runDir.split(/[\\/]+/).filter(Boolean)
  let best: string | null = null
  for (const root of roots) {
    if (root === '') continue
    const r = root.split('/')
    const tail = parts.slice(-r.length)
    if (tail.length === r.length && tail.every((p, i) => p === r[i])) {
      if (best === null || root.length > best.length) best = root
    }
  }
  return best
}

function episodeFilePaths(catalog: ResultCatalog, dir: string): EpisodeFilePaths {
  const under = catalog.paths().filter((p) => p.startsWith(dir + '/'))
  const inSeed = (name: string) =>
    under.find((p) => new RegExp(`^${escape(dir)}/seed-[^/]+/${escape(name)}$`).test(p)) ?? null
  const buildings = under.filter((p) => /\/inputs\/buildings[^/]*\.json$/.test(p))
  return {
    links: inSeed('links.csv'),
    positions: inSeed('positions.csv'),
    flows: inSeed('flows.csv'),
    routes: inSeed('routes.csv'),
    mcs: inSeed('mcs.csv'),
    rxPower: inSeed('rx-power.csv'),
    summary: inSeed('summary.json'),
    steps: under.find((p) => p === `${dir}/steps.jsonl`) ?? null,
    rlEpisode: `${dir}/rl_episode.json`,
    nodesJson: under.find((p) => p.endsWith('/inputs/nodes.json')) ?? null,
    jammersJson: under.find((p) => p.endsWith('/inputs/jammers.json')) ?? null,
    buildings: buildings.find((p) => p.endsWith('/buildings.json')) ?? buildings[0] ?? null,
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function readJson(catalog: ResultCatalog, path: string): Promise<unknown> {
  const file = await catalog.getFile(path)
  if (!file) return null
  try {
    return JSON.parse(await file.text())
  } catch {
    return null
  }
}

export async function loadTrainingRun(catalog: ResultCatalog, root: string): Promise<TrainingRun> {
  const manifest = rec(await readJson(catalog, join(root, 'train_manifest.json')))
  const selection = rec(manifest.selection)
  const contract = rec(manifest.contract)
  const hyper = isRec(manifest.hyperparameters) ? manifest.hyperparameters : null

  const prefix = root === '' ? '' : root + '/'
  const recordPaths = catalog
    .paths()
    .filter((p) => p.startsWith(prefix) && EPISODE_RECORD.test(p.slice(prefix.length)))
    // only this run's own episodes, not an eval folder nested inside it
    .filter((p) => p.slice(prefix.length).split('/').length === 2)

  const episodes = (
    await Promise.all(
      recordPaths.map(async (path): Promise<TrainingEpisode> => {
        const d = rec(await readJson(catalog, path))
        const dir = dirname(path)
        const index = num(d.episode) ?? Number(path.match(EPISODE_RECORD)![1])
        const decisions = num(d.decisions)
        const status = str(d.status)
        const files = episodeFilePaths(catalog, dir)
        const components: Record<string, number> = {}
        for (const [k, v] of Object.entries(rec(d.reward_components_sum))) {
          if (typeof v === 'number') components[k] = v
        }
        return {
          index,
          dir,
          status,
          stopReason: str(d.stop_reason),
          return: num(d.cumulative_reward),
          decisions,
          components,
          counted: status === 'completed' && (decisions ?? 0) > 0,
          files,
          playable: files.links !== null && files.positions !== null,
        }
      })
    )
  ).sort((a, b) => a.index - b.index)

  let checkpoints: EvalCheckpoint[] | null = null
  let checkpointsError: string | null = null
  const npzPath = join(root, 'evaluations.npz')
  const npzFile = catalog.has(npzPath) ? await catalog.getFile(npzPath) : null
  if (npzFile) {
    try {
      const npz = await parseNpz(await npzFile.arrayBuffer())
      const t = npz.timesteps
      const r = npz.results
      if (!t || !r) throw new Error('timesteps or results array missing')
      const perRow = r.shape[1] ?? 1
      checkpoints = t.data.map((timesteps, i) => ({
        timesteps,
        returns: r.data.slice(i * perRow, (i + 1) * perRow),
      }))
    } catch (err) {
      checkpointsError = `${npzPath}: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const evaluation = rec(manifest.evaluation)
  return {
    root,
    status: str(manifest.status),
    algorithm: str(manifest.algorithm),
    seed: num(manifest.seed),
    startedAt: str(manifest.started_at),
    endedAt: str(manifest.ended_at),
    totalTimesteps: num(hyper?.total_timesteps),
    bestMeanReward: num(manifest.best_mean_reward),
    hyperparameters: hyper,
    rewardComponents: Array.isArray(selection.reward_components)
      ? selection.reward_components.filter((c): c is string => typeof c === 'string')
      : [],
    rewardWeights: Array.isArray(selection.reward_weights)
      ? selection.reward_weights.filter((w): w is number => typeof w === 'number')
      : [],
    actionMeanings: Array.isArray(contract.action_meanings)
      ? contract.action_meanings.filter((a): a is string => typeof a === 'string')
      : [],
    slotNodeIds: Array.isArray(contract.slot_node_ids)
      ? contract.slot_node_ids.filter((a): a is string => typeof a === 'string')
      : [],
    evalSeed: num(evaluation.seed),
    episodes,
    checkpoints,
    checkpointsError,
  }
}
