import { normalizeRelPath } from './resultCatalog.ts'

// Phase 1 baseline producer contract (baseline_manifest.json v1, baseline-plan.json v1).
// Parsing never throws on unknown strings: they are kept raw (sanitized) so a newer
// producer still renders with neutral labels. Absent or non-numeric values are null;
// zero is never substituted. Host paths recorded in the manifest are never resolved.

export const SUPPORTED_BASELINE_MANIFEST_VERSION = 1
export const SUPPORTED_BASELINE_PLAN_VERSION = 1

export type BaselineStatus =
  | 'preparing'
  | 'prepared'
  | 'running'
  | 'complete'
  | 'failed'
  | 'interrupted'
export type BaselineSeedStatus = 'complete' | 'missing' | 'failed'
export type BaselineMode = 'standalone' | 'evaluation'

const BASELINE_STATUSES: readonly BaselineStatus[] = [
  'preparing',
  'prepared',
  'running',
  'complete',
  'failed',
  'interrupted',
]
const SEED_STATUSES: readonly BaselineSeedStatus[] = ['complete', 'missing', 'failed']
const MODES: readonly BaselineMode[] = ['standalone', 'evaluation']

export interface ScenarioIdentity {
  runIniSha256: string | null
  nodesJsonSha256: string | null
  buildingsJsonSha256: string | null
  jammersJsonSha256: string | null
}

export interface BaselineSeedRecord {
  seed: number
  status: BaselineSeedStatus | 'unknown'
  rawStatus: string | null
  /** validated run-relative path or null; never dereferenced in Phase 2 */
  summaryRef: string | null
}

export interface BaselineManifest {
  version: 1
  runId: string | null
  mode: BaselineMode | 'unknown'
  requestedAlgorithm: string | null
  /** raw, sanitized */
  method: string | null
  /** raw, sanitized */
  objective: string | null
  application: string | null
  executor: string | null
  startedAt: string | null
  endedAt: string | null
  status: BaselineStatus | 'unknown'
  rawStatus: string | null
  error: string | null
  plannerSeed: number | null
  plannerSeedStatus: string | null
  maxIterations: number | null
  maxIterationsStatus: string | null
  fingerprint: string | null
  mappingSha256: string | null
  simBinarySha256: string | null
  /** from planner_source.aggregate_sha256, else null */
  plannerSourceSha256: string | null
  /** from rf.sha256 if rf is an object with a string sha256, else null */
  rfConfigSha256: string | null
  sourceScenarioIdentity: ScenarioIdentity | null
  effectiveScenarioIdentity: ScenarioIdentity | null
  /** only string-valued entries kept */
  packageVersions: Record<string, string>
  simulationSeeds: number[] | null
  initialDisplacementMTotal: number | null
  plannerWallS: number | null
  /** validated run-relative path (e.g. "effective-inputs/baseline-plan.json") or null */
  planRef: string | null
  seeds: BaselineSeedRecord[]
}

export interface BaselinePlanNode {
  id: string
  rosterIndex: number | null
  slot: number | null
  role: string | null
  platform: string | null
  selected: boolean
  original: { x: number; y: number; z: number } | null
  planned: { x: number; y: number; z: number } | null
  displacementM: number | null
}

export interface BaselinePlan {
  version: 1
  method: string | null
  objective: string | null
  nodes: BaselinePlanNode[]
  initialDisplacementMTotal: number | null
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string }

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

const MAX_LABEL = 32
const MAX_TEXT = 512
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g

/** string → trim, strip control chars, max 32 chars; anything else → null */
export function sanitizeLabel(v: unknown): string | null {
  return sanitizeText(v, MAX_LABEL)
}

/** Longer free text (errors, ids, hashes, timestamps): same cleaning, larger cap. */
export function sanitizeText(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== 'string') return null
  const cleaned = v.replace(CONTROL_CHARS, '').trim()
  if (cleaned === '') return null
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned
}

/** finite number → v; else null (strings are NOT coerced) */
export function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function enumOrUnknown<T extends string>(v: unknown, allowed: readonly T[]): T | 'unknown' {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : 'unknown'
}

function scenarioIdentity(v: unknown): ScenarioIdentity | null {
  if (!isRec(v)) return null
  const hash = (key: string) => sanitizeText(v[key], 128)
  return {
    runIniSha256: hash('run_ini_sha256'),
    nodesJsonSha256: hash('nodes_json_sha256'),
    buildingsJsonSha256: hash('buildings_json_sha256'),
    jammersJsonSha256: hash('jammers_json_sha256'),
  }
}

function packageVersions(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isRec(v)) return out
  for (const [key, value] of Object.entries(v)) {
    const text = sanitizeText(value, 64)
    if (text !== null) out[key] = text
  }
  return out
}

function numberList(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
}

function seedRecords(v: unknown): BaselineSeedRecord[] {
  if (!Array.isArray(v)) return []
  const out: BaselineSeedRecord[] = []
  for (const entry of v) {
    if (!isRec(entry)) continue
    const seed = numberOrNull(entry.seed)
    if (seed === null) continue
    out.push({
      seed,
      status: enumOrUnknown(entry.status, SEED_STATUSES),
      rawStatus: sanitizeLabel(entry.status),
      summaryRef: resolveRef('', entry.summary),
    })
  }
  return out
}

/**
 * Joins a manifest-recorded relative reference onto a validated catalog root.
 * Both the reference and the joined result must pass normalizeRelPath; absolute,
 * drive-letter, backslash, NUL and `..` references all yield null. A root of ''
 * means the catalog root and never produces a leading slash.
 */
