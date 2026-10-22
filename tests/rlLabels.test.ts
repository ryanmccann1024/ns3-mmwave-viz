import assert from 'node:assert/strict'
import test from 'node:test'
import type { Evaluation } from '../src/lib/experimentIndex.ts'
import {
  baselineStatusLabel,
  experimentLabel,
  gradedRewardExplanation,
  objectiveLabel,
  policyLabel,
  rewardLabel,
  rewardComponentLabel,
  rewardWeightLabel,
} from '../src/lib/rlLabels.ts'
import {
  NODE_TRAIL_PALETTE,
  TRAIL_COLOR_DEFAULT,
  TRAIL_COLORS,
  trailColor,
} from '../src/styles/tokens.ts'

const evaluation = (label: string, components: string[]) =>
  ({
    label,
    rewardSchema: { components },
  }) as Evaluation

test('Level 1 mission labels describe graded reward without the binary payoff suffix', () => {
  const expected: Record<string, string> = {
    connected_outdoor_area_fraction_v1: 'Connected area covered (0–1)',
    team_target_distance_score_v1: 'Team target proximity (0–1)',
    survivor_critical_delivery_fraction_v1: 'Survivor delivery ratio (0–1)',
    jammed_traffic_delivery_fraction_v1: 'Delivery during jamming (0–1)',
  }
  for (const [component, label] of Object.entries(expected))
    assert.equal(rewardLabel(evaluation('Level 1', [component])), label)
})

test('reward weights are multipliers and all four graded rewards explain calculation and timing', () => {
  assert.equal(rewardWeightLabel(1), '×1')
  assert.equal(rewardWeightLabel(-0.02), '×-0.02')
  assert.equal(rewardWeightLabel(0), '×0')
  const recovery = gradedRewardExplanation('survivor_critical_delivery_fraction_v1')!
  assert.match(
    recovery.calculation,
    /critical traffic delivered ÷ requested between surviving nodes/
  )
  assert.match(recovery.calculation, /Failed-node traffic excluded/)
  assert.match(recovery.example, /70%.*0\.70/)
  assert.match(recovery.timing, /Fully post-failure windows only; otherwise 0.*No demand/)
  const jamming = gradedRewardExplanation('jammed_traffic_delivery_fraction_v1')!
  assert.match(jamming.calculation, /total traffic delivered ÷ total traffic requested/)
  assert.match(jamming.timing, /fully after emission starts only; otherwise 0.*No demand/)
  const coverage = gradedRewardExplanation('connected_outdoor_area_fraction_v1')!
  assert.match(
    coverage.calculation,
    /largest connected peer group.*total outdoor area.*Buildings excluded/
  )
  const investigation = gradedRewardExplanation('team_target_distance_score_v1', {
    component_details: {
      team_target_distance_score_v1: { contract: { mission: { team_radius_m: 75 } } },
    },
  })!
  assert.match(
    investigation.calculation,
    /mean distance beyond the 75 m target radius ÷ field diagonal/
  )
  assert.match(investigation.example, /20%.*0\.80/)
  assert.match(investigation.timing, /no available peers/i)
  assert.equal(gradedRewardExplanation('level0_recovery_v1'), null)
})

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
  assert.equal(trailColor('zzz'), TRAIL_COLOR_DEFAULT)
  const policies = ['model', 'hold', 'random_valid', 'scripted', 'geometric', 'optimization']
  const known = policies.map((p) => TRAIL_COLORS[p])
  assert.ok(known.every(Boolean))
  assert.equal(new Set([...known, TRAIL_COLOR_DEFAULT]).size, known.length + 1)
  // ghosts of other policies never share a colour with a live replay node's trail
  for (const p of policies.filter((p) => p !== 'model')) {
    assert.ok(!NODE_TRAIL_PALETTE.includes(trailColor(p)), p)
  }
})

test('Phase 3 component names describe the measured variable', () => {
  for (const [id, expected] of Object.entries({
    available_peer_travel_fraction_v1: 'Actual travel ÷ permitted travel',
    worst_peer_target_proximity_v1: 'Farthest peer target proximity',
    boundary_contact_fraction_v1: 'Fraction of peers contacting a wall',
    weakest_active_delivery_fraction_v1: 'Least-served active peer delivery',
    followers_investigator_then_target_proximity_v1: 'Followers approach investigator, then target',
  }))
    assert.equal(rewardComponentLabel(id), expected)
})

test('Coordinated mission labels remain short and explain exact saved formulas', () => {
  const component = 'coordinated_investigation_adaptive_v1'
  const formula = 'approach: 0.70 Q + 0.30 A; settle: 0.10 Q + 0.60 A + 0.20 K + 0.10 D'
  const schema = { component_details: { [component]: { formula } } }
  assert.equal(rewardComponentLabel(component, schema), 'Approach then establish (adaptive)')
  const description = gradedRewardExplanation(component, schema)
  assert.equal(description?.calculation, formula)
  assert.match(description?.example ?? '', /100 m/)
  assert.match(description?.timing ?? '', /30 seconds/)
  assert.match(description?.timing ?? '', /5 seconds/)
})


test('Phase 7 short labels and explanations distinguish radio deficit and capped area', () => {
  assert.equal(rewardComponentLabel('coordinated_service_bridge_v1'), 'Service + team radio')
  assert.equal(rewardComponentLabel('coordinated_coverage_sufficient_v1'), 'Sufficient area + service')
  const service = gradedRewardExplanation('coordinated_service_bridge_v1')
  assert.ok(service?.example.includes('whole available team'))
  const area = gradedRewardExplanation('coordinated_coverage_sufficient_v1')
  assert.ok(area?.example.includes('stops increasing'))
})
