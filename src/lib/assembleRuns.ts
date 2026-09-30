import type { BaselineRunMeta } from './baselineRuns.ts'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------
export interface RunEntry {
  yearMonth: string
  day: string
  time: string
  seed: string
  point?: string
  key: string
  /**
   * Full catalog-relative timestamp directory taken from the file path, e.g.
   * '2026-09/30/12-00-00' or 'relocated/outputs/2026-09/30/12-00-00-baseline'.
   */
  runDir: string
  linksFile: File
  posFile: File
  buildingsFile?: File
  flowsFile?: File
  routesFile?: File
  nodesJsonFile?: File
  jammersJsonFile?: File
  mcsFile?: File
  rxPowerFile?: File
  /** Standalone baseline manifest metadata, attached after discovery */
  baseline?: BaselineRunMeta
}

export type FilePair = { path: string; file: File }

// -------------------------------------------------------------------------
// Parsing helpers — shared by both the classic <input> and FSA paths
// -------------------------------------------------------------------------
const SEED_LEVEL_FILES = new Set([
  'links.csv',
  'positions.csv',
  'buildings.json',
  'flows.csv',
  'routes.csv',
  'nodes.json',
  'jammers.json',
  'mcs.csv',
  'rx-power.csv',
])

function isKnownFile(fname: string): boolean {
  if (SEED_LEVEL_FILES.has(fname)) return true
  // Match buildings-*.json variants (e.g. buildings-wood.json, buildings-concrete.json)
  if (fname.startsWith('buildings') && fname.endsWith('.json')) return true
  return false
}

function isBuildingsFile(fname: string): boolean {
  return fname.startsWith('buildings') && fname.endsWith('.json')
}

const EPISODE_DIR = /^episode-\d+$/

/**
 * Legacy runs are <a>/<b>/<c>[/<point or batch>]/(seed-N|inputs)/file.
 * Experiment episodes (…/episode-NNNN/…) are excluded: their identity is the full
 * path, so they are neither grouped nor downloaded here.
 */
export function isLegacyRunPath(path: string): boolean {
  const parts = path.split('/')
  const parentIdx = parts.length - 2
  if (parentIdx < 3) return false
  const parent = parts[parentIdx]
  if (!parent.startsWith('seed-') && parent !== 'inputs' && parent !== 'input') return false
  return !parts.some((p) => EPISODE_DIR.test(p))
}

export function assembleRuns(pairs: FilePair[]): RunEntry[] {
  type Partial = {
    yearMonth: string
    day: string
    time: string
    seed: string
    point?: string
    key: string
    runDir: string
    links?: File
    pos?: File
    buildings?: File
    flows?: File
    routes?: File
    nodesJson?: File
    jammersJson?: File
    mcs?: File
    rxPower?: File
  }
  const byKey = new Map<string, Partial>()
  const sharedBuildings = new Map<string, File>()
  const sharedNodesJson = new Map<string, File>()
  const sharedJammersJson = new Map<string, File>()

  for (const { path, file } of pairs) {
    if (!isLegacyRunPath(path)) continue
    const parts = path.split('/')
    const fname = parts[parts.length - 1]

    // Seed-level files: .../YYYY-MM/DD/HH-MM-SS/seed-N/file
    //               or: .../YYYY-MM/DD/HH-MM-SS/point-NNN/seed-N/file
    if (isKnownFile(fname)) {
      const seedDir = parts[parts.length - 2]
      if (seedDir?.startsWith('seed-') && parts.length >= 4) {
        // Check if there's a point-NNN directory between timestamp and seed
        const seedIdx = parts.length - 2
        const beforeSeed = parts[seedIdx - 1]
        const hasPoint = beforeSeed?.startsWith('point-')

        const timeIdx = hasPoint ? seedIdx - 2 : seedIdx - 1
        const dayIdx = timeIdx - 1
        const ymIdx = timeIdx - 2

        if (ymIdx < 0) continue

        const ym = parts[ymIdx]
        const d = parts[dayIdx]
        const t = parts[timeIdx]
        const point = hasPoint ? beforeSeed : undefined
        // Keyed on the full directory so nested copies with the same dated suffix stay
        // distinct; a top-level run keeps its YYYY-MM/DD/time[/point]/seed-N key.
        const runDir = parts.slice(0, timeIdx + 1).join('/')
        const key = hasPoint ? `${runDir}/${beforeSeed}/${seedDir}` : `${runDir}/${seedDir}`

        if (!byKey.has(key))
          byKey.set(key, { yearMonth: ym, day: d, time: t, seed: seedDir, point, key, runDir })
        const entry = byKey.get(key)!
        if (fname === 'links.csv') entry.links = file
        if (fname === 'positions.csv') entry.pos = file
        if (isBuildingsFile(fname)) entry.buildings = file
        if (fname === 'flows.csv') entry.flows = file
        if (fname === 'routes.csv') entry.routes = file
        if (fname === 'nodes.json') entry.nodesJson = file
        if (fname === 'jammers.json') entry.jammersJson = file
        if (fname === 'mcs.csv') entry.mcs = file
        if (fname === 'rx-power.csv') entry.rxPower = file
      }
    }

    // Also check for buildings*.json / nodes.json inside inputs/ subfolder:
    // Timestamp level: YYYY-MM/DD/HH-MM-SS/inputs/buildings*.json
    // Point level:     YYYY-MM/DD/HH-MM-SS/point-NNN/inputs/buildings*.json
    if (isBuildingsFile(fname) || fname === 'nodes.json' || fname === 'jammers.json') {
      const parentDir = parts[parts.length - 2]
      if (parentDir === 'inputs' || parentDir === 'input') {
        // Check if this is point-level or timestamp-level
        const aboveInputs = parts[parts.length - 3]
        const isPointLevel = aboveInputs?.startsWith('point-')

        let dIdx: number, tIdx: number
        let pointDir: string | undefined
        if (isPointLevel) {
          pointDir = aboveInputs
          tIdx = parts.length - 4
          dIdx = parts.length - 5
        } else {
          tIdx = parts.length - 3
          dIdx = parts.length - 4
        }

        if (tIdx >= 0 && dIdx >= 0) {
          const runDir = parts.slice(0, tIdx + 1).join('/')

          // Build a shared key from the full run directory — include point if present
          const sharedKey = pointDir ? `${runDir}/${pointDir}` : runDir

          // Apply to matching seed runs already discovered
          for (const entry of byKey.values()) {
            const matches = entry.runDir === runDir && (!pointDir || entry.point === pointDir)
            if (matches) {
              if (isBuildingsFile(fname) && !entry.buildings) entry.buildings = file
              if (fname === 'nodes.json' && !entry.nodesJson) entry.nodesJson = file
              if (fname === 'jammers.json' && !entry.jammersJson) entry.jammersJson = file
            }
          }
          // Stash for runs discovered later in the loop
          if (isBuildingsFile(fname) && !sharedBuildings.has(sharedKey))
            sharedBuildings.set(sharedKey, file)
          if (fname === 'nodes.json' && !sharedNodesJson.has(sharedKey))
            sharedNodesJson.set(sharedKey, file)
          if (fname === 'jammers.json' && !sharedJammersJson.has(sharedKey))
            sharedJammersJson.set(sharedKey, file)
        }
      }
    }
  }

  // Apply shared files to any runs that don't have them yet
  for (const entry of byKey.values()) {
    const tsKey = entry.runDir
    const ptKey = entry.point ? `${tsKey}/${entry.point}` : null

    if (!entry.buildings) {
      // Try point-level first, then timestamp-level
      const shared = (ptKey ? sharedBuildings.get(ptKey) : undefined) ?? sharedBuildings.get(tsKey)
      if (shared) entry.buildings = shared
    }
    if (!entry.nodesJson) {
      const shared = (ptKey ? sharedNodesJson.get(ptKey) : undefined) ?? sharedNodesJson.get(tsKey)
      if (shared) entry.nodesJson = shared
    }
    if (!entry.jammersJson) {
      const shared =
        (ptKey ? sharedJammersJson.get(ptKey) : undefined) ?? sharedJammersJson.get(tsKey)
      if (shared) entry.jammersJson = shared
    }
  }

  const runs: RunEntry[] = []
  for (const e of byKey.values()) {
    if (e.links && e.pos)
      runs.push({
        yearMonth: e.yearMonth,
        day: e.day,
        time: e.time,
        seed: e.seed,
        point: e.point,
        key: e.key,
        runDir: e.runDir,
        linksFile: e.links!,
        posFile: e.pos!,
        buildingsFile: e.buildings,
        flowsFile: e.flows,
        routesFile: e.routes,
        nodesJsonFile: e.nodesJson,
        jammersJsonFile: e.jammersJson,
        mcsFile: e.mcs,
        rxPowerFile: e.rxPower,
      })
  }
  return runs.sort((a, b) => b.key.localeCompare(a.key))
}

