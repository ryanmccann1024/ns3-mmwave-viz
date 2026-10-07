import type { ResultCatalog } from './resultCatalog.ts'
import { checkComparison } from './comparisonView.ts'
import type { RawComparison } from './comparisonView.ts'
import {
  compareScenarioIdentity,
  numberOrNull,
  parseBaselineManifest,
  resolveRef,
  sanitizeLabel,
  sanitizeText,
} from './baselineManifest.ts'
import type { BaselineManifest, IdentityCheck, ScenarioIdentity } from './baselineManifest.ts'

// Index of an experiment folder built from small manifests only. Every path is
// catalog-relative; absolute paths recorded in manifests are never dereferenced.

export const SUPPORTED_VERSIONS = {
  plan: 1,
  evalManifest: [2, 3],
  trainManifest: [4, 5],
  fetchManifest: 1,
}

export type ArtifactState = 'ok' | 'incomplete' | 'failed' | 'missing' | 'not_fetched'
export type RootKind = 'plan' | 'comparison' | 'eval'

export interface ExperimentRoot {
  /** catalog-relative directory; '' is the catalog root */
  root: string
  kind: RootKind
}

export interface ArtifactReport {
  artifact: 'experiment_plan' | 'comparison' | 'fetch_manifest' | 'eval_manifest'
  path: string
  present: boolean
  usable: boolean
  message: string | null
}

export interface EvalContract {
  node_ids: string[]
  slot_node_ids: string[]
  action_meanings: string[]
  tick_s?: number
  decision_interval_s?: number
  bounds?: Record<string, number>
  [key: string]: unknown
}

export interface EpisodeFilePaths {
  links: string | null
  positions: string | null
  flows: string | null
  routes: string | null
  mcs: string | null
  rxPower: string | null
  summary: string | null
  steps: string | null
  rlEpisode: string | null
  nodesJson: string | null
  jammersJson: string | null
  buildings: string | null
}

export interface Episode {
  evaluationKey: string
  label: string
  /** null for a baseline-only evaluation, which has no trained model */
  trainingSeed: number | null
  policy: string
  seed: number
  /** basename of the manifest's episode_dir, e.g. episode-0002 */
  name: string
  dir: string
  seedDir: string
  status: string | null
  error: string | null
  exitCode: number | null
  decisions: number | null
  return: number | null
  rewardComponentsSum: Record<string, number> | null
  metrics: Record<string, number | null> | null
  maskViolations: number | null
  revalidatedSlotsTotal: number | null
  /** catalog path of each file that exists, else null */
  files: EpisodeFilePaths
  playable: boolean
  hasTelemetry: boolean
  message: string | null
}

/** A placement-baseline policy's `policies[name].baseline` block, plus its referenced manifest. */
export interface EvalBaselineInfo {
  method: string | null
  requestedAlgorithm: string | null
  objective: string | null
  executor: string | null
  plannerSeed: number | null
  maxIterations: number | null
  fingerprint: string | null
  initialDisplacementMTotal: number | null
  effectiveScenarioIdentity: ScenarioIdentity | null
  plannerSourceSha256: string | null
  rfConfigSha256: string | null
  mappingSha256: string | null
  /** resolveRef(evalDir, block.manifest) */
  manifestPath: string | null
  /** resolveRef(evalDir, block.plan); never read at load time */
  planPath: string | null
  /** loaded only when manifestPath is in the catalog */
  manifest: BaselineManifest | null
  /** 'unresolvable reference' | 'not in catalog' | 'unreadable' | parse reason */
  manifestError: string | null
  /** manifest?.plannerWallS ?? null */
  plannerWallS: number | null
  /** eval scenario_identity vs the manifest's source identity; null unless both exist */
  sourceIdentityCheck: IdentityCheck | null
}

