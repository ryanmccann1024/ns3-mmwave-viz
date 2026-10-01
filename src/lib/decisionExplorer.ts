// Pure data layer for the Decisions explorer. Everything is keyed by the integer
// `decision` value from steps.jsonl, never by array row. Inputs for action n come
// only from record n-1; a sampled-out n-1 is reported, never substituted.

import type { ParseStepsResult, StepRecord, StepReward, SlotMask } from './episodeTelemetry.ts'
import { maskBySlot, recordForDecision } from './episodeTelemetry.ts'

export type EpisodeTelemetry = Extract<ParseStepsResult, { ok: true }>

export type Unavailable = { status: 'unavailable'; reason: string }

export interface DecisionInput {
  status: 'exact'
  /** n-1 */
  sourceDecision: number
  tick: number
  timeS: number
  /** optional in older telemetry; null never means an exact vector was recovered */
  obsSha256: string | null
  /** flat, from record n-1 */
  mask: number[]
  /** via maskBySlot(); null if the contract shape does not fit */
  maskBySlot: SlotMask[] | null
}

export interface DecisionAction {
  requested: number[]
  revalidatedSlots: number[]
  applied: { status: 'derived'; values: number[] } | Unavailable
}

export interface DecisionOutcome {
  tick: number
  timeS: number
  ticksInStep: number
  /** null when tick_s is unavailable */
  intervalStartS: number | null
  /** timeS */
  intervalEndS: number
  reward: StepReward | null
}

export interface DecisionJoin {
  decision: number
  kind: 'reset' | 'action'
  /** null for reset */
  input: DecisionInput | { status: 'missing_source'; sourceDecision: number } | null
  /** null for reset */
  action: DecisionAction | Unavailable | null
  /** null for reset */
  outcome: DecisionOutcome | null
  /** record n */
  record: StepRecord
  /** record n-1 or null */
  sourceRecord: StepRecord | null
}

export interface DecisionGap {
  /** last present decision before the hole */
  afterDecision: number
  /** first present decision after the hole; for a trailing hole, expected + 1 */
  beforeDecision: number
  missing: number
}

export interface DecisionIndex {
  /** sorted ascending, unique */
  decisions: Int32Array
  /** record time_s */
  timesS: Float64Array
  /** record ticks_in_step */
  ticksInStep: Float64Array
  /** NaN when reward null */
  rewardTotals: Float64Array
  revalCounts: Uint16Array
  gaps: DecisionGap[]
  minDecision: number
  maxDecision: number
  /** validated contract.num_decisions when present; otherwise the observed last decision */
  expected: number
  /** false when no trustworthy declared count exists; never invent a trailing gap then */
  coverageKnown: boolean
  holdIndex: number | null
  tickS: number | null
}

export interface Bucket {
  /** column index */
  x: number
  firstDecision: number
  lastDecision: number
  count: number
  /** NaN when count === 0 or all rewards null */
  minReward: number
  maxReward: number
  revalCount: number
  hasGap: boolean
}

/** Narrow a value-or-Unavailable union (DecisionAction has no status field of its own). */
export function isUnavailable<T extends object>(value: T | Unavailable): value is Unavailable {
  return 'status' in value && (value as { status?: unknown }).status === 'unavailable'
}

export const APPLIED_UNAVAILABLE_REASON = "no unique 'hold' action in contract.action_meanings"

/** Index of the single action whose meaning is "hold" (trimmed, case-insensitive); null if none or several. */
export function resolveHoldIndex(actionMeanings: readonly string[]): number | null {
  let found: number | null = null
  for (let i = 0; i < actionMeanings.length; i++) {
    const meaning = actionMeanings[i]
    if (typeof meaning !== 'string' || meaning.trim().toLowerCase() !== 'hold') continue
    if (found !== null) return null
    found = i
  }
  return found
}

/** Requested action with every revalidated slot replaced by hold; unavailable without a unique hold. */
export function deriveApplied(
  requested: readonly number[],
  revalidated: readonly number[],
  holdIndex: number | null
): DecisionAction['applied'] {
  if (holdIndex === null) return { status: 'unavailable', reason: APPLIED_UNAVAILABLE_REASON }
  const values = Array.from(requested)
  for (const slot of revalidated) {
    if (Number.isInteger(slot) && slot >= 0 && slot < values.length) values[slot] = holdIndex
  }
  return { status: 'derived', values }
}

function tickSOf(contract: { tick_s?: number }): number | null {
  const t = contract.tick_s
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null
}

/**
 * Validates and indexes the saved records. Throws a descriptive error on a
 * non-integer or duplicate decision, non-ascending decision order, reversed or
 * non-integer ticks, or nonfinite/non-increasing times: malformed order is an
 * error, not a fabricated trajectory.
 */
