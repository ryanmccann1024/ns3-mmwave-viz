// Lazy, read-only catalog of result files keyed by normalized root-relative path.

export interface ResultCatalog {
  readonly name: string
  /** True when the source listing hit its entry cap and is incomplete. */
  readonly truncated?: boolean
  paths(): string[]
  has(path: string): boolean
  getFile(path: string): Promise<File | null>
}

/** Upper bound on files collected by a directory-handle walk. */
export const MAX_CATALOG_ENTRIES = 50_000

const READER_FILE_NAMES = new Set([
  'links.csv',
  'positions.csv',
  'flows.csv',
  'routes.csv',
  'mcs.csv',
  'rx-power.csv',
  'nodes.json',
  'jammers.json',
  'summary.json',
  'experiment_plan.json',
  'eval_manifest.json',
  'train_manifest.json',
  'comparison.json',
  'episodes.csv',
  'fetch_manifest.json',
  'rl_episode.json',
  'steps.jsonl',
  'evaluations.npz',
  'baseline_manifest.json',
  'baseline-plan.json',
])

export function isReaderFileName(name: string): boolean {
  return READER_FILE_NAMES.has(name) || (name.startsWith('buildings') && name.endsWith('.json'))
}

export function isTrainRolloutDirectory(segments: string[]): boolean {
  return segments.some(
    (segment, i) =>
      segment === 'train' &&
      /^train-seed-\d+$/.test(segments[i + 2] ?? '') &&
      segments.slice(i + 3).some((part) => /^episode-\d+$/.test(part))
  )
}

/**
 * Whether a file at this path belongs in the catalog. Training rollouts inside an
 * experiment (train/<row>/train-seed-N/.../episode-*) can hold thousands of episodes, so
 * only their small rl_episode.json records are kept: enough for learning curves, without
 * indexing every rollout's CSVs.
 */
export function isCatalogFile(segments: string[]): boolean {
  const name = segments[segments.length - 1] ?? ''
  if (!isReaderFileName(name)) return false
  return name === 'rl_episode.json' || !isTrainRolloutDirectory(segments)
}

export function normalizeRelPath(p: string): string | null {
  if (typeof p !== 'string' || p === '') return null
  if (p.includes('\\') || p.includes('\0')) return null
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') return null
    out.push(seg)
  }
  return out.length ? out.join('/') : null
}

function makeCatalog(
  name: string,
  sources: Map<string, () => Promise<File | null>>,
  truncated = false
): ResultCatalog {
  const sorted = Array.from(sources.keys()).sort()
  return {
    name,
    truncated,
    paths: () => sorted.slice(),
    has: (path) => {
      const norm = normalizeRelPath(path)
      return norm !== null && sources.has(norm)
    },
    getFile: async (path) => {
      const norm = normalizeRelPath(path)
      const source = norm === null ? undefined : sources.get(norm)
      return source ? source() : null
    },
  }
}

export function catalogFromFiles(
  name: string,
  entries: { path: string; file: File }[]
): ResultCatalog {
  const sources = new Map<string, () => Promise<File | null>>()
  for (const { path, file } of entries) {
    const norm = normalizeRelPath(path)
    if (norm !== null) sources.set(norm, async () => file)
  }
  return makeCatalog(name, sources)
}

export function catalogFromFileList(files: FileList | File[]): ResultCatalog {
  let name = ''
  const entries: { path: string; file: File }[] = []
  for (const file of Array.from(files)) {
    const rel = file.webkitRelativePath
    if (!rel) {
      if (isReaderFileName(file.name)) entries.push({ path: file.name, file })
      continue
    }
    // webkitRelativePath starts with the picked folder's own name
    const slash = rel.indexOf('/')
    if (slash < 0) {
      if (isReaderFileName(rel)) entries.push({ path: rel, file })
      continue
    }
    if (!name) name = rel.slice(0, slash)
    const path = rel.slice(slash + 1)
    if (isCatalogFile(path.split('/'))) entries.push({ path, file })
  }
  return catalogFromFiles(name || 'selection', entries)
}

export async function catalogFromDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<ResultCatalog> {
  const sources = new Map<string, () => Promise<File | null>>()
  let truncated = false
  // Iterative walk: names and handles only, no getFile() here
  const pending: { dir: FileSystemDirectoryHandle; prefix: string }[] = [
    { dir: handle, prefix: '' },
  ]
  while (pending.length && !truncated) {
    const { dir, prefix } = pending.pop()!
    for await (const [entryName, entry] of dir) {
      const path = prefix ? `${prefix}/${entryName}` : entryName
      if (entry.kind === 'directory') {
        if (!entryName.startsWith('.'))
          pending.push({ dir: entry as FileSystemDirectoryHandle, prefix: path })
        continue
      }
      if (normalizeRelPath(path) !== path || !isCatalogFile(path.split('/'))) continue
      if (sources.size >= MAX_CATALOG_ENTRIES) {
        truncated = true
        break
      }
      const fileHandle = entry as FileSystemFileHandle
      sources.set(path, () => fileHandle.getFile())
    }
  }
  return makeCatalog(handle.name, sources, truncated)
}

function outputsUrl(path: string): string {
  return `/outputs/${path.split('/').map(encodeURIComponent).join('/')}`
}

export async function catalogFromDevServer(): Promise<ResultCatalog | null> {
  try {
    const res = await fetch('/api/outputs')
    if (!res.ok) return null
    const listing: unknown = await res.json()
    if (!Array.isArray(listing)) return null
    const sources = new Map<string, () => Promise<File | null>>()
    for (const item of listing) {
      const norm = typeof item === 'string' ? normalizeRelPath(item) : null
      if (norm === null) continue
      sources.set(norm, async () => {
        const resp = await fetch(outputsUrl(norm))
        if (!resp.ok) return null
        return new File([await resp.blob()], norm.slice(norm.lastIndexOf('/') + 1))
      })
    }
    const truncated = res.headers?.get('X-Outputs-Truncated') === 'true'
    return makeCatalog('outputs', sources, truncated)
  } catch {
    return null
  }
}

export function subCatalog(catalog: ResultCatalog, prefix: string): ResultCatalog {
  const norm = normalizeRelPath(prefix)
  if (norm === null) {
    // Empty prefix means the whole catalog; an unsafe prefix matches nothing
    const isRoot = prefix === '' || prefix === '.' || prefix === './'
    return isRoot ? catalog : makeCatalog(catalog.name, new Map())
  }
  const lead = `${norm}/`
  const inner = (path: string): string | null => {
    const rel = normalizeRelPath(path)
    return rel === null ? null : lead + rel
  }
  return {
    name: `${catalog.name}/${norm}`,
    truncated: catalog.truncated,
    paths: () =>
      catalog
        .paths()
        .filter((p) => p.startsWith(lead))
        .map((p) => p.slice(lead.length)),
    has: (path) => {
      const full = inner(path)
      return full !== null && catalog.has(full)
    },
    getFile: async (path) => {
      const full = inner(path)
      return full === null ? null : catalog.getFile(full)
    },
  }
}

export async function readText(catalog: ResultCatalog, path: string): Promise<string | null> {
  const file = await catalog.getFile(path)
  return file ? file.text() : null
}

export async function readJson(catalog: ResultCatalog, path: string): Promise<unknown | null> {
  const text = await readText(catalog, path)
  return text === null ? null : (JSON.parse(text) as unknown)
}
