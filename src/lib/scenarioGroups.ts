import type { RunEntry } from './assembleRuns.ts'
import type { BaselineRun } from './baselineRuns.ts'

// Pure grouping for the Runs and Home pages: batches (YYYY-MM/DD) and scenarios (one run
// directory, optionally one point). Kept free of React so the Node test runner can import it.

export interface Scenario {
  /** `${runDir}/${point ?? ''}` for playable scenarios; the bare runDir for unplayable ones */
  key: string
  name: string
  batch: string
  runDir: string
  point?: string
  buildings: boolean
  /** empty for a baseline run that produced no playable telemetry */
  runs: RunEntry[]
  /** set only on an unplayable baseline scenario; playable seeds carry RunEntry.baseline */
  baseline?: BaselineRun
}

const batchOf = (r: { yearMonth: string; day: string }) => `${r.yearMonth}/${r.day}`

/**
 * Runs grouped by their batch folder, newest batch first. A batch that holds only
 * unplayable baselines is still listed, with an empty run list.
 */
export function groupRuns(
  runs: RunEntry[],
  unplayable: BaselineRun[] = []
): [string, RunEntry[]][] {
  const map = new Map<string, RunEntry[]>()
  for (const r of runs) {
    const g = batchOf(r)
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(r)
  }
  for (const b of unplayable) {
    const g = batchOf(b)
    if (!map.has(g)) map.set(g, [])
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
}

/** The unplayable baselines that belong to one batch (as keyed by groupRuns). */
export function unplayableForBatch(unplayable: BaselineRun[], batch: string): BaselineRun[] {
  return unplayable.filter((b) => batchOf(b) === batch)
}

const seedNumber = (seed: string) => seed.replace(/^seed-/, '')
const sortKey = (s: Scenario) => `${s.batch}/${s.name}`

/**
 * Seeds of the same scenario collapse into one entry, in first-seen order. Unplayable
 * baselines become scenarios with no runs, merged in newest first; one whose run directory
 * already has a playable scenario is not emitted again.
 */
export function groupScenarios(runs: RunEntry[], unplayable: BaselineRun[] = []): Scenario[] {
  const map = new Map<string, Scenario>()
  for (const r of runs) {
    const key = `${r.runDir}/${r.point ?? ''}`
    let s = map.get(key)
    if (!s) {
      s = {
        key,
        name: r.time,
        batch: batchOf(r),
        runDir: r.runDir,
        point: r.point,
        buildings: false,
        runs: [],
      }
      map.set(key, s)
    }
    s.runs.push(r)
    s.buildings ||= Boolean(r.buildingsFile)
  }
  for (const s of map.values()) {
    s.runs.sort((a, b) =>
      seedNumber(a.seed).localeCompare(seedNumber(b.seed), undefined, { numeric: true })
    )
  }
  const playable = [...map.values()]
  const playableDirs = new Set(playable.map((s) => s.runDir))
  const seen = new Set<string>()
  const extra: Scenario[] = []
  for (const b of unplayable) {
    if (playableDirs.has(b.runDir) || seen.has(b.runDir)) continue
    seen.add(b.runDir)
    extra.push({
      key: b.runDir,
      name: b.time,
      batch: batchOf(b),
      runDir: b.runDir,
      buildings: false,
      runs: [],
      baseline: b,
    })
  }
  if (!extra.length) return playable
  extra.sort((a, b) => sortKey(b).localeCompare(sortKey(a)))

  // Stable merge: playables keep their order, each unplayable goes before the first
  // playable that sorts older than it
  const out: Scenario[] = []
  let j = 0
  for (const s of playable) {
    while (j < extra.length && sortKey(extra[j]).localeCompare(sortKey(s)) > 0) out.push(extra[j++])
    out.push(s)
  }
  while (j < extra.length) out.push(extra[j++])
  return out
}
