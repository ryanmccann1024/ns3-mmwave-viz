import assert from 'node:assert/strict'
import test from 'node:test'
import type { Evaluation } from '../src/lib/experimentIndex.ts'
import {
  baselineStatusLabel,
  experimentLabel,
  objectiveLabel,
  policyLabel,
  rewardLabel,
} from '../src/lib/rlLabels.ts'
import { TRAIL_COLORS, trailColor } from '../src/styles/tokens.ts'

const evaluation = (label: string, components: string[]) =>
  ({
    label,
    rewardSchema: { components },
  }) as Evaluation

test('replay labels distinguish reward variants using the saved schema', () => {
  assert.equal(rewardLabel(evaluation('healthy-o1-binary', ['service_success'])), 'Binary +1/−1')
  assert.equal(rewardLabel(evaluation('healthy-o1-sinr', ['sinr_quality'])), 'SINR quality (0–1)')
  assert.equal(
    rewardLabel({
      ...evaluation('sinr-movement', ['sinr_quality', 'travel_fraction']),
      rewardSchema: { components: ['sinr_quality', 'travel_fraction'], weights: [1, -0.02] },
    }),
    'SINR quality − movement'
  )
  assert.equal(
    rewardLabel(
      evaluation('mesh', [
        'delivery_ratio',
        'unmet_sinr_quality',
        'connectivity',
        'span_travel_fraction',
        'unsafe_proximity_fraction',
      ])
    ),
    'Service + mesh'
  )
  assert.equal(
    rewardLabel(evaluation('span', ['sinr_quality', 'span_travel_fraction'])),
    'SINR − span travel'
  )
  assert.equal(rewardLabel(evaluation('throughput', ['throughput_mbps'])), 'Throughput')
  assert.equal(
    rewardLabel(
      evaluation('old-long-label', [
        'delivery_ratio',
        'sinr_quality',
        'connectivity',
        'travel_fraction',
        'unsafe_proximity_fraction',
      ])
    ),
    'Service + safety'
  )
  assert.equal(rewardLabel(evaluation('unlabelled', [])), 'unlabelled')
})

test('policy and experiment labels are readable', () => {
  assert.equal(policyLabel('model'), 'Trained model')
  assert.equal(policyLabel('hold'), 'Hold position')
  assert.equal(experimentLabel('rl-01-healthy-binary-vs-sinr'), 'Healthy Binary vs SINR')
  assert.equal(
    experimentLabel('rl-0-healthy-1km-2mbps-3seed-300ep'),
    '0 · Healthy 1 km 2 Mbps 3 seeds 300 episodes'
  )
})

test('baseline policies, objectives and statuses have labels', () => {
  assert.equal(policyLabel('geometric'), 'Geometric')
  assert.equal(policyLabel('optimization'), 'Optimization')
  assert.equal(policyLabel('random_valid'), 'Random valid moves')
  assert.equal(policyLabel('new_policy'), 'new policy')

  assert.equal(objectiveLabel('coverage'), 'Coverage')
  assert.equal(objectiveLabel('balanced'), 'Balanced')
  assert.equal(objectiveLabel('resilience'), 'Resilience')
  assert.equal(objectiveLabel(null), 'unknown')
  assert.equal(objectiveLabel('zeta'), 'zeta')
  assert.equal(objectiveLabel('constructor'), 'constructor')
  assert.equal(objectiveLabel('x'.repeat(40)), 'x'.repeat(32))

  const statuses = {
    preparing: 'Preparing',
    prepared: 'Prepared',
    running: 'Running',
    complete: 'Complete',
    failed: 'Failed',
    interrupted: 'Interrupted',
  } as const
  for (const [status, label] of Object.entries(statuses))
    assert.equal(baselineStatusLabel(status as keyof typeof statuses), label)
  assert.equal(baselineStatusLabel('unknown'), 'Unknown')
  assert.equal(baselineStatusLabel(null), 'Unknown')
})

test('baseline policies have distinct trail colours', () => {
  assert.equal(trailColor('geometric'), '#0d9488')
  assert.equal(trailColor('optimization'), '#ca8a04')
  assert.equal(trailColor('zzz'), '#475569')
  const known = ['model', 'hold', 'random_valid', 'geometric', 'optimization'].map(
    (p) => TRAIL_COLORS[p]
  )
  assert.ok(known.every(Boolean))
  assert.equal(new Set(known).size, known.length)
})
