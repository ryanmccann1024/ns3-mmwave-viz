import { readJson, type ResultCatalog } from './resultCatalog.ts'
import { parseIni } from './runIni.ts'

// Scenario metadata (nodes.json, buildings.json, jammers.json) for a replay. An episode's own inputs/
// copy wins. Otherwise the archived run.ini names the file it was run with, as a path on
// the simulating host; that path is never opened, only matched by its trailing segments
// against files inside the selected folder, and the match is accepted only when its
// SHA-256 equals the hash the evaluation manifest recorded for the scenario.

export type InputCheck =
  /** archived inside the episode folder */
  | 'archived'
  /** found through run.ini; SHA-256 matches the manifest's scenario identity */
  | 'verified'
  /** found through run.ini; the manifest records no hash to check it against */
  | 'unverified'

export interface InputSource {
  path: string
  check: InputCheck
}

export interface ScenarioInputSources {
  nodes: InputSource | null
  buildings: InputSource | null
  jammers: InputSource | null
  /** why a file named by run.ini was not used */
  rejected: string[]
}

export interface InputHashes {
  nodesJson: string | null
  buildings: string | null
  /** Only an episode-specific jammer hash; evaluation identities may describe the training seed. */
  jammersJson?: string | null
}

const segments = (p: string) => p.split(/[\\/]+/).filter((s) => s !== '' && s !== '.')

/** Read scenario files named by this episode’s archived run.ini; empty values are absent. */
export function recordedInputPaths(runIniText: string): {
  nodes: string | null
  buildings: string | null
  jammers: string | null
} {
  const scenario = parseIni(runIniText).scenario ?? {}
  const value = (key: string) =>
    scenario[key] && scenario[key].trim() !== '' ? scenario[key] : null
  return {
    nodes: value('nodes_file'),
    buildings: value('buildings_file'),
    jammers: value('jammers_file'),
  }
}

/**
 * The catalog file a host path refers to: the longest run of matching trailing segments
 * (at least the file and its folder), then the candidate sharing most leading segments
 * with `near`. Ties are ambiguous and resolve to null.
 */
export function resolveRecordedPath(
  recorded: string,
  paths: readonly string[],
  near: string
): string | null {
  const want = segments(recorded)
  if (want.length < 2 || want.includes('..')) return null
  const base = want[want.length - 1]
  const nearParts = segments(near)
  let best: { path: string; tail: number; shared: number }[] = []
  for (const path of paths) {
    const parts = segments(path)
    if (parts[parts.length - 1] !== base) continue
    let tail = 0
    while (
      tail < parts.length &&
      tail < want.length &&
      parts[parts.length - 1 - tail] === want[want.length - 1 - tail]
    )
      tail++
    if (tail < 2) continue
    let shared = 0
    while (
      shared < parts.length &&
      shared < nearParts.length &&
      parts[shared] === nearParts[shared]
    )
      shared++
    const entry = { path, tail, shared }
    const top = best[0]
    if (!top || tail > top.tail || (tail === top.tail && shared > top.shared)) best = [entry]
    else if (tail === top.tail && shared === top.shared) best.push(entry)
  }
  return best.length === 1 ? best[0].path : null
}

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// A pinned scenario archive records seed-specific jammer hashes. The evaluation's
// top-level identity can instead describe seed 101, even when replaying seed 201/202.
const archiveCache = new WeakMap<ResultCatalog, Map<string, Promise<unknown>>>()
async function archivedJammerHash(catalog: ResultCatalog, file: string): Promise<string | null> {
  let cache = archiveCache.get(catalog)
  if (!cache) {
    cache = new Map()
    archiveCache.set(catalog, cache)
  }
  const names: Record<string, string> = {
    'phase-one.json': 'phase_one_version',
    'phase-two.json': 'phase_two_version',
    'phase-three.json': 'phase_three_version',
    'phase-six.json': 'phase_six_version',
    'phase-seven.json': 'phase_seven_version',
    'phase-five.json': 'phase_five_version',
    'phase-four.json': 'phase_four_version',
  }
  const plans = catalog
    .paths()
    .filter((path) => {
      const name = path.slice(path.lastIndexOf('/') + 1)
      const parent = path.slice(0, path.lastIndexOf('/') + 1)
      return name in names && parent.endsWith('inputs/') && file.startsWith(parent)
    })
    .sort((a, b) => b.length - a.length)
  for (const path of plans) {
    let pending = cache.get(path)
    if (!pending) {
      pending = readJson(catalog, path)
      cache.set(path, pending)
    }
    const raw = await pending
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const plan = raw as Record<string, unknown>
    const name = path.slice(path.lastIndexOf('/') + 1)
    if (plan[names[name]] !== 1) continue
    const hashes = plan.input_hashes
    const relative = file.slice(path.lastIndexOf('/') + 1)
    const hash =
      hashes && typeof hashes === 'object' ? (hashes as Record<string, unknown>)[relative] : null
    if (typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash)) return hash
  }
  return null
}

