import assert from 'node:assert/strict'
import test from 'node:test'
import type { Evaluation } from '../src/lib/experimentIndex.ts'
import { experimentLabel, policyLabel, rewardLabel } from '../src/lib/rlLabels.ts'

const evaluation = (label: string, components: string[]) => ({
  label,
  rewardSchema: { components },
}) as Evaluation

test('replay labels distinguish reward variants using the saved schema', () => {
  assert.equal(rewardLabel(evaluation('healthy-o1-binary', ['service_success'])), 'Binary +1/−1')
  assert.equal(rewardLabel(evaluation('healthy-o1-sinr', ['sinr_quality'])), 'SINR quality (0–1)')
  assert.equal(rewardLabel({ ...evaluation('sinr-movement', ['sinr_quality', 'travel_fraction']), rewardSchema: { components: ['sinr_quality', 'travel_fraction'], weights: [1, -0.02] } }), 'SINR quality − movement')
  assert.equal(rewardLabel(evaluation('unlabelled', [])), 'unlabelled')
})

test('policy and experiment labels are readable', () => {
  assert.equal(policyLabel('model'), 'Trained model')
  assert.equal(policyLabel('hold'), 'Hold position')
  assert.equal(experimentLabel('rl-01-healthy-binary-vs-sinr'), 'Healthy Binary vs SINR')
  assert.equal(experimentLabel('rl-0-healthy-1km-2mbps-3seed-300ep'), '0 · Healthy 1 km 2 Mbps 3 seeds 300 episodes')
})
