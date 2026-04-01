// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------
export interface RunEntry {
  yearMonth: string
  day: string
  time: string
  seed: string
  key: string
  linksFile: File
  posFile: File
  buildingsFile?: File
  flowsFile?: File
  routesFile?: File
  nodesJsonFile?: File
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
])

export function assembleRuns(pairs: FilePair[]): RunEntry[] {
  type Partial = {
    yearMonth: string
    day: string
    time: string
    seed: string
    key: string
    links?: File
    pos?: File
    buildings?: File
    flows?: File
    routes?: File
    nodesJson?: File
  }
  const byKey = new Map<string, Partial>()
  const sharedBuildings = new Map<string, File>()
  const sharedNodesJson = new Map<string, File>()

  for (const { path, file } of pairs) {
    const parts = path.split('/')
    const fname = parts[parts.length - 1]

    // Expected: YYYY-MM/DD/HH-MM-SS/seed-N/filename (4+ parts)
    // or outputs/YYYY-MM/DD/HH-MM-SS/seed-N/filename (5+ parts)
    if (SEED_LEVEL_FILES.has(fname)) {
      const seedDir = parts[parts.length - 2]
      if (seedDir?.startsWith('seed-') && parts.length >= 4) {
        const ymIdx = parts.length - 5
        const dIdx = parts.length - 4
        const tIdx = parts.length - 3
        const ym = ymIdx >= 0 ? parts[ymIdx] : ''
        const d = dIdx >= 0 ? parts[dIdx] : ''
        const t = tIdx >= 0 ? parts[tIdx] : ''
        const key = `${ym}/${d}/${t}/${seedDir}`

        if (!byKey.has(key)) byKey.set(key, { yearMonth: ym, day: d, time: t, seed: seedDir, key })
        const entry = byKey.get(key)!
        if (fname === 'links.csv') entry.links = file
        if (fname === 'positions.csv') entry.pos = file
        if (fname === 'buildings.json') entry.buildings = file
        if (fname === 'flows.csv') entry.flows = file
        if (fname === 'routes.csv') entry.routes = file
        if (fname === 'nodes.json') entry.nodesJson = file
      }
    }

    // Also check for buildings.json / nodes.json inside inputs/ subfolder at the timestamp level:
    // YYYY-MM/DD/HH-MM-SS/inputs/buildings.json
    if (fname === 'buildings.json' || fname === 'nodes.json') {
      const parentDir = parts[parts.length - 2]
      if (parentDir === 'inputs' || parentDir === 'input') {
        const tIdx = parts.length - 3
        const dIdx = parts.length - 4
        const ymIdx = parts.length - 5
        if (tIdx >= 0 && dIdx >= 0) {
          const time = parts[tIdx]
          const day = parts[dIdx]
          const yearMonth = ymIdx >= 0 ? parts[ymIdx] : ''
          const tsKey = `${yearMonth}/${day}/${time}`
          // Apply to ALL seed runs under this timestamp
          for (const entry of byKey.values()) {
            if (entry.yearMonth === yearMonth && entry.day === day && entry.time === time) {
              if (fname === 'buildings.json' && !entry.buildings) entry.buildings = file
              if (fname === 'nodes.json' && !entry.nodesJson) entry.nodesJson = file
            }
          }
          // Stash for runs discovered later in the loop
          if (fname === 'buildings.json' && !sharedBuildings.has(tsKey))
            sharedBuildings.set(tsKey, file)
          if (fname === 'nodes.json' && !sharedNodesJson.has(tsKey))
            sharedNodesJson.set(tsKey, file)
        }
      }
    }
  }

  // Apply shared (timestamp-level) files to any runs that don't have them yet
  for (const entry of byKey.values()) {
    const tsKey = `${entry.yearMonth}/${entry.day}/${entry.time}`
    if (!entry.buildings) {
      const shared = sharedBuildings.get(tsKey)
      if (shared) entry.buildings = shared
    }
    if (!entry.nodesJson) {
      const shared = sharedNodesJson.get(tsKey)
      if (shared) entry.nodesJson = shared
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
        key: e.key,
        linksFile: e.links!,
        posFile: e.pos!,
        buildingsFile: e.buildings,
        flowsFile: e.flows,
        routesFile: e.routes,
        nodesJsonFile: e.nodesJson,
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
    const paths: string[] = await res.json()
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

// Classic <input webkitdirectory> path
export function parseRunsFromFileList(files: FileList): RunEntry[] {
  const pairs: FilePair[] = Array.from(files).map((f) => ({
    path: f.webkitRelativePath,
    file: f,
  }))
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
      if (SEED_LEVEL_FILES.has(name)) {
        const file = await (entry as FileSystemFileHandle).getFile()
        pairs.push({ path, file })
      }
    } else if (entry.kind === 'directory') {
      pairs.push(...(await walkDirectory(entry as FileSystemDirectoryHandle, path)))
    }
  }
  return pairs
}