export interface Evaluation {
  /** `${label}#${trainingSeed}` */
  key: string
  label: string
  /** null for a baseline-only evaluation, which has no trained model */
  trainingSeed: number | null
  evalDir: string
  declared: boolean
  state: ArtifactState
  message: string | null
  /** the simulator's own strings, for display */
  simulatorStatus: string | null
  simulatorError: string | null
  fetchTaskState: string | null
  episodesExpected: number | null
  episodesCompleted: number | null
  heldOut: boolean | null
  heldOutSeeds: number[]
  overlap: number[]
  contract: EvalContract | null
  observationSchema: unknown
  rewardSchema: unknown
  selection: unknown
  metricSource: unknown
  modelSelection: string | null
  /** the training run folder the evaluated model came from (bundle.run_dir), as written */
  trainingRunDir: string | null
  modelSha256: string | null
  compatibilityNote: string | null
  policySummaries: Record<string, unknown>
  policies: string[]
  episodes: Episode[]
  /** by policy name; only policies whose block carries a baseline object */
  baselines: Record<string, EvalBaselineInfo>
}

export interface PlanRow {
  name: string
  run_config?: string
  observation_preset?: string
  action_profile?: string
  reward_components?: string[]
  reward_weights?: number[]
}

export interface PlanInfo {
  name: string | null
  seeds: { training: number[]; model_selection: number | null; held_out: number[] }
  rows: PlanRow[]
}

export interface FetchSnapshot {
  path: string
  remote: unknown
  selection: string[]
  fetchedAt: string | null
  tasks: { index: number | null; id: string; state: string }[]
  comparison: string | null
  snapshotOfIncompleteRun: boolean | null
  fileCount: number | null
}

export interface Experiment {
  root: string
  kind: RootKind
  name: string
  plan: PlanInfo | null
  comparison: RawComparison | null
  comparisonPath: string | null
  fetch: FetchSnapshot | null
  artifacts: ArtifactReport[]
  issues: string[]
  evaluations: Evaluation[]
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const rec = (v: unknown): Rec => (isRec(v) ? v : {})
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null)
const nums = (v: unknown) => (Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [])
const join = (dir: string, rest: string) => (dir === '' ? rest : `${dir}/${rest}`)
const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const under = (root: string, p: string) => root === '' || p === root || p.startsWith(root + '/')
const evalKey = (label: string, seed: number | null) => `${label}#${seed ?? 'baseline'}`

/** Last segment of a manifest path written on any host ('/' or '\\' separators). */
export function hostBasename(p: string): string {
  const parts = p.split(/[\\/]+/).filter((s) => s !== '')
  return parts.length ? parts[parts.length - 1] : ''
}

async function readSmallJson(catalog: ResultCatalog, path: string) {
  const file = await catalog.getFile(path)
  if (!file) return { present: false, data: null as unknown, message: `${path} is not present` }
  try {
    return { present: true, data: JSON.parse(await file.text()) as unknown, message: null }
  } catch {
    return { present: true, data: null as unknown, message: `${path} is not valid JSON` }
  }
}

function versionMessage(data: unknown, field: string, supported: number | number[], path: string) {
  if (!isRec(data)) return `${path} is not a JSON object`
  if (!(field in data)) return `${path} has no ${field} (this viewer supports ${supported})`
  const versions = Array.isArray(supported) ? supported : [supported]
  if (!versions.includes(data[field] as number)) {
    return `${path}: unsupported ${field} ${String(data[field])} (this viewer supports ${supported})`
  }
  return null
}

/** Candidate experiment folders, found from catalog paths alone. */
export function discoverExperiments(catalog: ResultCatalog): ExperimentRoot[] {
  const paths = catalog.paths()
  const found: ExperimentRoot[] = []
  const add = (dirs: string[], kind: RootKind) => {
    const unique = [...new Set(dirs)].sort((a, b) => a.length - b.length || a.localeCompare(b))
    for (const root of unique) {
      if (!found.some((f) => under(f.root, root))) found.push({ root, kind })
    }
  }
  const all = new Set(paths)
  // Policy comparisons are written with a sibling episodes.csv; regression comparisons are not
  const isCandidate = (p: string, suffix: string) =>
    !suffix.endsWith('comparison.json') ||
    all.has(p.slice(0, p.length - 'comparison.json'.length) + 'episodes.csv')
  const dirsOf = (suffix: string) =>
    paths
      .filter((p) => (p === suffix || p.endsWith('/' + suffix)) && isCandidate(p, suffix))
      .map((p) => p.slice(0, Math.max(0, p.length - suffix.length - 1)))
  add(dirsOf('experiment_plan.json'), 'plan')
  add(dirsOf('comparison/comparison.json'), 'comparison')
  add(dirsOf('comparison.json'), 'comparison')
  add(dirsOf('eval_manifest.json'), 'eval')
  return found.sort((a, b) => a.root.localeCompare(b.root))
}

