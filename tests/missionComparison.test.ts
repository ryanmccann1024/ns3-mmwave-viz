import test from 'node:test'
import assert from 'node:assert/strict'
import {
  historyEvaluations,
  mergedComparisonRows,
  comparisonRows,
  comparisonShade,
  missionMetadata,
  phaseFromPath,
  shortRewardTitle,
  matchesMissionFilters,
  ALL_FILTERS,
  missionColumns,
} from '../src/lib/missionComparison.ts'
import { mergeScenarioReport } from '../src/lib/missionCampaignIndex.ts'
import type { Evaluation, Experiment } from '../src/lib/experimentIndex.ts'
import { isCatalogFile } from '../src/lib/resultCatalog.ts'

const evaluation = (key: string, values: Record<string, number | null>, seed = 201) =>
  ({
    key,
    label: key,
    missionTags: { phase: 4, origin: 'New', terms: ['Delivery'] },
    policies: ['model', 'hold'],
    episodes: [
      {
        policy: 'model',
        seed,
        status: 'completed',
        dir: `${key}/${seed}`,
        metrics: values,
      },
      {
        policy: 'hold',
        seed: 201,
        status: 'completed',
        dir: 'baselines/hold/episode-0000',
        metrics: { post_event_delivery: 0.4 },
      },
    ],
  }) as unknown as Evaluation

test('source phase survives imported paths and explicit tags', () => {
  assert.equal(phaseFromPath('/outputs/custom/10-23-3/models/x'), 4)
  assert.equal(phaseFromPath('custom/10-23/phase-1/main/x'), 1)
  assert.equal(phaseFromPath('/custom/10-16-3/x'), null)
  assert.deepEqual(missionMetadata('', {}, { output_dir: '/saved/10-23-3/models/x' }), {
    phase: 4,
    origin: 'New',
    terms: [],
  })
  assert.deepEqual(
    missionMetadata(
      'custom/10-23-3',
      {},
      { imported_control: { source: '/outputs/custom/10-23-2/models/x' } }
    ),
    { phase: 3, origin: 'Historical', terms: [] }
  )
  assert.equal(
    missionMetadata('custom/10-23-4', { source_phase: 3, source_campaign: '10-23-2' }, {}).phase,
    3
  )
})
test('short names preserve term and weight distinctions without phase in title', () => {
  const schema = {
    components: [
      'survivor_critical_delivery_fraction_v1',
      'available_team_closeness_v1',
      'boundary_contact_fraction_v1',
    ],
    weights: [0.9, 0.3, -0.01],
  }
  assert.equal(
    shortRewardTitle(schema, 'old massive label'),
    'Delivery + Cohesion 0.3 + Wall contact'
  )
  assert.ok(!shortRewardTitle(schema, 'Phase 4').includes('Phase'))
  assert.equal(
    shortRewardTitle({ ...schema, weights: [0.9, 0.1, -0.01] }, 'x'),
    'Delivery + Cohesion 0.1 + Wall contact'
  )
})
test('comparison keeps configurations separate, deduplicates shared baselines and retains zero/missing', () => {
  const a = evaluation('reward-a', {
      post_event_delivery: 0,
      final_minute_event_delivery: 1,
    }),
    b = evaluation('reward-b', { post_event_delivery: 1 })
  a.episodes.push({
    ...a.episodes[0],
    seed: 202,
    dir: 'reward-a/202',
    metrics: { post_event_delivery: 0.2, final_minute_event_delivery: 0.8 },
  })
  const rows = comparisonRows([a, b], 'recovery')
  assert.equal(rows.length, 3)
  assert.equal(rows[0].values.post_event_delivery, 0.1)
  assert.equal(rows[0].values.final_minute_event_delivery, 0.9)
  assert.equal(rows[0].values.event_outage_s, null)
  assert.deepEqual(rows[0].seeds, [201, 202])
  assert.equal(rows.filter((r) => r.policy === 'hold').length, 1)
  assert.equal(rows.find((r) => r.id === 'reward-b')?.values.post_event_delivery, 1)
})
test('shade reverses cost direction and never colors missing or constant columns', () => {
  assert.notEqual(comparisonShade(1, [0, 1], true), comparisonShade(1, [0, 1], false))
  assert.equal(comparisonShade(null, [0, 1], true), undefined)
  assert.equal(comparisonShade(1, [1, 1], true), undefined)
  assert.equal(comparisonShade(NaN, [0, 1], true), undefined)
})
test('phase/term/mode/origin filters can isolate new results', () => {
  const e = evaluation('Frozen sampled', {})
  assert.ok(
    matchesMissionFilters(e, {
      ...ALL_FILTERS,
      phase: '4',
      term: 'Delivery',
      mode: 'Sampled',
      origin: 'New',
    })
  )
  assert.ok(!matchesMissionFilters(e, { ...ALL_FILTERS, origin: 'Historical' }))
  assert.ok(!matchesMissionFilters(e, { ...ALL_FILTERS, phase: '3' }))
})
test('Phase 5 report adds measured physical columns without overwriting an existing manifest metric', () => {
  const e = evaluation('r', {})
  e.episodes[0].dir = 'custom/10-23-4/models/a/episode-0000'
  const exp = { evaluations: [e] } as unknown as Experiment
  mergeScenarioReport(exp, 'custom/10-23-4', {
    phase_five_report_version: 1,
    variants: [
      {
        diagnostics: [
          {
            policy: 'frozen_deterministic',
            seed: 201,
            episode_dir: '/saved/custom/10-23-4/models/a/episode-0000',
            final_minute_event_delivery: 0,
            post_event_delivery: 0.5,
            team_completed_ever: false,
          },
        ],
      },
    ],
  })
  assert.equal(e.episodes[0].metrics?.final_minute_event_delivery, 0)
  assert.equal(e.episodes[0].metrics?.team_completed_ever, 0)
  assert.equal(e.episodes[0].metrics?.delivery_ratio, undefined)
  assert.ok(missionColumns('recovery').some((c) => c.key === 'final_minute_worst_service'))
  for (const name of ['phase-five.json', 'phase_five_report.json'])
    assert.ok(isCatalogFile(['inputs', name]))
})