export function buildDecisionIndex(t: EpisodeTelemetry): DecisionIndex {
  const steps = t.steps
  const n = steps.length
  const decisions = new Int32Array(n)
  const timesS = new Float64Array(n)
  const ticksInStep = new Float64Array(n)
  const rewardTotals = new Float64Array(n)
  const revalCounts = new Uint16Array(n)

  for (let i = 0; i < n; i++) {
    const s = steps[i]
    if (!Number.isInteger(s.decision) || s.decision < 0) {
      throw new Error(`steps.jsonl record ${i} has a non-integer decision ${String(s.decision)}`)
    }
    if (!Number.isInteger(s.tick)) {
      throw new Error(`decision ${s.decision} has a non-integer tick ${String(s.tick)}`)
    }
    if (!Number.isFinite(s.time_s)) {
      throw new Error(`decision ${s.decision} has a nonfinite time_s`)
    }
    if (i > 0) {
      const prev = steps[i - 1]
      if (s.decision === prev.decision) {
        throw new Error(`duplicate decision ${s.decision} in steps.jsonl`)
      }
      if (s.decision < prev.decision) {
        throw new Error(
          `decisions are not in ascending order (${prev.decision} then ${s.decision})`
        )
      }
      if (s.tick <= prev.tick) {
        throw new Error(`tick does not increase from decision ${prev.decision} to ${s.decision}`)
      }
      if (s.time_s <= prev.time_s) {
        throw new Error(`time_s does not increase from decision ${prev.decision} to ${s.decision}`)
      }
    }
    decisions[i] = s.decision
    timesS[i] = s.time_s
    ticksInStep[i] = Number.isFinite(s.ticks_in_step) ? s.ticks_in_step : NaN
    rewardTotals[i] =
      s.reward && typeof s.reward.total === 'number' && Number.isFinite(s.reward.total)
        ? s.reward.total
        : NaN
    const reval = Array.isArray(s.revalidated_slots) ? s.revalidated_slots.length : 0
    revalCounts[i] = Math.min(reval, 0xffff)
  }

  const minDecision = n > 0 ? decisions[0] : 0
  const maxDecision = n > 0 ? decisions[n - 1] : -1

  const declared = t.header.contract.num_decisions
  const coverageKnown =
    typeof declared === 'number' &&
    Number.isInteger(declared) &&
    declared > 0 &&
    declared >= maxDecision
  const expected = coverageKnown ? declared : maxDecision

  const gaps: DecisionGap[] = []
  for (let i = 1; i < n; i++) {
    const missing = decisions[i] - decisions[i - 1] - 1
    if (missing > 0) {
      gaps.push({ afterDecision: decisions[i - 1], beforeDecision: decisions[i], missing })
    }
  }
  if (coverageKnown && n > 0 && expected > maxDecision) {
    gaps.push({
      afterDecision: maxDecision,
      beforeDecision: expected + 1,
      missing: expected - maxDecision,
    })
  }

  return {
    decisions,
    timesS,
    ticksInStep,
    rewardTotals,
    revalCounts,
    gaps,
    minDecision,
    maxDecision,
    expected,
    coverageKnown,
    holdIndex: resolveHoldIndex(t.header.contract.action_meanings ?? []),
    tickS: tickSOf(t.header.contract),
  }
}

