import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decisionAt,
  decisionWindow,
  maskBySlot,
  parseSteps,
  recordForDecision,
  rewardComponents,
  rewardSeries,
  rewardState,
  slotActions,
} from '../src/lib/episodeTelemetry.ts'

const header = {
  telemetry_version: 1,
  contract: {
    node_ids: ['node-a', 'node-b', 'node-c'],
    slot_node_ids: ['node-b', 'node-c'],
    action_meanings: ['west', 'east', 'hold'],
    tick_s: 0.1,
  },
}

const step = (decision: number, extra: object = {}) => ({
  type: 'step',
  decision,
  tick: decision * 10,
  time_s: decision,
  ticks_in_step: decision === 0 ? 0 : 10,
  action_sent: decision === 0 ? null : [0, 2],
  mask: [1, 1, 1, 0, 1, 1],
  reward: decision === 0 ? null : { components: { delivery_ratio: 0.5 }, total: 0.5, valid: {} },
  revalidated_slots: [],
  ...extra,
})

const jsonl = (...records: object[]) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'

test('parses header and steps, tolerating a trailing blank line', () => {
  const parsed = parseSteps(jsonl(header, step(0), step(1), step(2)) + '\n')
  assert.ok(parsed.ok)
  assert.equal(parsed.steps.length, 3)
  assert.deepEqual(parsed.header.contract.slot_node_ids, ['node-b', 'node-c'])
})

test('unsupported version and malformed lines give clear errors', () => {
  const version = parseSteps(jsonl({ ...header, telemetry_version: 2 }, step(0)))
  assert.ok(!version.ok)
  assert.match(version.message, /unsupported telemetry_version 2/)
  const broken = parseSteps(jsonl(header, step(0)) + '{"type": "step", \n')
  assert.ok(!broken.ok)
  assert.match(broken.message, /line 3/)
})

test('step zero has no reward yet and is skipped in the series', () => {
  const parsed = parseSteps(jsonl(header, step(0), step(1), step(2)))
  assert.ok(parsed.ok)
  assert.equal(rewardState(parsed.steps[0]), 'not_yet_awarded')
  assert.equal(rewardState(parsed.steps[1]), 'awarded')
  assert.equal(slotActions(parsed.header.contract, parsed.steps[0]), null)
  assert.deepEqual(
    rewardSeries(parsed.steps).map((p) => [p.decision, p.total]),
    [
      [1, 0.5],
      [2, 0.5],
    ]
  )
})

test('saved actions and rewards describe the interval ending at the record', () => {
  const parsed = parseSteps(jsonl(header, step(0), step(1), step(2), step(3)))
  assert.ok(parsed.ok)
  const at = (t: number) => decisionAt(parsed.steps, t, 0.1)?.decision ?? null
  assert.equal(at(0), 0)
  assert.equal(at(0.25), 1)
  assert.equal(at(0.5), 1)
  assert.equal(at(0.999999), 1)
  assert.equal(at(1.0), 1)
  assert.equal(at(1.5), 2)
  assert.equal(at(2.5), 3)
  assert.deepEqual(decisionWindow(parsed.steps[1], 0.1), { start: 0, end: 1 })
  let tenTicks = 0
  for (let i = 0; i < 10; i++) tenTicks += 0.1
  assert.notEqual(tenTicks, 1)
  assert.equal(at(tenTicks), 1)
  assert.equal(at(99), null)
  assert.equal(decisionAt([], 1, 0.1), null)
  assert.equal(decisionAt(parsed.steps, 0.5, undefined), null)

  const sparse = [parsed.steps[0], parsed.steps[3]]
  assert.equal(decisionAt(sparse, 0.5, 0.1), null)
  assert.equal(decisionAt(sparse, 2.5, 0.1)?.decision, 3)
})

test('cpp reward records have a total and source without components', () => {
  const parsed = parseSteps(
    jsonl(header, step(0), step(1, { reward: { total: -1, source: 'cpp' } }))
  )
  assert.ok(parsed.ok)
  assert.equal(parsed.steps[1].reward?.source, 'cpp')
  assert.deepEqual(rewardComponents(parsed.steps[1]), [])
  assert.deepEqual(rewardSeries(parsed.steps)[0].components, {})
})

test('actions and masks are split per slot', () => {
  const parsed = parseSteps(jsonl(header, step(0), step(1)))
  assert.ok(parsed.ok)
  const { contract } = parsed.header
  assert.deepEqual(
    slotActions(contract, parsed.steps[1])?.map((a) => [a.nodeId, a.actionName]),
    [
      ['node-b', 'west'],
      ['node-c', 'hold'],
    ]
  )
  const masks = maskBySlot(contract, parsed.steps[1])
  assert.equal(masks?.length, 2)
  assert.deepEqual(
    masks?.[1].actions.map((a) => a.allowed),
    [false, true, true]
  )
  assert.equal(maskBySlot(contract, { ...parsed.steps[1], mask: [1, 1] }), null)
})

test('recordForDecision is keyed by decision value, not array row', () => {
  const parsed = parseSteps(jsonl(header, step(0), step(1), step(3)))
  assert.ok(parsed.ok)
  for (const n of [0, 1, 3]) assert.equal(recordForDecision(parsed, n)?.decision, n)
  assert.equal(recordForDecision(parsed, 2), null)
  assert.equal(recordForDecision(parsed, 4), null)
})