test('recorded Phase 1 history survives a narrow folder and imported rows are not duplicated', () => {
  const h = historyEvaluations({
    phase_comparison_version: 1,
    diagnostics: [
      {
        phase: 1,
        variant: 'level-0',
        policy: 'frozen_deterministic',
        seed: 201,
        training_seed: 101,
        reward_schema: { components: ['level0_recovery_v1'] },
        metrics: { post_event_delivery: 0 },
      },
      {
        phase: 4,
        variant: 'r',
        policy: 'frozen_deterministic',
        seed: 201,
        training_seed: 101,
        reward_schema: { components: ['delivery_ratio'] },
        metrics: { post_event_delivery: 1 },
      },
    ],
  })
  const e = evaluation('r', { post_event_delivery: 0.5 })
  e.trainingSeed = 101
  e.missionVariantKey = 'r'
  const rows = mergedComparisonRows([e], h, 'recovery')
  assert.equal(rows.filter((r) => r.policy === 'model').length, 2)
  assert.equal(rows.find((r) => r.phase === 4)?.values.post_event_delivery, 0.5)
  assert.equal(rows.find((r) => r.phase === 1)?.values.post_event_delivery, 0)
})

test('Phase 6 short titles, source tags, nested diagnostics and files remain visible', () => {
  const schema = { components: ['coordinated_service_adaptive_v1'], weights: [1] }
  assert.equal(shortRewardTitle(schema, 'long title'), 'Restore then settle')
  assert.deepEqual(
    missionMetadata('custom/10-23-5', { source_phase: 6 }, { reward_schema: schema }).origin,
    'New'
  )
  assert.equal(phaseFromPath('custom/10-23-5/main/urban-recovery-6-peers'), 6)
  assert.ok(isCatalogFile(['main', 'phase_six_report.json']))
  assert.ok(isCatalogFile(['inputs', 'phase-six.json']))
  const experiment = {
    evaluations: [evaluation('custom/10-23-5/main/a', {})],
  } as unknown as Experiment
  const episode = experiment.evaluations[0].episodes[0]
  episode.dir = 'custom/10-23-5/models/urban-recovery-6-peers/episode-0000'
  mergeScenarioReport(experiment, 'custom/10-23-5', {
    phase_six_report_version: 1,
    variants: [
      {
        diagnostics: [
          {
            episode_dir: episode.dir,
            policy: 'frozen_deterministic',
            seed: 201,
            post_event_delivery: 0.75,
            final_minute_worst_service: 0,
          },
        ],
      },
    ],
    escape: [],
    baselines: [],
  })
  assert.equal(episode.metrics?.post_event_delivery, 0.75)
  assert.equal(episode.metrics?.final_minute_worst_service, 0)
})

test('Phase 7 short titles, source tags, nested diagnostics and files remain visible', () => {
  const schema = { components: ['coordinated_service_bridge_v1'], weights: [1] }
  assert.equal(shortRewardTitle(schema, 'long title'), 'Service + team radio')
  assert.deepEqual(
    missionMetadata('custom/10-23-6', { source_phase: 7 }, { reward_schema: schema }).origin,
    'New'
  )
  assert.equal(phaseFromPath('custom/10-23-6/main/urban-recovery-6-peers'), 7)
  assert.ok(isCatalogFile(['main', 'phase_seven_report.json']))
  assert.ok(isCatalogFile(['inputs', 'phase-seven.json']))
  const experiment = {
    evaluations: [evaluation('custom/10-23-6/main/a', {})],
  } as unknown as Experiment
  const episode = experiment.evaluations[0].episodes[0]
  episode.dir = 'custom/10-23-6/models/urban-recovery-6-peers/episode-0000'
  mergeScenarioReport(experiment, 'custom/10-23-6', {
    phase_seven_report_version: 1,
    variants: [
      {
        diagnostics: [
          {
            episode_dir: episode.dir,
            policy: 'frozen_deterministic',
            seed: 201,
            post_event_delivery: 0.75,
            final_minute_worst_service: 0,
          },
        ],
      },
    ],
    escape: [],
    baselines: [],
  })
  assert.equal(episode.metrics?.post_event_delivery, 0.75)
  assert.equal(episode.metrics?.final_minute_worst_service, 0)
})