function parsePlan(data: Rec): PlanInfo {
  const seeds = rec(data.seeds)
  return {
    name: str(rec(data.matrix).name),
    seeds: {
      training: nums(seeds.training),
      model_selection: num(seeds.model_selection),
      held_out: nums(seeds.held_out),
    },
    rows: (Array.isArray(data.rows) ? data.rows : []).filter(isRec) as unknown as PlanRow[],
  }
}

export function parseFetchManifest(data: unknown, path: string): FetchSnapshot {
  const d = rec(data)
  return {
    path,
    remote: d.remote ?? null,
    selection: Array.isArray(d.selection) ? d.selection.map(String) : [],
    fetchedAt: str(d.fetched_at),
    tasks: (Array.isArray(d.tasks) ? d.tasks : []).filter(isRec).map((t) => ({
      index: num(t.index),
      id: String(t.id),
      state: String(t.state),
    })),
    comparison: str(d.comparison),
    snapshotOfIncompleteRun: bool(d.snapshot_of_incomplete_run),
    fileCount: Array.isArray(d.files) ? d.files.length : null,
  }
}

function emptyEvaluation(label: string, trainingSeed: number | null, evalDir: string): Evaluation {
  return {
    key: evalKey(label, trainingSeed),
    label,
    trainingSeed,
    evalDir,
    declared: false,
    state: 'missing',
    message: null,
    simulatorStatus: null,
    simulatorError: null,
    fetchTaskState: null,
    episodesExpected: null,
    episodesCompleted: null,
    heldOut: null,
    heldOutSeeds: [],
    overlap: [],
    contract: null,
    observationSchema: null,
    rewardSchema: null,
    selection: null,
    metricSource: null,
    modelSelection: null,
    trainingRunDir: null,
    modelSha256: null,
    compatibilityNote: null,
    policySummaries: {},
    policies: [],
    episodes: [],
    baselines: {},
  }
}

function buildEpisode(
  catalog: ResultCatalog,
  evaluation: Evaluation,
  policy: string,
  entry: Rec,
  buildingsByDir: Map<string, string[]>,
  fetched: boolean
): Episode {
  const seed = num(entry.seed) ?? NaN
  const name = hostBasename(str(entry.episode_dir) ?? '')
  const dir = join(join(evaluation.evalDir, policy), name)
  const seedDir = join(dir, `seed-${seed}`)
  const at = (path: string) => (catalog.has(path) ? path : null)
  const buildings = buildingsByDir.get(join(dir, 'inputs')) ?? []
  const files: EpisodeFilePaths = {
    links: at(join(seedDir, 'links.csv')),
    positions: at(join(seedDir, 'positions.csv')),
    flows: at(join(seedDir, 'flows.csv')),
    routes: at(join(seedDir, 'routes.csv')),
    mcs: at(join(seedDir, 'mcs.csv')),
    rxPower: at(join(seedDir, 'rx-power.csv')),
    summary: at(join(seedDir, 'summary.json')),
    steps: at(join(dir, 'steps.jsonl')),
    rlEpisode: at(join(dir, 'rl_episode.json')),
    nodesJson: at(join(dir, 'inputs/nodes.json')),
    jammersJson: at(join(dir, 'inputs/jammers.json')),
    buildings: buildings.find((p) => p.endsWith('/buildings.json')) ?? buildings[0] ?? null,
  }
  const lacking = [
    files.links ? null : join(seedDir, 'links.csv'),
    files.positions ? null : join(seedDir, 'positions.csv'),
  ].filter((p): p is string => p !== null)
  let message: string | null = null
  if (name === '') message = 'the manifest records no episode_dir for this episode'
  else if (lacking.length) {
    message =
      `cannot play this episode: ${lacking.join(' and ')} not found in the selected folder` +
      (fetched
        ? ' (this is a fetched snapshot; episode CSVs may not have been fetched)'
        : ' (select the folder that contains the episode outputs)')
  }
  return {
    evaluationKey: evaluation.key,
    label: evaluation.label,
    trainingSeed: evaluation.trainingSeed,
    policy,
    seed,
    name,
    dir,
    seedDir,
    status: str(entry.status),
    error: str(entry.error),
    exitCode: num(entry.exit_code),
    decisions: num(entry.decisions),
    return: num(entry.return),
    rewardComponentsSum: isRec(entry.reward_components_sum)
      ? (entry.reward_components_sum as Record<string, number>)
      : null,
    metrics: isRec(entry.metrics) ? (entry.metrics as Record<string, number | null>) : null,
    maskViolations: num(entry.mask_violations),
    revalidatedSlotsTotal: num(entry.revalidated_slots_total),
    files,
    playable: message === null,
    hasTelemetry: files.steps !== null,
    message,
  }
}

