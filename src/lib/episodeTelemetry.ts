// Reader for an episode's steps.jsonl: one header line, then one record per decision.

export const SUPPORTED_TELEMETRY_VERSION = 1

export interface TelemetryContract {
  node_ids: string[]
  slot_node_ids: string[]
  action_meanings: string[]
  tick_s?: number
  decision_interval_s?: number
  [key: string]: unknown
}

export interface StepsHeader {
  telemetry_version: number
  contract: TelemetryContract
  observation_schema?: unknown
  reward_schema?: unknown
  selection?: unknown
}

export interface StepReward {
  components?: Record<string, number>
  total: number
  valid?: Record<string, number>
  source?: string
}

export interface StepRecord {
  type: 'step'
  decision: number
  tick: number
  time_s: number
  ticks_in_step: number
  /** null at decision 0: nothing has been sent yet */
  action_sent: number[] | null
  mask: number[]
  /** null at decision 0: no reward has been awarded yet */
  reward: StepReward | null
  legacy_reward?: number | null
  revalidated_slots: number[]
  facts?: unknown
}

export type ParseStepsResult =
  | { ok: true; header: StepsHeader; steps: StepRecord[] }
  | { ok: false; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSteps(text: string): ParseStepsResult {
  const lines = text.split(/\r?\n/)
  let header: StepsHeader | null = null
  const steps: StepRecord[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      return { ok: false, message: `steps.jsonl line ${i + 1} is not valid JSON` }
    }
    if (!isRecord(value)) {
      return { ok: false, message: `steps.jsonl line ${i + 1} is not a JSON object` }
    }
    if (header === null) {
      if (value.telemetry_version !== SUPPORTED_TELEMETRY_VERSION) {
        return {
          ok: false,
          message:
            `unsupported telemetry_version ${String(value.telemetry_version)} in steps.jsonl ` +
            `(this viewer supports ${SUPPORTED_TELEMETRY_VERSION})`,
        }
      }
      if (!isRecord(value.contract)) {
        return { ok: false, message: 'steps.jsonl header has no contract' }
      }
      header = value as unknown as StepsHeader
      continue
    }
    if (value.type !== 'step') continue
    if (typeof value.time_s !== 'number' || typeof value.decision !== 'number') {
      return { ok: false, message: `steps.jsonl line ${i + 1} has no numeric time_s/decision` }
    }
    steps.push(value as unknown as StepRecord)
  }
  if (header === null) return { ok: false, message: 'steps.jsonl is empty' }
  return { ok: true, header, steps }
}

const TIME_EPSILON = 1e-9

export function decisionWindow(
  step: StepRecord,
  tickS: number | undefined
): { start: number; end: number } | null {
  if (
    step.decision === 0 ||
    tickS === undefined ||
    !Number.isFinite(tickS) ||
    tickS <= 0 ||
    !Number.isFinite(step.ticks_in_step) ||
    step.ticks_in_step <= 0
  )
    return null
  return { start: step.time_s - step.ticks_in_step * tickS, end: step.time_s }
}

/** A saved record describes the interval that ended at its time_s, not the next one. */
export function decisionAt(
  steps: StepRecord[],
  timeS: number,
  tickS: number | undefined
): StepRecord | null {
  if (!Number.isFinite(timeS) || timeS < -TIME_EPSILON) return null
  if (Math.abs(timeS) <= TIME_EPSILON)
    return (
      steps.find((step) => step.decision === 0 && Math.abs(step.time_s) <= TIME_EPSILON) ?? null
    )
  let lo = 0
  let hi = steps.length - 1
  let found = steps.length
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (steps[mid].time_s >= timeS - TIME_EPSILON) {
      found = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  const step = steps[found]
  if (!step) return null
  const window = decisionWindow(step, tickS)
  return window && timeS > window.start + TIME_EPSILON && timeS <= window.end + TIME_EPSILON
    ? step
    : null
}

export interface SlotAction {
  slot: number
  nodeId: string | null
  actionIndex: number
  /** null when the index is outside action_meanings */
  actionName: string | null
}

/** Action sent per slot; null when nothing was sent (decision 0). */
export function slotActions(contract: TelemetryContract, step: StepRecord): SlotAction[] | null {
  if (!step.action_sent) return null
  return step.action_sent.map((actionIndex, slot) => ({
    slot,
    nodeId: contract.slot_node_ids[slot] ?? null,
    actionIndex,
    actionName: contract.action_meanings[actionIndex] ?? null,
  }))
}

export interface SlotMask {
  slot: number
  nodeId: string | null
  actions: { actionIndex: number; actionName: string; allowed: boolean }[]
}

/** Split the flat mask (slots x actions) per slot; null when its length does not fit. */
export function maskBySlot(contract: TelemetryContract, step: StepRecord): SlotMask[] | null {
  const perSlot = contract.action_meanings.length
  if (perSlot === 0 || step.mask.length % perSlot !== 0) return null
  const out: SlotMask[] = []
  for (let slot = 0; slot * perSlot < step.mask.length; slot++) {
    out.push({
      slot,
      nodeId: contract.slot_node_ids[slot] ?? null,
      actions: contract.action_meanings.map((actionName, actionIndex) => ({
        actionIndex,
        actionName,
        allowed: step.mask[slot * perSlot + actionIndex] === 1,
      })),
    })
  }
  return out
}

export type RewardState = 'not_yet_awarded' | 'awarded'

export function rewardState(step: StepRecord): RewardState {
  return step.reward === null || step.reward === undefined ? 'not_yet_awarded' : 'awarded'
}

export interface RewardPoint {
  decision: number
  time_s: number
  total: number
  components: Record<string, number>
}

export function rewardComponents(step: StepRecord): [string, number][] {
  return Object.entries(step.reward?.components ?? {})
}

/** Per-decision reward for charting; decisions with no reward yet are skipped, not zeroed. */
export function rewardSeries(steps: StepRecord[]): RewardPoint[] {
  const out: RewardPoint[] = []
  for (const step of steps) {
    if (!step.reward) continue
    out.push({
      decision: step.decision,
      time_s: step.time_s,
      total: step.reward.total,
      components: step.reward.components ?? {},
    })
  }
  return out
}
