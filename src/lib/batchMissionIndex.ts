import type {
  BatchAsset,
  BatchIndexInfo,
  BatchConfig,
  BatchOnlineRecord,
  BatchPlanning,
  BatchReference,
  BatchView,
  Episode,
  Evaluation,
  Experiment,
} from './experimentIndex.ts'
import type { ResultCatalog } from './resultCatalog.ts'
import { normalizeRelPath, readJson } from './resultCatalog.ts'
import { staticRewardLabel } from './rlLabels.ts'
import { batchMissionMetadata } from './missionComparison.ts'

// Version 4 scenario indexes written by a batch root. Every artifact is an explicit,
// batch-root-relative reference in the index; nothing here infers a path from a folder
// convention. Runtime helpers from experimentIndex.ts are passed in rather than imported,
// so this module never forms a runtime import cycle with it.

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const rec = (v: unknown): Rec => (isRec(v) ? v : {})
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const ints = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => int(n) !== null) : [])
const strs = (v: unknown) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
const join = (root: string, tail: string) => (root ? `${root}/${tail}` : tail)

export const BATCH_SCENARIO_VERSION = 4
export const BATCH_ONLINE_VERSION = 5

export type BatchEpisodeBuilder = (
  catalog: ResultCatalog,
  evaluation: Evaluation,
  policy: string,
  entry: Rec,
  buildings: Map<string, string[]>,
  fetched: boolean,
  episodeDir?: string
) => Episode

/** The existing evaluation loader pieces, supplied by experimentIndex.ts. */
export interface BatchLoaderHelpers {
  build: BatchEpisodeBuilder
  createEvaluation: (label: string, seed: number | null, dir: string) => Evaluation
  applyManifest: (evaluation: Evaluation, manifest: Rec) => void
  evalManifestVersions: number[]
}

export interface BatchLayout {
  /** catalog-relative batch root; index paths are relative to it */
  campaign: string
  root: string
  scene: string
}

/**
 * A batch-root-relative POSIX path made catalog-relative. Absolute paths, '..', backslashes,
 * drive letters and URLs are refused (null), so no reference can leave the batch root.
 */
export function resolveBatchPath(batchRoot: string, value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  if (value.includes('://') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return null
  const norm = normalizeRelPath(value)
  return norm === null ? null : join(batchRoot, norm)
}

const ROLE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic seeds',
  model_selection: 'Model-selection seeds',
  held_out: 'Held-out seeds',
}
const PROTOCOL_LABELS: Record<string, string> = {
  frozen_deterministic: 'Frozen deterministic',
  frozen_sampled: 'Frozen sampled',
  online_gated_v1: 'Online learning (gated v1)',
  online_sb3_v1: 'Online learning (SB3 v1)',
}
export const roleLabel = (role: string | null) =>
  role === null ? 'Unknown seed role' : (ROLE_LABELS[role] ?? role)
export const protocolLabel = (protocol: string | null) =>
  protocol === null ? 'Unknown protocol' : (PROTOCOL_LABELS[protocol] ?? protocol)

/** The fields of a version 5 online record the viewer uses; null with a reason otherwise. */
export function parseOnlineRecord(
  data: unknown,
  attemptDir: string | null
): { record: BatchOnlineRecord | null; issue: string | null } {
  if (!isRec(data)) return { record: null, issue: 'online_manifest.json is not a JSON object' }
  if (data.online_experiment_version !== BATCH_ONLINE_VERSION)
    return {
      record: null,
      issue: `unsupported online_experiment_version ${String(data.online_experiment_version)} (batch references need ${BATCH_ONLINE_VERSION})`,
    }
  const protocol = str(data.protocol)
  if (protocol === null) return { record: null, issue: 'online record has no protocol' }
  const evaluation = rec(data.evaluation)
  const leafPath = (value: unknown) => {
    const norm = typeof value === 'string' ? normalizeRelPath(value) : null
    return norm === null || attemptDir === null ? null : join(attemptDir, norm)
  }
  return {
    issue: null,
    record: {
      protocol,
      status: str(data.status),
      seed: int(data.seed),
      seedRole: str(data.seed_role),
      evaluationSeeds: ints(data.evaluation_seeds),
      settings: isRec(data.settings) ? data.settings : null,
      schedule: data.schedule ?? null,
      accounting: isRec(data.accounting) ? data.accounting : null,
      parentModelSha256: str(rec(data.parent).model_sha256),
      evalManifest: leafPath(evaluation.eval_manifest),
      episodeDir: leafPath(evaluation.episode_dir),
      decisions: int(evaluation.decisions),
      episodes: (Array.isArray(data.episodes) ? data.episodes : []).filter(isRec),
    },
  }
}

