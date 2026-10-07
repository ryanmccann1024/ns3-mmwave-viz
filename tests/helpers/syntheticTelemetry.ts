// Deterministic synthetic steps.jsonl episodes for tests and measurements.
// Shapes follow the producer: decision 0 is the reset snapshot (tick 0,
// ticks_in_step 1, null action/reward); action n >= 1 carries the outcome
// interval (time_s - ticks_in_step*tick_s, time_s]; the pre-action mask and
// obs_sha256 for action n live in record n-1.

import type { StepRecord, StepsHeader } from '../../src/lib/episodeTelemetry.ts'
import type { EpisodeTelemetry } from '../../src/lib/decisionExplorer.ts'

export interface MakeTelemetryOptions {
  /** number of action decisions; records run 0..decisions */
  decisions: number
  slots?: number
  /** position of "hold" in action_meanings; null omits hold entirely */
  holdIndex?: number | null
  /** keep decision d only when d % sampledEvery === 0 or d is the last decision */
  sampledEvery?: number
  /** explicit decisions to drop after sampling */
  dropDecisions?: number[]
  resetOnly?: boolean
  /** every k-th action gets reward: null */
  rewardNullEvery?: number
  seed?: number
  /** include a small facts object per record (bigger text) */
  facts?: boolean
  /** write contract.num_decisions (default: equal to `decisions`); null omits it */
  numDecisions?: number | null
  tickS?: number
  ticksInStep?: number
  nodeIds?: string[]
  /** overrides the derived slot_node_ids (may contain null padding) */
  slotNodeIds?: (string | null)[]
  /** records with obs_sha256 (default true) */
  obsHash?: boolean
}

export interface TelemetryTruth {
  /** per present decision: its own mask and obs hash (the pre-action inputs of decision+1) */
  maskByDecision: Map<number, number[]>
  obsByDecision: Map<number, string>
  actionByDecision: Map<number, number[]>
  revalByDecision: Map<number, number[]>
  rewardByDecision: Map<number, number | null>
  presentDecisions: number[]
  droppedDecisions: number[]
}

export interface SyntheticTelemetry {
  telemetry: EpisodeTelemetry
  header: StepsHeader
  jsonl: string
  truth: TelemetryTruth
  actionMeanings: string[]
}

/** mulberry32: small, fast, deterministic */
export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hex64(rand: () => number): string {
  let out = ''
  for (let i = 0; i < 8; i++) out += ((rand() * 0x100000000) >>> 0).toString(16).padStart(8, '0')
  return out
}

export function makeTelemetry(options: MakeTelemetryOptions): SyntheticTelemetry {
  const {
    decisions,
    slots = 3,
    holdIndex = 4,
    sampledEvery,
    dropDecisions = [],
    resetOnly = false,
    rewardNullEvery,
    seed = 1,
    facts = false,
    tickS = 0.5,
    ticksInStep = 2,
    obsHash = true,
  } = options
  const numDecisions = options.numDecisions === undefined ? decisions : options.numDecisions

  const moves = ['west', 'east', 'south', 'north']
  const actionMeanings = [...moves]
  if (holdIndex !== null) actionMeanings.splice(Math.min(holdIndex, moves.length), 0, 'hold')
  const nActions = actionMeanings.length

  const nodeIds =
    options.nodeIds ?? Array.from({ length: slots + 1 }, (_, i) => (i === 0 ? 'gw' : `node-${i}`))
  const slotNodeIds = options.slotNodeIds ?? nodeIds.slice(1, 1 + slots)

  const contract: Record<string, unknown> = {
    node_ids: nodeIds,
    slot_node_ids: slotNodeIds,
    action_meanings: actionMeanings,
    tick_s: tickS,
    decision_interval_s: tickS * ticksInStep,
  }
  if (numDecisions !== null) contract.num_decisions = numDecisions
  const header = {
    type: 'header',
    telemetry_version: 1,
    contract,
    observation_schema: { dtype: 'float32' },
    reward_schema: { components: ['delivery'] },
    selection: {},
  } as unknown as StepsHeader

  const rand = prng(seed)
  const dropped = new Set(dropDecisions)
  const truth: TelemetryTruth = {
    maskByDecision: new Map(),
    obsByDecision: new Map(),
    actionByDecision: new Map(),
    revalByDecision: new Map(),
    rewardByDecision: new Map(),
    presentDecisions: [],
    droppedDecisions: [],
  }
  const steps: StepRecord[] = []
  const lines: string[] = [JSON.stringify(header)]
  const last = resetOnly ? 0 : decisions

  for (let d = 0; d <= last; d++) {
    // Draw every record's values so sampling never changes the ground truth.
    const mask: number[] = []
    for (let i = 0; i < slots * nActions; i++) mask.push(rand() < 0.8 ? 1 : 0)
    const obs = hex64(rand)
    const action: number[] = []
    for (let s = 0; s < slots; s++) action.push(Math.floor(rand() * nActions))
    const reval: number[] = []
    for (let s = 0; s < slots; s++) if (rand() < 0.15) reval.push(s)
    const rewardTotal = Math.round((rand() * 2 - 0.5) * 1000) / 1000

    const keep =
      !(sampledEvery !== undefined && sampledEvery > 1 && d % sampledEvery !== 0 && d !== last) &&
      !dropped.has(d)
    if (!keep) {
      truth.droppedDecisions.push(d)
      continue
    }
    const isReset = d === 0
    const rewardNull = isReset || (rewardNullEvery !== undefined && d % rewardNullEvery === 0)
    const record: StepRecord = {
      type: 'step',
      decision: d,
      tick: isReset ? 0 : d * ticksInStep,
      time_s: isReset ? 0 : d * ticksInStep * tickS,
      ticks_in_step: isReset ? 1 : ticksInStep,
      action_sent: isReset ? null : action,
      mask,
      reward: rewardNull ? null : { total: rewardTotal, components: { delivery: rewardTotal } },
      legacy_reward: rewardTotal,
      revalidated_slots: isReset ? [] : reval,
    }
    if (obsHash) record.obs_sha256 = obs
    if (facts) record.facts = { nodes: [[d, 0, 1.5]], window: { ticks: ticksInStep } }
    steps.push(record)
    lines.push(JSON.stringify(record))
    truth.presentDecisions.push(d)
    truth.maskByDecision.set(d, mask)
    truth.obsByDecision.set(d, obs)
    truth.actionByDecision.set(d, isReset ? [] : action)
    truth.revalByDecision.set(d, isReset ? [] : reval)
    truth.rewardByDecision.set(d, rewardNull ? null : rewardTotal)
  }

  return {
    telemetry: { ok: true, header, steps },
    header,
    jsonl: lines.join('\n') + '\n',
    truth,
    actionMeanings,
  }
}
