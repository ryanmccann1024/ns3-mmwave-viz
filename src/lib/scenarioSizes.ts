// Scenario folders that differ only in team size (urban-recovery-3-peers, urban-recovery-6-peers,
// ...) gathered into one family, so a page can switch between sizes in place.

const LEGACY_SIZES: Record<string, number> = { small: 3, large: 6, 'extra-large': 9 }

/** The name without its team size, and that size: urban-recovery-6-peers gives urban-recovery, 6 */
export function peerSize(name: string): { stem: string; peers: number } | null {
  const m = name.match(/^(.+)-(\d+)-peers?$/)
  if (m) return { stem: m[1], peers: Number(m[2]) }
  // Older mission folders named the team by size word
  const legacy = name.match(
    /^((?:rural|urban)-(?:coverage|investigation|recovery|jamming))-(small|large|extra-large)$/
  )
  if (legacy) return { stem: legacy[1], peers: LEGACY_SIZES[legacy[2]] }
  return null
}

export interface ScenarioFamily<T extends { root: string }> {
  /** parent folder plus the stem, or the root itself for a scenario with no size siblings */
  key: string
  /** folder name without the size, e.g. urban-recovery */
  stem: string
  /** smallest team first; a single entry with peers null when the folder names no size */
  sizes: { peers: number | null; root: T }[]
}

/**
 * Sibling folders sharing a stem become one family, in the order their first member appears.
 * A folder with no size, or the only size of its stem, stays a family of one.
 */
export function groupScenarioSizes<T extends { root: string }>(roots: T[]): ScenarioFamily<T>[] {
  const families: ScenarioFamily<T>[] = []
  const byKey = new Map<string, ScenarioFamily<T>>()
  for (const root of roots) {
    const parts = root.root.split('/').filter(Boolean)
    const name = parts.pop() ?? root.root
    const size = peerSize(name)
    const key = size ? [...parts, size.stem].join('/') : root.root
    let family = byKey.get(key)
    if (!family) {
      family = { key, stem: size?.stem ?? name, sizes: [] }
      byKey.set(key, family)
      families.push(family)
    }
    family.sizes.push({ peers: size?.peers ?? null, root })
  }
  for (const f of families) f.sizes.sort((a, b) => (a.peers ?? 0) - (b.peers ?? 0))
  return families
}

/** The family a scenario folder belongs to, among the given roots */
export function familyOf<T extends { root: string }>(
  roots: T[],
  root: string
): ScenarioFamily<T> | null {
  return groupScenarioSizes(roots).find((f) => f.sizes.some((s) => s.root.root === root)) ?? null
}
