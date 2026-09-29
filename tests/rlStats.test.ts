import test from 'node:test'
import assert from 'node:assert/strict'
import {
  actionShares,
  defaultWindow,
  meanComponents,
  rewardByDecision,
  rolling,
} from '../src/lib/rlStats.ts'
import type { StepRecord } from '../src/lib/episodeTelemetry.ts'

const step = (decision: number, total: number | null, actions: number[] | null = null) =>
  ({
    type: 'step',
    decision,
    tick: decision * 2,
    time_s: decision,
    ticks_in_step: 2,
    action_sent: actions,
    mask: [],
    reward: total === null ? null : { total, components: {} },
    revalidated_slots: [],
  }) as unknown as StepRecord

test('rolling keeps every point, shrinking the window at the start', () => {
  const r = rolling(
    [1, 2, 3, 4].map((value, x) => ({ x, value })),
    2
  )
  assert.deepEqual(
    r.map((p) => p.mean),
    [1, 1.5, 2.5, 3.5]
  )
  assert.deepEqual(r[0].band, [1, 1])
  const sd = Math.SQRT1_2
  assert.ok(Math.abs(r[1].band[1] - (1.5 + sd)) < 1e-12)
})

test('defaultWindow scales with run length within 3..25', () => {
  assert.equal(defaultWindow(4), 3)
  assert.equal(defaultWindow(100), 10)
  assert.equal(defaultWindow(1000), 25)
})

test('rewardByDecision summarises seeds per decision and skips unawarded steps', () => {
  const bands = rewardByDecision([
    [step(0, null), step(1, 1), step(2, 3)],
    [step(0, null), step(1, 2), step(2, 1)],
  ])
  assert.deepEqual(bands, [
    { decision: 1, mean: 1.5, range: [1, 2], seeds: 2 },
    { decision: 2, mean: 2, range: [1, 3], seeds: 2 },
  ])
})

test('actionShares counts every slot action and ignores unsent decisions', () => {
  const shares = actionShares([[step(0, null), step(1, 1, [0, 1, 1, 2])]], ['west', 'east', 'hold'])
  assert.deepEqual(
    shares.map((s) => [s.action, s.count, s.share]),
    [
      ['west', 1, 0.25],
      ['east', 2, 0.5],
      ['hold', 1, 0.25],
    ]
  )
})

test('meanComponents averages each component over the episodes that report it', () => {
  assert.deepEqual(meanComponents([{ a: 2, b: 1 }, { a: 4 }, null]), { a: 3, b: 1 })
})
