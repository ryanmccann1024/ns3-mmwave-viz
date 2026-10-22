import test from 'node:test'
import assert from 'node:assert/strict'
import { missionSummary, missionObjective, objectiveValue } from '../src/lib/missionObjective.ts'
import type { Evaluation } from '../src/lib/experimentIndex.ts'
const row = (label: string, kind: string, metrics: Record<string, number>, dir = label) =>
  ({
    label,
    missionKind: kind,
    episodes: [{ policy: 'model', dir, status: 'completed', metrics }],
  }) as Evaluation
test('scenario summary selects one reward variant instead of averaging unlike variants', () => {
  const result = missionSummary({
    evaluations: [
      row('A', 'coverage', { final_minute_coverage: 0.8, final_minute_survivor_delivery: 1 }),
      row('B', 'coverage', { final_minute_coverage: 0.4, final_minute_survivor_delivery: 1 }),
    ],
  })!
  assert.equal(result.model!.label, 'A')
  assert.equal(result.model!.value, 0.8)
})
test('coverage headline retains a service floor', () => {
  const result = missionSummary({
    evaluations: [
      row('High coverage bad service', 'coverage', {
        final_minute_coverage: 0.99,
        final_minute_survivor_delivery: 0.3,
      }),
      row('Useful coverage', 'coverage', {
        final_minute_coverage: 0.8,
        final_minute_survivor_delivery: 1,
      }),
    ],
  })!
  assert.equal(result.model!.label, 'Useful coverage')
})
test('recovery selects sustained outcomes and never substitutes a latched success flag', () => {
  const lost = row('Transient', 'recovery', {
    recovery_success: 1,
    recovery_sustained_final: 0,
    final_minute_survivor_delivery: 0.1,
  })
  const good = row('Maintained', 'recovery', {
    recovery_sustained_final: 1,
    final_minute_survivor_delivery: 1,
  })
  assert.equal(missionSummary({ evaluations: [lost, good] })!.model!.label, 'Maintained')
  assert.equal(
    missionObjective(
      row('Old', 'recovery', { recovery_success: 1, final_minute_survivor_delivery: 0.1 })
    )!.metric,
    'final_minute_survivor_delivery'
  )
})
test('zero disruption is a measured best result, not missing data', () => {
  const result = missionSummary({
    evaluations: [
      row('Jammed', 'jamming', { jammer_disruption_s: 200 }),
      row('Escaped', 'jamming', { jammer_disruption_s: 0 }),
    ],
  })!
  assert.equal(result.model!.label, 'Escaped')
  assert.equal(objectiveValue(0, result.objective), '0 s')
})
test('same reward configuration averages training seeds and baseline repeats are deduplicated', () => {
  const first = row('A', 'coverage', {
    final_minute_coverage: 0.8,
    final_minute_survivor_delivery: 1,
  })
  const second = row(
    'A',
    'coverage',
    { final_minute_coverage: 0.6, final_minute_survivor_delivery: 1 },
    'second'
  )
  for (const e of [first, second])
    e.episodes.push({
      policy: 'scripted',
      dir: 'shared',
      status: 'completed',
      metrics: { final_minute_coverage: 0.9 },
    } as Evaluation['episodes'][number])
  const result = missionSummary({ evaluations: [first, second] })!
  assert.equal(result.model!.value, 0.7)
  assert.equal(result.baseline!.value, 0.9)
})

test('new recovery diagnostic distinguishes reactive restoration from pre-clustering', () => {
  const preclustered = row('Before fault', 'recovery', { recovery_sustained_final: 1, reactive_recovery_success: 0, final_minute_survivor_delivery: 1 })
  const reacted = row('After fault', 'recovery', { recovery_sustained_final: 1, reactive_recovery_success: 1, final_minute_survivor_delivery: 1 })
  const result = missionSummary({ evaluations: [preclustered, reacted] })!
  assert.equal(result.objective.metric, 'reactive_recovery_success')
  assert.equal(result.model!.label, 'After fault')
})