/** A reference's INI copy; its sha256 is part of the scientific identity. */
function parseConfig(
  catalog: ResultCatalog,
  batchRoot: string,
  value: unknown,
  issues: string[]
): BatchConfig | null {
  if (!isRec(value)) return null
  const path = resolveBatchPath(batchRoot, value.path)
  if (value.path != null && path === null)
    issues.push('config path is not a batch-relative path; it was not read')
  return {
    path,
    sha256: str(value.sha256),
    source: str(value.config_source),
    present: path !== null && catalog.has(path),
  }
}

/** Placement-baseline planning identity (geometric/optimization); absent for other policies. */
function parsePlanning(batchRoot: string, value: unknown, issues: string[]): BatchPlanning | null {
  if (!isRec(value)) return null
  const mapping = isRec(value.mapping_file) ? value.mapping_file : null
  const mappingPath = mapping ? resolveBatchPath(batchRoot, mapping.path) : null
  if (mapping && mapping.path != null && mappingPath === null)
    issues.push('planning mapping_file is not a batch-relative path; it was not read')
  return {
    planningSeed: int(value.planning_seed),
    planningSeedSource: str(value.planning_seed_source),
    plannerSettingsSha256: str(value.planner_settings_sha256),
    mappingFile: mapping ? { path: mappingPath, sha256: str(mapping.sha256) } : null,
  }
}

function parseReference(
  catalog: ResultCatalog,
  raw: Rec,
  kind: 'model' | 'baseline',
  batchRoot: string,
  policy: string,
  entryPlanning: unknown = null
): BatchReference {
  const issues = strs(raw.issues)
  const path = (field: string) => {
    const value = raw[field]
    if (value === null || value === undefined) return null
    const resolved = resolveBatchPath(batchRoot, value)
    if (resolved === null) issues.push(`${field} is not a batch-relative path; it was not read`)
    return resolved
  }
  const schedule = isRec(raw.schedule)
    ? { digest: str(raw.schedule.digest), kind: str(raw.schedule.kind) }
    : null
  const seed = int(raw.seed)
  const episodeDirs: string[] = []
  for (const entry of (Array.isArray(raw.episodes) ? raw.episodes : []).filter(isRec)) {
    if (entry.seed !== seed) continue
    const dir = resolveBatchPath(batchRoot, entry.episode_dir)
    if (dir === null) issues.push('episode_dir is not a batch-relative path; it was not read')
    else episodeDirs.push(dir)
  }
  return {
    kind,
    task: str(raw.task),
    key: str(raw.key),
    status: str(raw.status) ?? 'unknown',
    policy,
    role: str(raw.role),
    seed,
    mode: str(raw.mode),
    protocol: str(raw.protocol),
    operation: str(raw.operation),
    operationDigest: str(raw.operation_digest),
    schedule,
    group: str(raw.group),
    modelSha256: str(raw.model_sha256),
    physicalDigest: str(raw.physical_digest),
    config: parseConfig(catalog, batchRoot, raw.config, issues),
    planning: parsePlanning(batchRoot, raw.planning ?? entryPlanning, issues),
    attempt: path('attempt'),
    evalManifest: path('eval_manifest'),
    onlineManifest: path('online_manifest'),
    weightAudit: path('weight_audit'),
    manifestStatus: str(raw.manifest_status),
    episodeDirs,
    online: null,
    issues,
  }
}

/**
 * Seeds pool only when every scientific identity dimension agrees: the producer's group
 * digest plus model/checkpoint, role, mode, protocol, operation digest and schedule. A
 * reference without a group digest is never pooled.
 */
export function batchGroupKey(model: unknown[], ref: BatchReference): string {
  return JSON.stringify([
    ref.kind,
    model,
    ref.policy,
    ref.group ?? `ungrouped:${ref.task}:${ref.key}`,
    ref.role,
    ref.mode,
    ref.protocol,
    ref.operationDigest,
    ref.schedule?.digest ?? null,
    ref.modelSha256,
    ref.config?.sha256 ?? null,
    ref.planning
      ? [
          ref.planning.planningSeed,
          ref.planning.plannerSettingsSha256,
          ref.planning.mappingFile?.sha256 ?? null,
        ]
      : null,
  ])
}

