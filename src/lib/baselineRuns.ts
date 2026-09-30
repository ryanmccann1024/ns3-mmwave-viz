import type { ResultCatalog } from './resultCatalog.ts'
import type { RunEntry } from './assembleRuns.ts'
import type { BaselineManifest, BaselineSeedRecord } from './baselineManifest.ts'
import { parseBaselineManifest, resolveRef } from './baselineManifest.ts'

// Standalone baseline runs (outputs/.../YYYY-MM/DD/HH-MM-SS-baseline[-N]/baseline_manifest.json).
// Discovery is catalog-driven and reads only the manifests; the Runs loader keeps owning the
// playable CSV pairs, and attachBaselineMeta reconciles the two by full run directory.

export interface BaselineRun {
  /** full catalog-relative path ending "YYYY-MM/DD/<dirname>" */
  runDir: string
  yearMonth: string
  day: string
  /** full <dirname>, e.g. "12-00-00-baseline-2" */
  time: string
  /** runDir + "/baseline_manifest.json" */
  manifestPath: string
  manifest: BaselineManifest | null
  manifestError: string | null
  /** resolveRef(runDir, manifest.planRef) or null */
  planPath: string | null
}

export interface BaselineRunMeta {
  runDir: string
  manifest: BaselineManifest | null
  manifestError: string | null
  planPath: string | null
  /** manifest.seeds entry matching this RunEntry.seed, if any */
  seedRecord: BaselineSeedRecord | null
}

export const BASELINE_MANIFEST_PATH_RE =
  /^(?:.*\/)?(\d{4}-\d{2})\/(\d{2})\/([^/]+)\/baseline_manifest\.json$/

const MANIFEST_NAME = 'baseline_manifest.json'
const EPISODE_DIR = /^episode-\d+$/

type Candidate = Omit<BaselineRun, 'manifest' | 'manifestError' | 'planPath'>

function candidate(path: string): Candidate | null {
  const match = BASELINE_MANIFEST_PATH_RE.exec(path)
  if (!match) return null
  const [, yearMonth, day, time] = match
  // Evaluation-owned manifests live at <method>/baseline/baseline_manifest.json
  if (time === 'baseline') return null
  if (path.split('/').some((segment) => EPISODE_DIR.test(segment))) return null
  const runDir = path.slice(0, -(MANIFEST_NAME.length + 1))
  return { runDir, yearMonth, day, time, manifestPath: path }
}

async function readManifest(catalog: ResultCatalog, c: Candidate): Promise<BaselineRun | null> {
  const base = { ...c, manifest: null, manifestError: null, planPath: null }
  let text: string
  try {
    const file = await catalog.getFile(c.manifestPath)
    if (!file) return { ...base, manifestError: 'manifest not readable' }
    text = await file.text()
  } catch {
    // The thrown message may carry a local path, so it is not surfaced
    return { ...base, manifestError: 'manifest not readable' }
  }
  const parsed = parseBaselineManifest(text)
  if (!parsed.ok) return { ...base, manifestError: parsed.reason }
  const manifest = parsed.value
  // Evaluation baselines belong to their evaluation, not to Runs/Home
  if (manifest.mode === 'evaluation') return null
  return { ...base, manifest, planPath: resolveRef(c.runDir, manifest.planRef) }
}

/**
 * Finds standalone baseline manifests in the catalog and parses each one. A failure for
 * one manifest is kept on that run as manifestError; an unexpected catalog-wide failure
 * (e.g. paths() throwing) propagates to the caller.
 */
export async function discoverBaselineRuns(catalog: ResultCatalog): Promise<BaselineRun[]> {
  const candidates = catalog
    .paths()
    .map(candidate)
    .filter((c): c is Candidate => c !== null)
  const runs = await Promise.all(candidates.map((c) => readManifest(catalog, c)))
  return runs
    .filter((r): r is BaselineRun => r !== null)
    .sort((a, b) => (a.runDir < b.runDir ? -1 : a.runDir > b.runDir ? 1 : 0))
}

const seedNumber = (seed: string) => Number(seed.replace(/^seed-/, ''))

/**
 * Attaches baseline metadata to the playable runs of the same run directory. Never adds
 * or removes runs: result.runs keeps the input length, order and keys. Point runs do not
 * match. Baselines with no playable run are returned as unplayable.
 */
export function attachBaselineMeta(
  runs: RunEntry[],
  baselines: BaselineRun[]
): { runs: RunEntry[]; unplayable: BaselineRun[] } {
  const byDir = new Map<string, BaselineRun>()
  for (const b of baselines) if (!byDir.has(b.runDir)) byDir.set(b.runDir, b)
  const matched = new Set<BaselineRun>()
  const out = runs.map((run) => {
    if (run.point !== undefined) return run
    const baseline = byDir.get(run.runDir)
    if (!baseline) return run
    matched.add(baseline)
    const seed = seedNumber(run.seed)
    const seedRecord = baseline.manifest?.seeds.find((s) => s.seed === seed) ?? null
    const meta: BaselineRunMeta = {
      runDir: baseline.runDir,
      manifest: baseline.manifest,
      manifestError: baseline.manifestError,
      planPath: baseline.planPath,
      seedRecord,
    }
    return { ...run, baseline: meta }
  })
  return { runs: out, unplayable: baselines.filter((b) => !matched.has(b)) }
}

/** Manifest seed records with no playable CSV pair among the given seed numbers. */
export function unmatchedSeedRecords(
  baseline: BaselineRun,
  playableSeeds: number[]
): BaselineSeedRecord[] {
  const playable = new Set(playableSeeds)
  return (baseline.manifest?.seeds ?? []).filter((s) => !playable.has(s.seed))
}
