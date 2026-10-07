/** Small summaries of one run for its card: signal over time and the share of traffic delivered */
export interface SeriesPoint {
  t: number
  v: number
}

export interface RunPreview {
  /** mean link SINR (dB) per time bucket, oldest first; t is the bucket's first tick (s) */
  sinr: SeriesPoint[]
  meanSinrDb: number | null
  /** delivered / demanded traffic over the whole run, 0..1; null without flows */
  delivery: number | null
}

function rows(csv: string): { header: string[]; body: string[][] } | null {
  const lines = csv.split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
  if (lines.length < 2) return null
  return {
    header: lines[0].split(',').map((h) => h.trim()),
    body: lines.slice(1).map((l) => l.split(',')),
  }
}

/** Mean SINR across links at each tick, averaged into at most `buckets` points */
export function sinrSeries(
  linksCsv: string,
  buckets = 48
): { series: SeriesPoint[]; mean: number | null } {
  const parsed = rows(linksCsv)
  if (!parsed) return { series: [], mean: null }
  const tCol = parsed.header.indexOf('time_s')
  const sCol = parsed.header.indexOf('sinr_db')
  if (tCol < 0 || sCol < 0) return { series: [], mean: null }

  const perTick = new Map<number, { sum: number; n: number }>()
  let total = 0
  let count = 0
  for (const cells of parsed.body) {
    const t = Number(cells[tCol])
    const s = Number(cells[sCol])
    if (!Number.isFinite(t) || !Number.isFinite(s)) continue
    const acc = perTick.get(t) ?? { sum: 0, n: 0 }
    acc.sum += s
    acc.n += 1
    perTick.set(t, acc)
    total += s
    count += 1
  }
  const ticks = [...perTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, a]) => ({ t, v: a.sum / a.n }))
  if (ticks.length === 0) return { series: [], mean: null }
  const size = Math.max(1, Math.ceil(ticks.length / buckets))
  const series: SeriesPoint[] = []
  for (let i = 0; i < ticks.length; i += size) {
    const chunk = ticks.slice(i, i + size)
    series.push({ t: chunk[0].t, v: chunk.reduce((a, p) => a + p.v, 0) / chunk.length })
  }
  return { series, mean: total / count }
}

/** Delivered over demanded traffic summed across every flow and tick */
export function deliveryRatio(flowsCsv: string): number | null {
  const parsed = rows(flowsCsv)
  if (!parsed) return null
  const dCol = parsed.header.indexOf('demand_mbps')
  const gCol = parsed.header.indexOf('delivered_mbps')
  if (dCol < 0 || gCol < 0) return null
  let demand = 0
  let delivered = 0
  for (const cells of parsed.body) {
    const d = Number(cells[dCol])
    const g = Number(cells[gCol])
    if (!Number.isFinite(d) || !Number.isFinite(g)) continue
    demand += d
    delivered += g
  }
  return demand > 0 ? Math.min(1, delivered / demand) : null
}