async function readRec(catalog: ResultCatalog, path: string): Promise<Rec | null> {
  if (!catalog.has(path)) return null
  try {
    const data = await readJson(catalog, path)
    return isRec(data) ? data : null
  } catch {
    return null
  }
}

interface Leaf {
  ref: BatchReference
  eval: Rec | null
  online: BatchOnlineRecord | null
  /** the manifest episode entry for this reference's seed and policy */
  entry: Rec | null
  episodeDir: string | null
  usable: boolean
}

/** Read one reference's own manifests; never follows an absolute path recorded inside them. */
async function readLeaf(
  catalog: ResultCatalog,
  ref: BatchReference,
  helpers: BatchLoaderHelpers
): Promise<Leaf> {
  const leaf: Leaf = { ref, eval: null, online: null, entry: null, episodeDir: null, usable: false }
  if (ref.status === 'missing' || ref.status === 'skipped_selection') return leaf
  if (ref.evalManifest) {
    const data = await readRec(catalog, ref.evalManifest)
    if (!data) ref.issues.push(`${ref.evalManifest} is not in the selected folder or not readable`)
    else if (!helpers.evalManifestVersions.includes(data.eval_manifest_version as number))
      ref.issues.push(
        `${ref.evalManifest}: unsupported eval_manifest_version ${String(data.eval_manifest_version)}`
      )
    else leaf.eval = data
  }
  if (ref.onlineManifest) {
    const data = await readRec(catalog, ref.onlineManifest)
    if (!data)
      ref.issues.push(`${ref.onlineManifest} is not in the selected folder or not readable`)
    else {
      const parsed = parseOnlineRecord(data, ref.attempt)
      if (parsed.issue) ref.issues.push(`${ref.onlineManifest}: ${parsed.issue}`)
      else {
        const online = parsed.record!
        const mismatch = [
          online.protocol !== ref.protocol ? 'protocol' : null,
          online.seed !== ref.seed ? 'seed' : null,
          online.seedRole !== ref.role ? 'seed role' : null,
        ].filter(Boolean)
        if (mismatch.length)
          ref.issues.push(
            `${ref.onlineManifest} records a different ${mismatch.join(', ')} than the index`
          )
        else {
          leaf.online = online
          ref.online = online
        }
      }
    }
  }
  if (ref.evalManifest && !leaf.eval) return leaf
  if (ref.onlineManifest && !leaf.online) return leaf
  leaf.episodeDir = ref.episodeDirs[0] ?? null
  if (ref.episodeDirs.length > 1)
    ref.issues.push('several episodes recorded for one seed; only the first is shown')
  if (leaf.eval) {
    const block = rec(rec(leaf.eval.policies)[ref.policy])
    leaf.entry =
      (Array.isArray(block.episodes) ? block.episodes : [])
        .filter(isRec)
        .find((e) => e.seed === ref.seed) ?? null
  } else if (leaf.online) {
    const online = leaf.online
    const entry = online.episodes.find((e) => e.seed === ref.seed)
    if (entry) {
      // The v5 episode entry carries no per-episode status; the episode's own record does,
      // and otherwise the operation's status applies to its single episode.
      const record = leaf.episodeDir
        ? await readRec(catalog, join(leaf.episodeDir, 'rl_episode.json'))
        : null
      leaf.entry = {
        ...entry,
        status: str(record?.status) ?? online.status,
        decisions: record?.decisions ?? record?.steps ?? entry.decisions,
        reward_components_sum: record?.reward_components_sum,
        exit_code: record?.exit_code,
        metrics: {
          ...rec(entry.metrics),
          ...(typeof entry.update_cycles === 'number'
            ? { update_cycles: entry.update_cycles }
            : {}),
        },
      }
    }
  }
  if (!leaf.entry) ref.issues.push(`no ${ref.policy} episode for seed ${String(ref.seed)}`)
  else if (!leaf.episodeDir) ref.issues.push('the index records no episode directory')
  leaf.usable = leaf.entry !== null && leaf.episodeDir !== null
  return leaf
}

function commonDir(paths: string[], fallback: string): string {
  if (!paths.length) return fallback
  let parts = paths[0].split('/')
  for (const p of paths.slice(1)) {
    const other = p.split('/')
    let i = 0
    while (i < parts.length && parts[i] === other[i]) i++
    parts = parts.slice(0, i)
  }
  return parts.length ? parts.join('/') : fallback
}