export function resolveRef(root: string, ref: unknown): string | null {
  if (typeof ref !== 'string') return null
  const rel = normalizeRelPath(ref)
  if (rel === null) return null
  if (root === '') return rel
  const base = normalizeRelPath(root)
  if (base === null) return null
  return normalizeRelPath(`${base}/${rel}`)
}

function parseJsonObject(text: string): ParseResult<Rec> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid JSON' }
  }
  if (!isRec(data)) return { ok: false, reason: 'not an object' }
  return { ok: true, value: data }
}

export function parseBaselineManifest(text: string): ParseResult<BaselineManifest> {
  const parsed = parseJsonObject(text)
  if (!parsed.ok) return parsed
  const d = parsed.value
  const version = d.baseline_manifest_version
  if (version !== SUPPORTED_BASELINE_MANIFEST_VERSION) {
    return {
      ok: false,
      reason: `unsupported baseline_manifest_version: ${version === undefined ? 'missing' : String(version)}`,
    }
  }
  const plannerSource = isRec(d.planner_source) ? d.planner_source : null
  const rf = isRec(d.rf) ? d.rf : null
  return {
    ok: true,
    value: {
      version: 1,
      runId: sanitizeText(d.run_id, 128),
      mode: enumOrUnknown(d.mode, MODES),
      requestedAlgorithm: sanitizeLabel(d.requested_algorithm),
      method: sanitizeLabel(d.method),
      objective: sanitizeLabel(d.objective),
      application: sanitizeLabel(d.application),
      executor: sanitizeLabel(d.executor),
      startedAt: sanitizeText(d.started_at, 64),
      endedAt: sanitizeText(d.ended_at, 64),
      status: enumOrUnknown(d.status, BASELINE_STATUSES),
      rawStatus: sanitizeLabel(d.status),
      error: sanitizeText(d.error),
      plannerSeed: numberOrNull(d.planner_seed),
      plannerSeedStatus: sanitizeLabel(d.planner_seed_status),
      maxIterations: numberOrNull(d.max_iterations),
      maxIterationsStatus: sanitizeLabel(d.max_iterations_status),
      fingerprint: sanitizeText(d.fingerprint, 128),
      mappingSha256: sanitizeText(d.mapping_sha256, 128),
      simBinarySha256: sanitizeText(d.sim_binary_sha256, 128),
      plannerSourceSha256: plannerSource ? sanitizeText(plannerSource.aggregate_sha256, 128) : null,
      rfConfigSha256: rf ? sanitizeText(rf.sha256, 128) : null,
      sourceScenarioIdentity: scenarioIdentity(d.source_scenario_identity),
      effectiveScenarioIdentity: scenarioIdentity(d.effective_scenario_identity),
      packageVersions: packageVersions(d.package_versions),
      simulationSeeds: numberList(d.simulation_seeds),
      initialDisplacementMTotal: numberOrNull(d.initial_displacement_m_total),
      plannerWallS: numberOrNull(d.planner_wall_s),
      planRef: resolveRef('', d.plan),
      seeds: seedRecords(d.seeds),
    },
  }
}

function point(v: unknown): { x: number; y: number; z: number } | null {
  if (!isRec(v)) return null
  const x = numberOrNull(v.x)
  const y = numberOrNull(v.y)
  const z = numberOrNull(v.z)
  return x === null || y === null || z === null ? null : { x, y, z }
}

export function parseBaselinePlan(text: string): ParseResult<BaselinePlan> {
  const parsed = parseJsonObject(text)
  if (!parsed.ok) return parsed
  const d = parsed.value
  const version = d.baseline_plan_version
  if (version !== SUPPORTED_BASELINE_PLAN_VERSION) {
    return {
      ok: false,
      reason: `unsupported baseline_plan_version: ${version === undefined ? 'missing' : String(version)}`,
    }
  }
  if (!Array.isArray(d.nodes)) return { ok: false, reason: 'nodes is not an array' }
  const nodes: BaselinePlanNode[] = []
  for (const entry of d.nodes) {
    if (!isRec(entry)) continue
    const id = sanitizeText(entry.id, 64)
    if (id === null) continue
    nodes.push({
      id,
      rosterIndex: numberOrNull(entry.roster_index),
      slot: numberOrNull(entry.slot),
      role: sanitizeLabel(entry.role),
      platform: sanitizeLabel(entry.platform),
      selected: entry.selected === true,
      original: point(entry.original),
      planned: point(entry.planned),
      displacementM: numberOrNull(entry.displacement_m),
    })
  }
  return {
    ok: true,
    value: {
      version: 1,
      method: sanitizeLabel(d.method),
      objective: sanitizeLabel(d.objective),
      nodes,
      initialDisplacementMTotal: numberOrNull(d.initial_displacement_m_total),
    },
  }
}

export type IdentityCheck = Record<keyof ScenarioIdentity, 'match' | 'mismatch' | 'unknown'>

const IDENTITY_KEYS: (keyof ScenarioIdentity)[] = [
  'runIniSha256',
  'nodesJsonSha256',
  'buildingsJsonSha256',
  'jammersJsonSha256',
]

/** Per-hash comparison; a null on either side is unknown, never a match. */
export function compareScenarioIdentity(
  a: ScenarioIdentity | null,
  b: ScenarioIdentity | null
): IdentityCheck {
  const out = {} as IdentityCheck
  for (const key of IDENTITY_KEYS) {
    const left = a?.[key] ?? null
    const right = b?.[key] ?? null
    out[key] = left === null || right === null ? 'unknown' : left === right ? 'match' : 'mismatch'
  }
  return out
}
