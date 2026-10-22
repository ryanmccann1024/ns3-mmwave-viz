// Which folders of the open outputs folder are shown. The choice is a list of included
// folder paths; a file is shown when it sits inside one of them. Files directly in the
// outputs folder belong to no subfolder and are always shown.

import type { ResultCatalog } from './resultCatalog.ts'

export interface FolderNode {
  /** outputs-relative folder path, e.g. "custom/10-09" */
  path: string
  name: string
  children: FolderNode[]
}

export type CheckState = 'on' | 'off' | 'mixed'

/** Levels of folders offered for choosing */
const MAX_DEPTH = 5

/**
 * Folders that hold result files, to MAX_DEPTH levels. A run of lone subfolders that
 * leads to several folders is one row named by the whole run (custom/10-16), keeping the
 * top folder's path; one that leads nowhere lists nothing, since choosing its lone
 * subfolder is the same as choosing the folder.
 */
export function folderTree(paths: string[]): FolderNode[] {
  const root: FolderNode = { path: '', name: '', children: [] }
  for (const path of paths) {
    const parts = path.split('/').slice(0, -1).slice(0, MAX_DEPTH)
    let node = root
    for (const name of parts) {
      const next = node.path ? `${node.path}/${name}` : name
      let child = node.children.find((c) => c.name === name)
      if (!child) node.children.push((child = { path: next, name, children: [] }))
      node = child
    }
  }
  const byName = (a: FolderNode, b: FolderNode) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  const tidy = (node: FolderNode): FolderNode => {
    const names = [node.name]
    let end = node
    while (end.children.length === 1) {
      end = end.children[0]
      names.push(end.name)
    }
    if (end.children.length === 0) return { ...node, children: [] }
    return { path: node.path, name: names.join('/'), children: end.children.map(tidy).sort(byName) }
  }
  return root.children.map(tidy).sort(byName)
}

function within(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`)
}

/** Whether a file or folder path is shown under the chosen folders */
export function isIncluded(path: string, included: readonly string[]): boolean {
  if (!path.includes('/')) return true
  return included.some((folder) => within(path, folder))
}

/** Whether a folder path itself is shown (a top-level folder name has no slash) */
export function isFolderIncluded(path: string, included: readonly string[]): boolean {
  return included.some((folder) => within(path, folder))
}

export function checkState(node: FolderNode, included: readonly string[]): CheckState {
  if (included.some((folder) => within(node.path, folder))) return 'on'
  if (included.some((folder) => folder.startsWith(`${node.path}/`))) return 'mixed'
  return 'off'
}

/** The nodes from the top of the tree down to the folder at path */
function lineage(tree: FolderNode[], path: string): FolderNode[] {
  const chain: FolderNode[] = []
  let level = tree
  for (;;) {
    const node = level.find((n) => within(path, n.path))
    if (!node) return chain
    chain.push(node)
    if (node.path === path) return chain
    level = node.children
  }
}

/** A folder whose subfolders are all chosen counts as chosen itself */
function collapse(tree: FolderNode[], included: string[]): string[] {
  let next = included
  const visit = (node: FolderNode) => {
    node.children.forEach(visit)
    if (
      node.children.length > 0 &&
      !next.includes(node.path) &&
      node.children.every((c) => next.includes(c.path))
    ) {
      next = [...next.filter((f) => !f.startsWith(`${node.path}/`)), node.path]
    }
  }
  tree.forEach(visit)
  return next
}

/** Turns one folder on (from off or mixed) or off, keeping its siblings as they were */
export function toggleFolder(
  tree: FolderNode[],
  included: readonly string[],
  path: string
): string[] {
  const chain = lineage(tree, path)
  const node = chain[chain.length - 1]
  if (!node || node.path !== path) return [...included]
  const outside = included.filter((f) => !within(f, path))
  if (checkState(node, included) !== 'on') return collapse(tree, [...outside, path])

  // Turning off a folder chosen through a parent: the parent gives way to its other subfolders
  let next = outside
  for (let i = 0; i < chain.length - 1; i++) {
    const parent = chain[i]
    if (!next.includes(parent.path)) continue
    next = [
      ...next.filter((f) => f !== parent.path),
      ...parent.children.filter((c) => c.path !== path).map((c) => c.path),
    ]
  }
  return next
}

/** Every top-level folder */
export function allFolders(tree: FolderNode[]): string[] {
  return tree.map((n) => n.path)
}

/**
 * The catalog as seen through the chosen folders. Only the listing is narrowed: an
 * experiment that refers to a file in a hidden folder can still read it.
 */
export function filterCatalog(catalog: ResultCatalog, included: readonly string[]): ResultCatalog {
  const shown = catalog.paths().filter((p) => isIncluded(p, included))
  return {
    name: catalog.name,
    truncated: catalog.truncated,
    paths: () => shown.slice(),
    has: (path) => catalog.has(path),
    getFile: (path) => catalog.getFile(path),
  }
}

const STORAGE_PREFIX = 'mmwave-viz:folders:'

/** The saved choice for an outputs folder, or null when none was ever made */
export function loadIncluded(source: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + source)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : null
  } catch {
    return null
  }
}

export function saveIncluded(source: string, included: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + source, JSON.stringify(included))
  } catch {
    // Storage blocked: the choice lasts for this visit only
  }
}
