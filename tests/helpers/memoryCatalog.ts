import type { ResultCatalog } from '../../src/lib/resultCatalog.ts'

export interface MemoryCatalogOptions {
  name?: string
  truncated?: boolean
  /** getFile throws for these paths (simulates an unreadable file) */
  failPaths?: string[]
}

/** In-memory ResultCatalog for tests; `reads` records every getFile path, in order. */
export function memoryCatalog(
  files: Record<string, string>,
  opts: MemoryCatalogOptions = {}
): ResultCatalog & { reads: string[] } {
  const map = new Map(Object.entries(files))
  const fail = new Set(opts.failPaths ?? [])
  const reads: string[] = []
  return {
    name: opts.name ?? 'memory',
    truncated: opts.truncated ?? false,
    reads,
    paths: () => Array.from(map.keys()).sort(),
    has: (path) => map.has(path),
    getFile: async (path) => {
      reads.push(path)
      if (fail.has(path)) throw new Error(`simulated read failure: ${path}`)
      const text = map.get(path)
      return text === undefined ? null : new File([text], path.slice(path.lastIndexOf('/') + 1))
    },
  }
}
