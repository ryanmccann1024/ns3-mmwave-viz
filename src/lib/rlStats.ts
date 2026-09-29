// Summaries behind the RL charts. Pure functions over already-parsed records.

import type { StepRecord } from './episodeTelemetry.ts'

export interface RollingPoint {
  x: number
  value: number
  mean: number
  /** mean ± one standard deviation over the trailing window */
  band: [number, number]
}

/**
 * Trailing-window mean and spread. The window shrinks at the start of the series
 * rather than dropping points, so the curve begins at the first episode.
 */
export function rolling(points: { x: number; value: number }[], window: number): RollingPoint[] {
  const w = Math.max(1, Math.floor(window))
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - w + 1), i + 1).map((q) => q.value)
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length
    const sd =
      slice.length > 1
        ? Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1))
        : 0
    return { x: p.x, value: p.value, mean, band: [mean - sd, mean + sd] }
  })
}

/** A window that smooths without flattening: about a tenth of the run, 3 to 25 episodes. */
export function defaultWindow(count: number): number {
  return Math.min(25, Math.max(3, Math.round(count / 10)))
}

export interface DecisionBandPoint {
  decision: number
  mean: number
  /** lowest and highest value across seeds at this decision */
  range: [number, number]
  seeds: number
}

/**
 * Mean per-tick reward for each decision window, summarised across seeds (one
 * step list per seed). Decisions without an awarded reward are skipped.
 */
export function rewardByDecision(runs: StepRecord[][]): DecisionBandPoint[] {
  const byDecision = new Map<number, number[]>()
  for (const steps of runs) {
    for (const s of steps) {
      if (!s.reward || typeof s.reward.total !== 'number') continue
      const list = byDecision.get(s.decision) ?? []
      list.push(s.reward.total)
      byDecision.set(s.decision, list)
    }
  }
  return [...byDecision.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decision, vals]) => ({
      decision,
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      range: [Math.min(...vals), Math.max(...vals)] as [number, number],
      seeds: vals.length,
    }))
}

/** Share of each action among every slot's sent actions, across the given episodes. */
export function actionShares(
  runs: StepRecord[][],
  actionMeanings: string[]
): { action: string; share: number; count: number }[] {
  const counts = new Array(actionMeanings.length).fill(0) as number[]
  let total = 0
  for (const steps of runs) {
    for (const s of steps) {
      for (const a of s.action_sent ?? []) {
        if (a >= 0 && a < counts.length) {
          counts[a]++
          total++
        }
      }
    }
  }
  return actionMeanings.map((action, i) => ({
    action,
    count: counts[i],
    share: total ? counts[i] / total : 0,
  }))
}

/** Mean of each reward component's episode sum, over the given episodes. */
export function meanComponents(sums: (Record<string, number> | null)[]): Record<string, number> {
  const totals: Record<string, { sum: number; n: number }> = {}
  for (const s of sums) {
    for (const [k, v] of Object.entries(s ?? {})) {
      const t = (totals[k] ??= { sum: 0, n: 0 })
      t.sum += v
      t.n++
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([k, t]) => [k, t.sum / t.n]))
}