function applyManifest(evaluation: Evaluation, m: Rec) {
  const roles = rec(m.seed_roles)
  const expected = num(m.episodes_expected)
  const completed = num(m.episodes_completed)
  evaluation.simulatorStatus = str(m.status)
  evaluation.simulatorError = str(m.error)
  evaluation.episodesExpected = expected
  evaluation.episodesCompleted = completed
  evaluation.heldOut = bool(roles.held_out)
  evaluation.heldOutSeeds = nums(roles.held_out_seeds)
  evaluation.overlap = nums(roles.overlap)
  evaluation.contract = isRec(m.contract) ? (m.contract as unknown as EvalContract) : null
  evaluation.observationSchema = m.observation_schema ?? null
  evaluation.rewardSchema = m.reward_schema ?? null
  evaluation.selection = m.selection ?? null
  evaluation.metricSource = m.metric_source ?? null
  evaluation.modelSelection = str(rec(m.bundle).model_selection)
  evaluation.trainingRunDir = str(rec(m.bundle).run_dir)
  evaluation.modelSha256 = str(rec(m.bundle).model_sha256)
  evaluation.compatibilityNote = str(rec(m.compatibility).note)
  const short = expected !== null && completed !== null && completed < expected
  if (evaluation.simulatorStatus === 'failed') {
    evaluation.state = 'failed'
    evaluation.message = `evaluation failed: ${evaluation.simulatorError ?? 'no error recorded'}`
  } else if (evaluation.simulatorStatus !== 'completed' || short) {
    evaluation.state = 'incomplete'
    evaluation.message =
      `evaluation is incomplete: status ${evaluation.simulatorStatus ?? 'unknown'}, ` +
      `${completed ?? '?'} of ${expected ?? '?'} episodes completed`
  } else {
    evaluation.state = 'ok'
    evaluation.message = null
  }
}

const HASH_MAX = 128

/** A scenario identity object; null when absent or when it records no hash at all. */
function identityOf(v: unknown): ScenarioIdentity | null {
  if (!isRec(v)) return null
  const identity: ScenarioIdentity = {
    runIniSha256: sanitizeText(v.run_ini_sha256, HASH_MAX),
    nodesJsonSha256: sanitizeText(v.nodes_json_sha256, HASH_MAX),
    buildingsJsonSha256: sanitizeText(v.buildings_json_sha256, HASH_MAX),
    jammersJsonSha256: sanitizeText(v.jammers_json_sha256, HASH_MAX),
  }
  return Object.values(identity).some((h) => h !== null) ? identity : null
}

/**
 * Builds a policy's baseline info. Only the block's `manifest` reference is read, and
 * only when it resolves inside the catalog; the referenced manifest's own path fields
 * (eval_manifest, logs, inputs, host paths) are never followed. Never throws.
 */
