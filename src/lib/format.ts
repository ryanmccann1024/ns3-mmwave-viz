export function freqLabel(hz: number): string {
  return hz >= 1e9 ? `${(hz / 1e9).toFixed(1)} GHz` : `${(hz / 1e6).toFixed(0)} MHz`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Display name and date for an output folder written as YYYY-MM/DD/HH-MM-name.
 * Paths that do not follow the layout keep their last segment as the name.
 */
export function folderLabel(path: string): { name: string; date: string | null } {
  const m = path.match(/(\d{4})-(\d{2})\/(\d{2})\/(\d{2})-(\d{2})(?:-(\d{2}))?-([^/]+)$/)
  if (!m) {
    const last = path.split('/').filter(Boolean).pop()
    return { name: last ?? path, date: null }
  }
  const [, , month, day, hh, mm, , name] = m
  return { name, date: `${MONTHS[Number(month) - 1] ?? month} ${Number(day)}, ${hh}:${mm}` }
}

/** Readable precision for tables and tiles; exact values stay in the manifests */
export function shortNumber(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'n/a'
  const abs = Math.abs(v)
  return v.toFixed(abs >= 100 ? 1 : abs >= 1 ? 2 : 3)
}

/** A training run folder written as YYYY-MM/DD/HH-MM-SS, as "Sep 22, 17:50:56" */
export function runTimeLabel(path: string): string | null {
  const m = path.match(/(\d{4})-(\d{2})\/(\d{2})\/(\d{2})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, , month, day, hh, mm, ss] = m
  return `${MONTHS[Number(month) - 1] ?? month} ${Number(day)}, ${hh}:${mm}:${ss}`
}

/**
 * Readable title and short code for a scenario folder such as arpo-2-7-throughput-dynamic-04172026.
 * Names that do not follow the prefix-major-minor-description layout keep their words.
 */
export function scenarioLabel(name: string): { title: string; code: string | null } {
  const bare = name.replace(/-\d{8}$/, '')
  const m = bare.match(/^([a-z]+)-(\d+)-(\d+|[a-z])-(.+)$/i)
  const words = (s: string) => {
    const spaced = s
      .replace(/[-_]+/g, ' ')
      .replace(/\b(los|nlos|sinr|snr|uav|mcs)\b/gi, (w) => w.toUpperCase())
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
  }
  if (!m) return { title: words(bare), code: null }
  const [, prefix, major, minor, rest] = m
  return { title: words(rest), code: `${prefix.toUpperCase()} ${major}.${minor}` }
}

/**
 * Name and date for the batch a run folder sits in (YYYY-MM/DD/HH-MM-SS[-label]/...):
 * { name: 'Validation', date: 'May 19, 13:59' }. Either part is null when absent.
 */
export function batchLabel(runDir: string): {
  name: string | null
  date: string | null
  /** 'YYYY-MM-DD HH:MM', for newest-first ordering */
  sortKey: string | null
} {
  const m = runDir.match(/(\d{4})-(\d{2})\/(\d{2})\/(\d{2})-(\d{2})(?:-\d{2})?(?:-([^/]+))?/)
  if (!m) return { name: null, date: null, sortKey: null }
  const [, year, month, day, hh, mm, label] = m
  const name = label ? scenarioLabel(label).title : null
  return {
    name,
    date: `${MONTHS[Number(month) - 1] ?? month} ${Number(day)}, ${hh}:${mm}`,
    sortKey: `${year}-${month}-${day} ${hh}:${mm}`,
  }
}

/**
 * The folder an experiment sits in, as a heading: custom/10-09/local-fast/main/small-jammer
 * gives { key: 'custom/10-09/local-fast/main', name: 'Local fast · Main', date: 'Oct 9' }.
 * Dates are read from a YYYY-MM/DD pair or an MM-DD segment; either part may be null.
 */
export function experimentGroup(root: string): {
  key: string
  name: string | null
  date: string | null
} {
  const parts = root.split('/').filter(Boolean)
  parts.pop()
  const key = parts.join('/')
  let date: string | null = null
  let rest = parts
  const ym = parts.findIndex(
    (p, i) => /^\d{4}-\d{2}$/.test(p) && /^\d{2}$/.test(parts[i + 1] ?? '')
  )
  if (ym >= 0) {
    const month = Number(parts[ym].slice(5))
    date = `${MONTHS[month - 1] ?? month} ${Number(parts[ym + 1])}`
    rest = parts.slice(ym + 2)
  } else {
    const md = parts.findIndex((p) => /^\d{2}-\d{2}$/.test(p) && Number(p.slice(0, 2)) <= 12)
    if (md >= 0) {
      const [month, day] = parts[md].split('-').map(Number)
      date = `${MONTHS[month - 1]} ${day}`
      rest = parts.slice(md + 1)
    }
  }
  const name = rest.length ? rest.map((p) => scenarioLabel(p).title).join(' · ') : null
  return { key, name, date }
}

export interface ExperimentGroup<T extends { root: string }> {
  key: string
  name: string | null
  date: string | null
  roots: T[]
}

/** Experiment folders gathered by the folder they sit in, newest first (input is oldest first) */
export function groupExperimentRoots<T extends { root: string }>(roots: T[]): ExperimentGroup<T>[] {
  const groups: ExperimentGroup<T>[] = []
  for (const root of [...roots].reverse()) {
    const g = experimentGroup(root.root)
    let group = groups.find((x) => x.key === g.key)
    if (!group) groups.push((group = { ...g, roots: [] }))
    group.roots.push(root)
  }
  return groups
}

/** Index of the first segment below a YYYY-MM/DD pair or an MM-DD segment, and that date */
function belowDate(parts: string[]): { index: number; date: string | null } {
  const ym = parts.findIndex(
    (p, i) => /^\d{4}-\d{2}$/.test(p) && /^\d{2}$/.test(parts[i + 1] ?? '')
  )
  if (ym >= 0) {
    const month = Number(parts[ym].slice(5))
    return { index: ym + 2, date: `${MONTHS[month - 1] ?? month} ${Number(parts[ym + 1])}` }
  }
  const md = parts.findIndex((p) => /^\d{2}-\d{2}$/.test(p) && Number(p.slice(0, 2)) <= 12)
  if (md >= 0) {
    const [month, day] = parts[md].split('-').map(Number)
    return { index: md + 1, date: `${MONTHS[month - 1]} ${day}` }
  }
  return { index: 0, date: null }
}

const depthBelowDate = (path: string) => {
  const parts = path.split('/').filter(Boolean)
  return parts.length - belowDate(parts).index
}

export interface Project<T extends { root: string }> {
  key: string
  /** the shared folder name, e.g. 'Local fast' */
  title: string
  date: string | null
  /** each experiment with its name inside the project, e.g. 'Main' or 'Calibration 1' */
  experiments: (ExperimentGroup<T> & { short: string })[]
  /** training run folders that sit beside the experiments, with their names inside it */
  training: { root: string; short: string }[]
}

/**
 * Experiments and training runs gathered into projects by folder name: under one date folder,
 * local-fast/main, local-fast-calibration-1 and local-fast-benchmark all belong to 'local-fast'
 * (a folder joins the shortest sibling its name extends with '-'). Order follows the input.
 */
export function groupProjects<T extends { root: string }>(
  groups: ExperimentGroup<T>[],
  trainingRoots: string[]
): Project<T>[] {
  const locate = (path: string) => {
    const parts = path.split('/').filter(Boolean)
    const { index, date } = belowDate(parts)
    const at = Math.min(index, parts.length - 1)
    return {
      parent: parts.slice(0, at).join('/'),
      top: parts[at] ?? '',
      below: parts.slice(at + 1),
      date,
    }
  }
  const entries = [
    ...groups.map((g) => ({
      g,
      // A folder that is only a date (or nothing) names no project; its experiment does
      loc: locate(depthBelowDate(g.key) > 0 ? g.key : g.roots[0].root),
    })),
    ...trainingRoots.map((root) => ({ root, loc: locate(root) })),
  ]
  const tops = new Map<string, string[]>()
  for (const { loc } of entries) {
    const list = tops.get(loc.parent) ?? []
    if (!list.includes(loc.top)) list.push(loc.top)
    tops.set(loc.parent, list)
  }
  const baseOf = (parent: string, top: string) =>
    (tops.get(parent) ?? [])
      .filter((t) => top === t || top.startsWith(t + '-'))
      .reduce((a, b) => (b.length < a.length ? b : a), top)
  const shortOf = (base: string, top: string, below: string[]) =>
    [...(top === base ? [] : [top.slice(base.length + 1)]), ...below]
      .map((p) => scenarioLabel(p).title)
      .join(' · ')

  const projects: Project<T>[] = []
  for (const entry of entries) {
    const { parent, top, below, date } = entry.loc
    const base = baseOf(parent, top)
    const key = parent ? `${parent}/${base}` : base
    let project = projects.find((p) => p.key === key)
    if (!project) {
      project = { key, title: scenarioLabel(base).title, date, experiments: [], training: [] }
      projects.push(project)
    }
    const short = shortOf(base, top, below)
    if ('g' in entry) project.experiments.push({ ...entry.g, short: short || project.title })
    else project.training.push({ root: entry.root, short: short || 'Training run' })
  }
  return projects
}
