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