async function loadEvalBaseline(
  catalog: ResultCatalog,
  evalDir: string,
  block: Rec,
  evalIdentity: ScenarioIdentity | null
): Promise<EvalBaselineInfo> {
  const manifestPath = resolveRef(evalDir, block.manifest)
  let manifest: BaselineManifest | null = null
  let manifestError: string | null = null
  if (manifestPath === null) manifestError = 'unresolvable reference'
  else if (!catalog.has(manifestPath)) manifestError = 'not in catalog'
  else {
    try {
      const file = await catalog.getFile(manifestPath)
      if (!file) manifestError = 'not in catalog'
      else {
        const parsed = parseBaselineManifest(await file.text())
        if (parsed.ok) manifest = parsed.value
        else manifestError = parsed.reason
      }
    } catch {
      manifestError = 'unreadable'
    }
  }
  // Compare with the source identity only: the effective identity differs by design
  // once the planner has moved nodes.
  const sourceIdentity = manifest?.sourceScenarioIdentity ?? null
  return {
    method: sanitizeLabel(block.method),
    requestedAlgorithm: sanitizeLabel(block.requested_algorithm),
    objective: sanitizeLabel(block.objective),
    executor: sanitizeLabel(block.executor),
    plannerSeed: numberOrNull(block.planner_seed),
    maxIterations: numberOrNull(block.max_iterations),
    fingerprint: sanitizeText(block.fingerprint, HASH_MAX),
    initialDisplacementMTotal: numberOrNull(block.initial_displacement_m_total),
    effectiveScenarioIdentity: identityOf(block.effective_scenario_identity),
    plannerSourceSha256: sanitizeText(block.planner_source_sha256, HASH_MAX),
    rfConfigSha256: sanitizeText(block.rf_config_sha256, HASH_MAX),
    mappingSha256: sanitizeText(block.mapping_sha256, HASH_MAX),
    manifestPath,
    planPath: resolveRef(evalDir, block.plan),
    manifest,
    manifestError,
    plannerWallS: manifest?.plannerWallS ?? null,
    sourceIdentityCheck:
      evalIdentity && sourceIdentity ? compareScenarioIdentity(evalIdentity, sourceIdentity) : null,
  }
}