function viewStatus(refs: BatchReference[]): BatchView['status'] {
  const active = refs.filter((r) => r.status !== 'skipped_selection')
  if (!active.length) return 'skipped_selection'
  return active.every((r) => r.status === 'complete' && r.issues.length === 0)
    ? 'complete'
    : 'incomplete'
}

function assetsOf(catalog: ResultCatalog, batchRoot: string, assets: Rec): BatchAsset[] {
  const out: BatchAsset[] = []
  const add = (name: string, value: unknown) => {
    if (!isRec(value)) return
    const raw = value.path
    const path = resolveBatchPath(batchRoot, raw)
    // reference.json is not one of the files a folder catalog indexes, so its presence is unknown
    const indexed = path !== null && !path.endsWith('/reference.json')
    out.push({
      name,
      path,
      sha256: str(value.sha256),
      present: path === null ? false : indexed ? catalog.has(path) : null,
    })
  }
  const ini = (prefix: string, value: unknown) => {
    for (const name of ['run_config', 'nodes', 'buildings', 'jammers'])
      add(`${prefix}${name}`, rec(value)[name])
  }
  ini('', assets.run_config)
  for (const [role, seeds] of Object.entries(rec(assets.configs)))
    for (const [seed, value] of Object.entries(rec(seeds))) ini(`${role}/${seed}/`, value)
  add('reference', assets.reference)
  return out
}