/** First position whose decision >= value (== length when none). */
function lowerBound(decisions: Int32Array, value: number): number {
  let lo = 0
  let hi = decisions.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (decisions[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Position of an exactly present decision, or -1. */
function positionOf(idx: DecisionIndex, decision: number): number {
  const p = lowerBound(idx.decisions, decision)
  return p < idx.decisions.length && idx.decisions[p] === decision ? p : -1
}

/** The explorer's exact view of decision n; null when record n was not saved. */
export function joinDecision(
  t: EpisodeTelemetry,
  idx: DecisionIndex,
  n: number
): DecisionJoin | null {
  const record = recordForDecision(t, n)
  if (!record) return null
  if (n === 0) {
    return {
      decision: 0,
      kind: 'reset',
      input: null,
      action: null,
      outcome: null,
      record,
      sourceRecord: null,
    }
  }
  const sourceRecord = recordForDecision(t, n - 1)
  const input: DecisionJoin['input'] = sourceRecord
    ? {
        status: 'exact',
        sourceDecision: n - 1,
        tick: sourceRecord.tick,
        timeS: sourceRecord.time_s,
        obsSha256: typeof sourceRecord.obs_sha256 === 'string' ? sourceRecord.obs_sha256 : null,
        mask: Array.isArray(sourceRecord.mask) ? sourceRecord.mask : [],
        maskBySlot: Array.isArray(sourceRecord.mask)
          ? maskBySlot(t.header.contract, sourceRecord)
          : null,
      }
    : { status: 'missing_source', sourceDecision: n - 1 }

  const action: DecisionJoin['action'] = Array.isArray(record.action_sent)
    ? {
        requested: record.action_sent,
        revalidatedSlots: Array.isArray(record.revalidated_slots) ? record.revalidated_slots : [],
        applied: deriveApplied(
          record.action_sent,
          Array.isArray(record.revalidated_slots) ? record.revalidated_slots : [],
          idx.holdIndex
        ),
      }
    : { status: 'unavailable', reason: 'no action_sent in record' }

  const ticksInStep = record.ticks_in_step
  const intervalStartS =
    idx.tickS !== null && Number.isFinite(ticksInStep) && ticksInStep > 0
      ? record.time_s - ticksInStep * idx.tickS
      : null
  const outcome: DecisionOutcome = {
    tick: record.tick,
    timeS: record.time_s,
    ticksInStep,
    intervalStartS,
    intervalEndS: record.time_s,
    reward: record.reward ?? null,
  }
  return { decision: n, kind: 'action', input, action, outcome, record, sourceRecord }
}

/** The present decision closest to the guess (the earlier one on a tie). */
export function nearestDecision(idx: DecisionIndex, decisionGuess: number): number {
  const d = idx.decisions
  if (d.length === 0) return 0
  const guess = Number.isFinite(decisionGuess) ? decisionGuess : d[0]
  const p = lowerBound(d, guess)
  if (p >= d.length) return d[d.length - 1]
  if (p === 0) return d[0]
  const after = d[p]
  const before = d[p - 1]
  return after - guess < guess - before ? after : before
}

const TIME_EPSILON = 1e-9

/**
 * The decision whose saved outcome window (time_s - ticks_in_step*tick_s, time_s]
 * contains timeS, with t = 0 mapping to a present reset; null in unsaved gaps
 * and when tick_s is unknown. Same half-open rule as decisionAt().
 */
export function decisionAtTime(idx: DecisionIndex, timeS: number): number | null {
  if (!Number.isFinite(timeS) || timeS < -TIME_EPSILON) return null
  const n = idx.decisions.length
  if (n === 0) return null
  if (Math.abs(timeS) <= TIME_EPSILON) {
    const p = positionOf(idx, 0)
    return p >= 0 && Math.abs(idx.timesS[p]) <= TIME_EPSILON ? 0 : null
  }
  // first position with time_s >= t - eps
  let lo = 0
  let hi = n - 1
  let found = n
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (idx.timesS[mid] >= timeS - TIME_EPSILON) {
      found = mid
      hi = mid - 1
    } else lo = mid + 1
  }
  if (found >= n) return null
  const decision = idx.decisions[found]
  if (decision === 0 || idx.tickS === null) return null
  const ticks = idx.ticksInStep[found]
  if (!Number.isFinite(ticks) || ticks <= 0) return null
  const end = idx.timesS[found]
  const start = end - ticks * idx.tickS
  return timeS > start + TIME_EPSILON && timeS <= end + TIME_EPSILON ? decision : null
}

/**
 * The next (delta=1) or previous (delta=-1) present decision after `from`,
 * skipping gaps and staying inside the inclusive range; null at the edge.
 */
export function stepDecision(
  idx: DecisionIndex,
  from: number,
  delta: 1 | -1,
  range?: [number, number]
): number | null {
  const d = idx.decisions
  if (d.length === 0) return null
  const p = lowerBound(d, from)
  let next: number
  if (delta === 1) {
    next = p < d.length && d[p] === from ? p + 1 : p
  } else {
    next = p - 1
  }
  if (next < 0 || next >= d.length) return null
  const value = d[next]
  if (range && (value < range[0] || value > range[1])) return null
  return value
}

/** Pixel column that bucketize assigns to a decision, including when columns exceed decisions. */
export function columnForDecision(
  decision: number,
  domain: [number, number],
  columns: number
): number {
  const cols = Math.floor(columns)
  const span = domain[1] - domain[0] + 1
  if (cols <= 0 || span <= 0) return 0
  const owningColumn = Math.ceil(((decision - domain[0] + 1) * cols) / span) - 1
  return Math.min(cols - 1, Math.max(0, owningColumn))
}

/**
 * Aggregates the decisions of `domain` (default: observed first decision through
 * the expected last) into `columns` buckets. Each bucket records exact min/max
 * reward over the decisions it covers (count === 1 means an exact value) and
 * whether any decision inside it is missing. O(N_in_domain + columns).
 */
export function bucketize(
  idx: DecisionIndex,
  columns: number,
  domain?: [number, number]
): Bucket[] {
  const cols = Math.max(0, Math.floor(columns))
  const out: Bucket[] = []
  if (cols === 0 || idx.decisions.length === 0) return out
  const lo = domain ? Math.min(domain[0], domain[1]) : idx.minDecision
  const hi = domain ? Math.max(domain[0], domain[1]) : idx.expected
  const span = hi - lo + 1
  if (span <= 0) return out
  const coveredLo = idx.minDecision
  const coveredHi = idx.expected
  let p = lowerBound(idx.decisions, lo)
  for (let x = 0; x < cols; x++) {
    const first = lo + Math.floor((x * span) / cols)
    const lastRaw = lo + Math.floor(((x + 1) * span) / cols) - 1
    const last = Math.max(first, lastRaw)
    // Columns narrower than one decision share it; only one of them owns it.
    const owns = lastRaw >= first
    let count = 0
    let minReward = NaN
    let maxReward = NaN
    let revalCount = 0
    if (owns) {
      while (p < idx.decisions.length && idx.decisions[p] <= last) {
        count++
        const r = idx.rewardTotals[p]
        if (!Number.isNaN(r)) {
          if (Number.isNaN(minReward) || r < minReward) minReward = r
          if (Number.isNaN(maxReward) || r > maxReward) maxReward = r
        }
        revalCount += idx.revalCounts[p]
        p++
      }
    }
    const expectedLo = Math.max(first, coveredLo)
    const expectedHi = Math.min(last, coveredHi)
    const expectedCount = owns ? Math.max(0, expectedHi - expectedLo + 1) : 0
    out.push({
      x,
      firstDecision: first,
      lastDecision: last,
      count,
      minReward,
      maxReward,
      revalCount,
      hasGap: expectedCount > count,
    })
  }
  return out
}

/** Inclusive brush range using the same decision ownership as the timeline buckets. */
export function brushRangeForColumns(
  buckets: readonly Bucket[],
  startColumn: number,
  endColumn: number
): [number, number] | null {
  if (buckets.length === 0 || !Number.isFinite(startColumn) || !Number.isFinite(endColumn))
    return null
  const lo = Math.max(0, Math.min(buckets.length - 1, Math.floor(Math.min(startColumn, endColumn))))
  const hi = Math.max(0, Math.min(buckets.length - 1, Math.floor(Math.max(startColumn, endColumn))))
  return [buckets[lo].firstDecision, buckets[hi].lastDecision]
}

export type RowEntry = { kind: 'decision'; decision: number } | { kind: 'gap'; gap: DecisionGap }

export interface RowIndex {
  length: number
  rowAt(index: number): RowEntry | null
}

/**
 * A windowed row model over an inclusive decision range: one row per present
 * decision plus one collapsed row per hole, in decision order. Only the gap rows
 * are materialised; a visible row resolves in O(log N).
 */
export function makeRowIndex(idx: DecisionIndex, range: [number, number]): RowIndex {
  const lo = Math.min(range[0], range[1])
  const hi = Math.max(range[0], range[1])
  const pStart = lowerBound(idx.decisions, lo)
  const pEnd = lowerBound(idx.decisions, hi + 1)
  const presentCount = Math.max(0, pEnd - pStart)

  // Holes clipped to the range, each with the row index it occupies.
  const gapRows: { row: number; gap: DecisionGap }[] = []
  for (const g of idx.gaps) {
    const holeLo = Math.max(g.afterDecision + 1, lo)
    const holeHi = Math.min(g.beforeDecision - 1, hi)
    if (holeHi < holeLo) continue
    // present decisions in range that precede this hole
    const before = lowerBound(idx.decisions, holeLo) - pStart
    gapRows.push({
      row: before + gapRows.length,
      gap: { afterDecision: holeLo - 1, beforeDecision: holeHi + 1, missing: holeHi - holeLo + 1 },
    })
  }
  const length = presentCount + gapRows.length

  return {
    length,
    rowAt(index: number): RowEntry | null {
      if (!Number.isInteger(index) || index < 0 || index >= length) return null
      // number of gap rows at or before this index
      let a = 0
      let b = gapRows.length
      while (a < b) {
        const mid = (a + b) >> 1
        if (gapRows[mid].row <= index) a = mid + 1
        else b = mid
      }
      const gapsBefore = a
      if (gapsBefore > 0 && gapRows[gapsBefore - 1].row === index) {
        return { kind: 'gap', gap: gapRows[gapsBefore - 1].gap }
      }
      const p = pStart + (index - gapsBefore)
      return { kind: 'decision', decision: idx.decisions[p] }
    },
  }
}