export async function loadExperiment(catalog: ResultCatalog, root: string): Promise<Experiment> {
  const paths = catalog.paths().filter((p) => under(root, p))
  const artifacts: ArtifactReport[] = []
  const issues: string[] = []
  const evaluations = new Map<string, Evaluation>()

  const planPath = join(root, 'experiment_plan.json')
  let plan: PlanInfo | null = null
  let planData: Rec | null = null
  if (catalog.has(planPath)) {
    const r = await readSmallJson(catalog, planPath)
    const message =
      r.message ??
      versionMessage(r.data, 'experiment_plan_version', SUPPORTED_VERSIONS.plan, planPath)
    if (!message) {
      planData = rec(r.data)
      plan = parsePlan(planData)
    }
    artifacts.push({
      artifact: 'experiment_plan',
      path: planPath,
      present: true,
      usable: !message,
      message,
    })
  }

  let comparison: RawComparison | null = null
  const comparisonPath =
    [join(root, 'comparison/comparison.json'), join(root, 'comparison.json')].find((p) =>
      catalog.has(p)
    ) ?? null
  if (comparisonPath) {
    const r = await readSmallJson(catalog, comparisonPath)
    const check = r.message ? null : checkComparison(r.data)
    comparison = check?.comparison ?? null
    const message = r.message ?? (check?.message ? `${comparisonPath}: ${check.message}` : null)
    artifacts.push({
      artifact: 'comparison',
      path: comparisonPath,
      present: true,
      usable: comparison !== null,
      message,
    })
  }

  let fetch: FetchSnapshot | null = null
  const fetchPath = join(root, 'fetch_manifest.json')
  if (catalog.has(fetchPath)) {
    const r = await readSmallJson(catalog, fetchPath)
    const message =
      r.message ??
      versionMessage(r.data, 'fetch_manifest_version', SUPPORTED_VERSIONS.fetchManifest, fetchPath)
    if (!message) fetch = parseFetchManifest(r.data, fetchPath)
    artifacts.push({
      artifact: 'fetch_manifest',
      path: fetchPath,
      present: true,
      usable: !message,
      message,
    })
  }

  // Declared evaluations: identity is label + training seed; the directory is the
  // layout convention inside the selected folder, not the recorded absolute eval_dir.
  for (const entry of (Array.isArray(planData?.evaluations) ? planData.evaluations : []).filter(
    isRec
  )) {
    const label = str(entry.label)
    const seed = num(entry.training_seed)
    if (label === null || seed === null) continue
    const evaluation = emptyEvaluation(label, seed, join(root, `eval/${label}/train-seed-${seed}`))
    evaluation.declared = true
    evaluations.set(evaluation.key, evaluation)
  }

  const buildingsByDir = new Map<string, string[]>()
  for (const p of paths) {
    if (!/\/inputs\/buildings[^/]*\.json$/.test(p)) continue
    const dir = dirname(p)
    buildingsByDir.set(dir, [...(buildingsByDir.get(dir) ?? []), p])
  }

  const evalPrefix = join(root, 'eval/')
  const standalone = join(root, 'eval_manifest.json')
  const manifestPaths = paths.filter(
    (p) => p === standalone || (p.startsWith(evalPrefix) && p.endsWith('/eval_manifest.json'))
  )
  for (const path of manifestPaths) {
    const r = await readSmallJson(catalog, path)
    const data = rec(r.data)
    const evalDir = dirname(path)
    const label =
      str(data.label) ??
      (path === standalone && data.label === null ? 'unlabelled evaluation' : null)
    const seed = num(rec(data.seed_roles).training_seed)
    // A standalone evaluation of baselines only (training: null) has no model, so no
    // training seed; it is still a complete, playable evaluation.
    const baselineOnly = path === standalone && seed === null && data.training === null
    const versionIssue =
      r.message ??
      versionMessage(r.data, 'eval_manifest_version', SUPPORTED_VERSIONS.evalManifest, path)
    const identityIssue =
      label === null || (seed === null && !baselineOnly)
        ? `${path} does not record ${label === null ? 'a label' : 'a training seed'}`
        : null
    const message = versionIssue ?? identityIssue
    artifacts.push({ artifact: 'eval_manifest', path, present: true, usable: !message, message })
    if (message) {
      issues.push(message)
      // An unreadable manifest still marks its declared slot as failed rather than missing.
      const declared = [...evaluations.values()].find((e) => e.evalDir === evalDir)
      if (declared) {
        declared.state = 'failed'
        declared.message = message
      }
      continue
    }
    const expectedDir = join(root, `eval/${label}/train-seed-${seed}`)
    if (path !== standalone && evalDir !== expectedDir) {
      issues.push(
        `${path} records ${label} / training seed ${seed}, which does not match its directory ` +
          `(expected ${expectedDir})`
      )
    }
    let evaluation = evaluations.get(evalKey(label!, seed!))
    if (evaluation && evaluation.simulatorStatus !== null) {
      issues.push(`${path} repeats ${label} / training seed ${seed}; keeping ${evaluation.evalDir}`)
      continue
    }
    if (!evaluation) {
      evaluation = emptyEvaluation(label!, seed!, evalDir)
      evaluations.set(evaluation.key, evaluation)
    }
    evaluation.evalDir = evalDir
    applyManifest(evaluation, data)
    const evalIdentity = identityOf(data.scenario_identity)
    for (const [policy, block] of Object.entries(rec(data.policies))) {
      evaluation.policies.push(policy)
      evaluation.policySummaries[policy] = rec(block).summary ?? null
      const baseline = rec(block).baseline
      if (isRec(baseline)) {
        evaluation.baselines[policy] = await loadEvalBaseline(
          catalog,
          evaluation.evalDir,
          baseline,
          evalIdentity
        )
      }
      const entries = rec(block).episodes
      for (const entry of (Array.isArray(entries) ? entries : []).filter(isRec)) {
        evaluation.episodes.push(
          buildEpisode(catalog, evaluation, policy, entry, buildingsByDir, fetch !== null)
        )
      }
    }
  }

  const manifestsFetched = fetch ? fetch.selection.includes('manifests') : true
  for (const evaluation of evaluations.values()) {
    const task =
      evaluation.trainingSeed === null
        ? undefined
        : fetch?.tasks.find(
            (t) => t.id === `${evaluation.label}/train-seed-${evaluation.trainingSeed}`
          )
    evaluation.fetchTaskState = task?.state ?? null
    if (evaluation.state !== 'missing') continue
    if (task?.state === 'not_fetched' || !manifestsFetched) {
      evaluation.state = 'not_fetched'
      evaluation.message = `eval manifest was not fetched into this snapshot (${fetchPath})`
    } else {
      evaluation.message = `declared in the plan but ${join(evaluation.evalDir, 'eval_manifest.json')} is not in the selected folder`
    }
  }

  const kind: RootKind = plan ? 'plan' : comparisonPath ? 'comparison' : 'eval'
  return {
    root,
    kind,
    name: plan?.name ?? (root === '' ? catalog.name : hostBasename(root)),
    plan,
    comparison,
    comparisonPath,
    fetch,
    artifacts,
    issues,
    evaluations: [...evaluations.values()].sort(
      (a, b) => a.label.localeCompare(b.label) || (a.trainingSeed ?? -1) - (b.trainingSeed ?? -1)
    ),
  }
}