/** Load a version 4 scenario index into the same Experiment shape the legacy loader returns. */
export async function loadBatchMissionScenario(
  catalog: ResultCatalog,
  layout: BatchLayout,
  index: Rec,
  marker: string,
  buildingsByDir: Map<string, string[]>,
  helpers: BatchLoaderHelpers
): Promise<Experiment> {
  const batchRoot = layout.campaign
  const batch = rec(index.batch)
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
    artifacts: [{ artifact: 'campaign', path: marker, present: true, usable: true, message: null }],
  }
  if (index.scene !== layout.scene)
    experiment.issues.push(
      `${marker} names scene ${String(index.scene)}, not its folder ${layout.scene}`
    )
  const seeds: Record<string, number[]> = {}
  for (const [role, value] of Object.entries(rec(index.seeds))) seeds[role] = ints(value)
  const assets = assetsOf(catalog, batchRoot, rec(index.assets))
  const info: BatchIndexInfo = {
    name: str(batch.name),
    kind: str(batch.kind),
    plan: resolveBatchPath(batchRoot, batch.plan),
    matrixSha256: str(batch.matrix_sha256),
    incomplete: index.incomplete !== false,
    missing: strs(index.missing),
    issues: strs(index.issues),
    seeds,
    assets,
    views: [],
  }
  experiment.batch = info
  for (const issue of info.issues) experiment.issues.push(`Batch index: ${issue}`)
  if (info.missing.length)
    experiment.issues.push(
      `${info.missing.length} planned result${info.missing.length === 1 ? ' has' : 's have'} no accepted output yet: ${info.missing.join(', ')}`
    )
  for (const asset of assets)
    if (asset.present === false)
      experiment.issues.push(
        asset.path === null
          ? `Scenario asset ${asset.name} has no batch-relative copy`
          : `Scenario asset ${asset.name} (${asset.path}) is not in the selected folder`
      )

  // Baselines: one view per (policy, role, group); read once, attached by role and seed.
  const baselineLeaves = new Map<string, { view: BatchView; leaves: Leaf[] }>()
  for (const entry of (Array.isArray(index.baselines) ? index.baselines : []).filter(isRec)) {
    const policy = str(entry.policy)
    if (policy === null) {
      experiment.issues.push('A baseline entry has no policy.')
      continue
    }
    for (const raw of (Array.isArray(entry.evaluations) ? entry.evaluations : []).filter(isRec)) {
      const ref = parseReference(catalog, raw, 'baseline', batchRoot, policy, entry.planning)
      const key = batchGroupKey([], ref)
      let group = baselineLeaves.get(key)
      if (!group) {
        group = {
          leaves: [],
          view: {
            kind: 'baseline',
            evaluationKeys: [],
            group: ref.group,
            label: `${policy} · ${roleLabel(ref.role)}${ref.planning?.planningSeed != null ? ` · planning seed ${ref.planning.planningSeed}` : ''}`,
            role: ref.role,
            mode: 'baseline',
            protocol: null,
            operation: null,
            schedule: null,
            checkpoint: null,
            trainingSeed: null,
            seedSegment: null,
            modelSha256: null,
            config: ref.config,
            planning: ref.planning,
            policy,
            completedSeeds: [],
            references: [],
            status: 'incomplete',
          },
        }
        baselineLeaves.set(key, group)
      }
      if (group.leaves.some((l) => l.ref.seed === ref.seed)) {
        ref.issues.push('repeats a seed already in this group; attempts are never pooled')
        group.view.references.push(ref)
        continue
      }
      group.view.references.push(ref)
      group.leaves.push(await readLeaf(catalog, ref, helpers))
    }
  }
  const baselineViews = [...baselineLeaves.values()]
  for (const { view, leaves } of baselineViews) {
    view.completedSeeds = leaves
      .filter((l) => l.usable && l.entry?.status === 'completed')
      .map((l) => l.ref.seed!)
    view.status = viewStatus(view.references)
  }

  const attachBaselines = (evaluation: Evaluation, role: string | null, wanted: Set<number>) => {
    const byPolicy = new Map<string, typeof baselineViews>()
    for (const group of baselineViews.filter((g) => g.view.role === role))
      byPolicy.set(group.view.policy, [...(byPolicy.get(group.view.policy) ?? []), group])
    const attached: BatchReference[] = []
    for (const [policy, groups] of byPolicy) {
      if (groups.length > 1) {
        experiment.issues.push(
          `Baseline ${policy} has ${groups.length} differently identified groups for ${roleLabel(role)}; none is shown beside the models.`
        )
        continue
      }
      const [{ view, leaves }] = groups
      const used = leaves.filter((l) => l.ref.seed !== null && wanted.has(l.ref.seed))
      if (!used.length) continue
      evaluation.policies.push(policy)
      // Each leaf records one seed; no pooled summary is recorded, so none is shown.
      evaluation.policySummaries[policy] = null
      view.evaluationKeys.push(evaluation.key)
      for (const leaf of used) {
        attached.push(leaf.ref)
        if (!leaf.usable) continue
        const scratch = helpers.createEvaluation(evaluation.label, null, '')
        if (leaf.eval) helpers.applyManifest(scratch, leaf.eval)
        evaluation.episodes.push(
          helpers.build(
            catalog,
            { ...evaluation, scenarioIdentity: scratch.scenarioIdentity ?? null },
            policy,
            leaf.entry!,
            buildingsByDir,
            false,
            leaf.episodeDir!
          )
        )
      }
    }
    return attached
  }

  const labels = new Set<string>()
  const roleHasModels = new Set<string | null>()
  const trainedTasks = new Set<string>()
  const trainingTasks = new Set<string>()
  const models = (Array.isArray(index.models) ? index.models : []).filter(isRec)
  if (!models.length && !baselineViews.length)
    experiment.issues.push('No models or baselines are recorded for this scenario.')
  for (const model of models) {
    const training = rec(model.training)
    const source = rec(model.model_source)
    const binding = rec(model.model)
    const trainingTask = str(training.task)
    if (trainingTask) {
      trainingTasks.add(trainingTask)
      if (training.status === 'complete') trainedTasks.add(trainingTask)
    }
    if (training.status && training.status !== 'complete' && trainingTask)
      experiment.issues.push(`${trainingTask}: training is ${String(training.status)}`)
    const trainingSeed = int(model.training_seed) ?? int(source.seed)
    const checkpoint = str(model.checkpoint)
    const row = str(model.row) ?? str(model.reward) ?? 'model'
    const seedSegment =
      str(model.seed_segment) ?? (trainingSeed === null ? null : `train-seed-${trainingSeed}`)
    const identity = [row, trainingSeed, str(source.digest), checkpoint]
    const trainingRunDir = resolveBatchPath(batchRoot, training.attempt)
    const groups = new Map<string, BatchReference[]>()
    for (const raw of (Array.isArray(model.evaluations) ? model.evaluations : []).filter(isRec)) {
      const ref = parseReference(catalog, raw, 'model', batchRoot, 'model')
      const key = batchGroupKey(identity, ref)
      groups.set(key, [...(groups.get(key) ?? []), ref])
    }
    // Schema and contract metadata is per model; an online-only protocol has no eval manifest.
    const modelLeaves = new Map<BatchReference, Leaf>()
    for (const refs of groups.values()) {
      const seen = new Set<number | null>()
      for (const ref of refs.sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))) {
        if (seen.has(ref.seed)) {
          ref.issues.push('repeats a seed already in this group; attempts are never pooled')
          continue
        }
        seen.add(ref.seed)
        modelLeaves.set(ref, await readLeaf(catalog, ref, helpers))
      }
    }
    const modelMeta = helpers.createEvaluation('', null, '')
    const firstEval = [...modelLeaves.values()].find((l) => l.eval)?.eval
    if (firstEval) helpers.applyManifest(modelMeta, firstEval)

    for (const refs of groups.values()) {
      const first = refs[0]
      const leaves = refs.map((r) => modelLeaves.get(r)).filter((l): l is Leaf => Boolean(l))
      const view: BatchView = {
        kind: 'model',
        evaluationKeys: [],
        group: first.group,
        label: '',
        role: first.role,
        mode: first.mode,
        protocol: first.protocol,
        operation: first.operation,
        schedule: first.schedule,
        checkpoint,
        trainingSeed,
        seedSegment,
        modelSha256: first.modelSha256,
        config: first.config,
        planning: null,
        policy: 'model',
        completedSeeds: leaves
          .filter((l) => l.usable && l.entry?.status === 'completed')
          .map((l) => l.ref.seed!),
        references: refs,
        status: viewStatus(refs),
      }
      info.views.push(view)
      if (view.status === 'skipped_selection') continue
      const ownMeta = helpers.createEvaluation('', null, '')
      const ownEval = leaves.find((l) => l.eval)?.eval
      if (ownEval) helpers.applyManifest(ownMeta, ownEval)
      const meta = ownEval ? ownMeta : modelMeta
      const rewardName = str(model.reward_label) ?? staticRewardLabel(meta.rewardSchema) ?? row
      const ppo = str(model.ppo_label) ?? `PPO (${str(model.profile) ?? 'profile not recorded'})`
      const operationText = `${protocolLabel(view.protocol)}${view.schedule ? ` · ${view.schedule.kind ?? 'schedule'} schedule` : ''}`
      let label = [
        rewardName,
        ppo,
        seedSegment ?? 'model',
        `checkpoint ${checkpoint ?? '?'}`,
        operationText,
        roleLabel(view.role),
      ].join(' · ')
      // Leaves that differ only in their INI copy (e.g. per-row configs) stay apart and say so
      if (labels.has(label) && view.config?.sha256)
        label = `${label} · ${view.config.source ?? 'unrecorded'} INI ${view.config.sha256.slice(0, 12)}`
      if (labels.has(label)) label = `${label} · ${(view.group ?? first.task ?? '').slice(0, 10)}`
      labels.add(label)
      view.label = label
      const attempts = refs.map((r) => r.attempt).filter((p): p is string => p !== null)
      const evaluation = helpers.createEvaluation(
        label,
        trainingSeed,
        commonDir(attempts, layout.root)
      )
      view.evaluationKeys.push(evaluation.key)
      evaluation.declared = true
      evaluation.contract = meta.contract
      evaluation.observationSchema = meta.observationSchema
      evaluation.rewardSchema = meta.rewardSchema
      evaluation.selection = meta.selection ?? model.selection ?? null
      evaluation.metricSource = meta.metricSource
      evaluation.compatibilityNote = meta.compatibilityNote
      evaluation.scenarioIdentity = meta.scenarioIdentity ?? null
      evaluation.modelSelection = str(binding.model_selection) ?? meta.modelSelection
      evaluation.modelSha256 = view.modelSha256 ?? str(binding.model_sha256)
      evaluation.trainingRunDir = trainingRunDir
      evaluation.heldOut = view.role === 'held_out'
      evaluation.heldOutSeeds =
        view.role === 'held_out'
          ? refs.map((r) => r.seed).filter((s): s is number => s !== null)
          : []
      evaluation.policies = ['model']
      evaluation.policySummaries = { model: null }
      evaluation.missionKind = str(index.objective) ?? undefined
      evaluation.stage = str(model.stage) ?? undefined
      evaluation.missionTags = batchMissionMetadata(model, info.name, meta.rewardSchema)
      evaluation.missionVariantKey = `${row}:${checkpoint ?? '?'}:${view.operation ?? view.protocol}:${view.role}`
      evaluation.missionPpoLabel = `${ppo} · checkpoint ${checkpoint ?? '?'} · ${roleLabel(view.role)}`
      const online = leaves.find((l) => l.online)?.online ?? null
      evaluation.provenance = {
        kind:
          view.mode === 'online' ? 'online' : view.protocol === 'frozen_sampled' ? 'fixed' : 'new',
        profile: str(model.profile),
        settings:
          view.mode === 'online' ? (online?.settings ?? null) : isRec(model.ppo) ? model.ppo : null,
        description:
          view.mode === 'online'
            ? `Weights update during the episode; each seed reloads the bound checkpoint ${checkpoint ?? '?'} and its optimizer.`
            : `Frozen checkpoint ${checkpoint ?? '?'}${view.protocol === 'frozen_sampled' ? ' with sampled actions' : ' with deterministic actions'}${view.schedule ? ` under a ${view.schedule.kind ?? 'recorded'} schedule` : ''}; weights unchanged.`,
      }
      evaluation.batch = { name: info.name, view }
      for (const leaf of leaves) {
        if (!leaf.usable) continue
        evaluation.episodes.push(
          helpers.build(
            catalog,
            evaluation,
            'model',
            leaf.entry!,
            buildingsByDir,
            false,
            leaf.episodeDir!
          )
        )
      }
      const wanted = new Set(
        refs
          .filter((r) => r.status !== 'skipped_selection')
          .map((r) => r.seed)
          .filter((s): s is number => s !== null)
      )
      roleHasModels.add(view.role)
      finishEvaluation(evaluation, [...refs, ...attachBaselines(evaluation, view.role, wanted)])
      experiment.evaluations.push(evaluation)
    }
  }
  // Baselines of a role with no model evaluation still get their own view.
  for (const role of [...new Set(baselineViews.map((g) => g.view.role))]) {
    if (roleHasModels.has(role)) continue
    const label = `Baselines · ${roleLabel(role)}`
    const evaluation = helpers.createEvaluation(label, null, join(batchRoot, 'baselines'))
    evaluation.declared = true
    evaluation.heldOut = role === 'held_out'
    evaluation.missionKind = str(index.objective) ?? undefined
    const refs = baselineViews.filter((g) => g.view.role === role).flatMap((g) => g.view.references)
    const wanted = new Set(refs.map((r) => r.seed).filter((s): s is number => s !== null))
    finishEvaluation(evaluation, attachBaselines(evaluation, role, wanted))
    experiment.evaluations.push(evaluation)
  }
  info.views.push(...baselineViews.map((g) => g.view))
  for (const view of info.views)
    for (const ref of view.references)
      for (const issue of ref.issues) experiment.issues.push(`${ref.task ?? 'reference'}: ${issue}`)

  const status = rec(await readRec(catalog, join(batchRoot, 'campaign_status.json')))
  experiment.campaignProgress = {
    status:
      status.campaign_version === 2 && typeof status.state === 'string'
        ? status.state
        : info.incomplete
          ? 'incomplete'
          : 'completed',
    trained: trainedTasks.size,
    expected: trainingTasks.size,
  }
  return experiment
}