const shortHash = (h: string) => h.slice(0, 12)

/**
 * Fills in scenario files for a replay whose episode folder did not archive
 * them, from the files its run.ini names. Never throws; a rejected file is reported.
 */
export async function resolveScenarioInputs<
  F extends {
    nodesJson: string | null
    buildings: string | null
    runIni: string | null
    jammersJson?: string | null
    inputHashes?: InputHashes
  },
>(
  catalog: ResultCatalog,
  files: F,
  near: string
): Promise<{ files: F; sources: ScenarioInputSources }> {
  const sources: ScenarioInputSources = {
    nodes: files.nodesJson ? { path: files.nodesJson, check: 'archived' } : null,
    buildings: files.buildings ? { path: files.buildings, check: 'archived' } : null,
    jammers: files.jammersJson ? { path: files.jammersJson, check: 'archived' } : null,
    rejected: [],
  }
  if (
    (files.nodesJson && files.buildings && (!('jammersJson' in files) || files.jammersJson)) ||
    !files.runIni
  )
    return { files, sources }
  let recorded: ReturnType<typeof recordedInputPaths>
  try {
    const ini = await catalog.getFile(files.runIni)
    if (!ini) return { files, sources }
    recorded = recordedInputPaths(await ini.text())
  } catch {
    return { files, sources }
  }
  const next = { ...files }
  const paths = catalog.paths()
  const resolve = async (
    kind: 'nodes' | 'buildings' | 'jammers',
    host: string | null,
    expected: string | null | undefined
  ): Promise<InputSource | null> => {
    if (!host) return null
    const name =
      kind === 'nodes' ? 'nodes.json' : kind === 'jammers' ? 'jammers.json' : 'buildings.json'
    const path = resolveRecordedPath(host, paths, near)
    if (!path) {
      sources.rejected.push(`${name} named by run.ini is not in the selected folder`)
      return null
    }
    if (!expected && kind === 'jammers') expected = await archivedJammerHash(catalog, path)
    if (!expected) return { path, check: 'unverified' }
    try {
      const file = await catalog.getFile(path)
      const actual = file ? await sha256Hex(file) : null
      if (actual === expected.toLowerCase()) return { path, check: 'verified' }
      sources.rejected.push(
        `${path} does not match the manifest's ${name} hash` +
          (actual ? ` (${shortHash(actual)} vs ${shortHash(expected)})` : '')
      )
    } catch {
      sources.rejected.push(`${path} could not be read`)
    }
    return null
  }
  if (!files.nodesJson) {
    sources.nodes = await resolve('nodes', recorded.nodes, files.inputHashes?.nodesJson)
    next.nodesJson = sources.nodes?.path ?? null
  }
  if (!files.buildings) {
    sources.buildings = await resolve('buildings', recorded.buildings, files.inputHashes?.buildings)
    next.buildings = sources.buildings?.path ?? null
  }
  if ('jammersJson' in files && !files.jammersJson) {
    sources.jammers = await resolve('jammers', recorded.jammers, files.inputHashes?.jammersJson)
    next.jammersJson = sources.jammers?.path ?? null
  }
  return { files: next, sources }
}