export interface EpisodeFiles {
  linksFile: File
  positionsFile: File
  buildingsFile?: File
  flowsFile?: File
  routesFile?: File
  nodesJsonFile?: File
  jammersJsonFile?: File
  mcsFile?: File
  rxPowerFile?: File
}

export type EpisodeFilesResult = { ok: true; files: EpisodeFiles } | { ok: false; message: string }

/** Materialize only this episode's files, in the shape the playback loader takes. */
export async function episodeFiles(
  catalog: ResultCatalog,
  episode: Episode
): Promise<EpisodeFilesResult> {
  if (!episode.playable) return { ok: false, message: episode.message ?? 'episode is not playable' }
  return readPlaybackFiles(catalog, episode.files, episode.seedDir)
}

/** The CSVs and JSON a player needs, read from resolved catalog paths. */
export async function readPlaybackFiles(
  catalog: ResultCatalog,
  f: EpisodeFilePaths,
  where: string
): Promise<EpisodeFilesResult> {
  const get = async (path: string | null) =>
    path ? ((await catalog.getFile(path)) ?? undefined) : undefined
  const [
    linksFile,
    positionsFile,
    buildingsFile,
    flowsFile,
    routesFile,
    nodesJsonFile,
    jammersJsonFile,
    mcsFile,
    rxPowerFile,
  ] = await Promise.all(
    [
      f.links,
      f.positions,
      f.buildings,
      f.flows,
      f.routes,
      f.nodesJson,
      f.jammersJson,
      f.mcs,
      f.rxPower,
    ].map(get)
  )
  if (!linksFile || !positionsFile) {
    return { ok: false, message: `could not read links.csv/positions.csv under ${where}` }
  }
  return {
    ok: true,
    files: {
      linksFile,
      positionsFile,
      buildingsFile,
      flowsFile,
      routesFile,
      nodesJsonFile,
      jammersJsonFile,
      mcsFile,
      rxPowerFile,
    },
  }
}

const POLICY_ORDER = ['model', 'hold', 'random_valid', 'geometric', 'optimization']

/** Episodes of every policy for one held-out seed, matched by seed value only. */
export function matchingEpisodes(evaluation: Evaluation, seed: number): Episode[] {
  const rank = (policy: string) => {
    const i = POLICY_ORDER.indexOf(policy)
    return i < 0 ? POLICY_ORDER.length : i
  }
  return evaluation.episodes
    .filter((e) => e.seed === seed)
    .sort((a, b) => rank(a.policy) - rank(b.policy) || a.policy.localeCompare(b.policy))
}

export interface TrainingSummary {
  path: string
  present: boolean
  message: string | null
  status: string | null
  algorithm: string | null
  seed: number | null
  selection: unknown
  hyperparameters: Record<string, unknown> | null
  /** a single scalar from model selection; not a learning curve */
  bestMeanReward: number | null
  /** which saved model the evaluation used ('best' or 'final'), from the eval manifest */
  modelUsedByEval: string | null
}

export async function loadTrainingSummary(
  catalog: ResultCatalog,
  root: string,
  evaluation: Evaluation
): Promise<TrainingSummary> {
  if (evaluation.trainingSeed === null) {
    return {
      path: join(root, 'eval_manifest.json'),
      present: true,
      message: 'Baseline-only evaluation: no model was trained, so there is no training summary.',
      status: null,
      algorithm: null,
      seed: null,
      selection: null,
      hyperparameters: null,
      bestMeanReward: null,
      modelUsedByEval: null,
    }
  }
  const path = join(
    root,
    `train/${evaluation.label}/train-seed-${evaluation.trainingSeed}/train_manifest.json`
  )
  const r = await readSmallJson(catalog, path)
  const message =
    r.message ?? versionMessage(r.data, 'manifest_version', SUPPORTED_VERSIONS.trainManifest, path)
  const d = message ? {} : rec(r.data)
  return {
    path,
    present: r.present,
    message,
    status: str(d.status),
    algorithm: str(d.algorithm),
    seed: num(d.seed),
    selection: d.selection ?? null,
    hyperparameters: isRec(d.hyperparameters) ? d.hyperparameters : null,
    bestMeanReward: num(d.best_mean_reward),
    modelUsedByEval: evaluation.modelSelection,
  }
}