/** State and counts from explicit references; an absent result never becomes a zero. */
function finishEvaluation(evaluation: Evaluation, refs: BatchReference[]) {
  const active = refs.filter((r) => r.status !== 'skipped_selection')
  evaluation.episodesExpected = active.length
  evaluation.episodesCompleted = evaluation.episodes.filter((e) => e.status === 'completed').length
  const incomplete = active.filter((r) => r.status !== 'complete' || r.issues.length > 0)
  const statuses = [...new Set(active.map((r) => r.manifestStatus))]
  evaluation.simulatorStatus = statuses.length === 1 ? statuses[0] : null
  if (!incomplete.length && evaluation.episodesCompleted === evaluation.episodesExpected) {
    evaluation.state = 'ok'
    evaluation.message = null
    return
  }
  evaluation.state = 'incomplete'
  const missing = incomplete.filter((r) => r.status === 'missing')
  evaluation.message =
    `${evaluation.episodesCompleted} of ${evaluation.episodesExpected} episodes completed` +
    (missing.length
      ? `; no accepted result yet for ${missing.map((r) => `seed ${String(r.seed)}`).join(', ')}`
      : '') +
    (incomplete.length > missing.length
      ? `; ${incomplete.length - missing.length} reference(s) incomplete`
      : '')
}