// -------------------------------------------------------------------------
// Dev-server auto-discovery — fetches the file listing from the Vite plugin
// -------------------------------------------------------------------------
export async function fetchRunsFromDevServer(): Promise<RunEntry[] | null> {
  try {
    const res = await fetch('/api/outputs')
    if (!res.ok) return null
    const listed: string[] = await res.json()
    // Only legacy runs are downloaded eagerly; experiment files load on demand
    const paths = listed.filter((p) => isLegacyRunPath(p) && isKnownFile(p.split('/').pop()!))
    if (!paths.length) return null

    // Fetch all files in parallel, creating File objects
    const pairs: FilePair[] = await Promise.all(
      paths.map(async (p) => {
        const resp = await fetch(`/outputs/${p}`)
        const blob = await resp.blob()
        const fname = p.split('/').pop()!
        const file = new File([blob], fname)
        return { path: p, file }
      })
    )

    return assembleRuns(pairs)
  } catch {
    return null
  }
}

/**
 * webkitRelativePath starts with the picked folder's own name; drop it so run paths
 * share the catalog's root-relative coordinates (as catalogFromFileList does).
 */
function pickedRelativePath(f: File): string {
  const rel = f.webkitRelativePath
  if (!rel) return f.name
  const slash = rel.indexOf('/')
  return slash < 0 ? rel : rel.slice(slash + 1)
}

// Classic <input webkitdirectory> path
export function parseRunsFromFileList(files: FileList | File[]): RunEntry[] {
  const pairs: FilePair[] = Array.from(files)
    .map((f) => ({ path: pickedRelativePath(f), file: f }))
    .filter(({ path }) => !path.split('/').some((p) => EPISODE_DIR.test(p)))
  return assembleRuns(pairs)
}

// File System Access API path — walk directory recursively
export async function walkDirectory(
  handle: FileSystemDirectoryHandle,
  prefix = ''
): Promise<FilePair[]> {
  const pairs: FilePair[] = []
  for await (const [name, entry] of handle) {
    const path = prefix ? `${prefix}/${name}` : name
    if (entry.kind === 'file') {
      // Only materialise files we care about (avoid reading every file)
      if (isKnownFile(name)) {
        const file = await (entry as FileSystemFileHandle).getFile()
        pairs.push({ path, file })
      }
    } else if (entry.kind === 'directory' && !EPISODE_DIR.test(name) && !name.startsWith('.')) {
      pairs.push(...(await walkDirectory(entry as FileSystemDirectoryHandle, path)))
    }
  }
  return pairs
}
