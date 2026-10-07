import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GROUP_INTERVAL_SCOPE,
  PAIRED_INTERVAL_SCOPE,
  buildComparisonView,
  checkComparison,
  formatNumber,
  parseEpisodesCsv,
} from '../src/lib/comparisonView.ts'

const interval = (kind: string, n: number, low: number, high: number) => ({
  kind,
  level: 0.95,
  n,
  df: n - 1,
  t: 4.303,
  half_width: (high - low) / 2,
  low,
  high,
})

const RL = {
  comparison_version: 1,
  status: 'incomplete',
  primary_metric: 'delivery_ratio',
  metric_source: { kind: 'telemetry_window', warmup_excluded: false },
  metrics: {
    delivery_ratio: { higher_is_better: true, comparable_across_reward_definitions: true },
    return: { higher_is_better: true, comparable_across_reward_definitions: false },
  },
  missing_evaluations: [
    { label: null, training_seed: null, eval_dir: '/abs/x', reason: 'no eval_manifest.json' },
  ],
  evaluations: [
    {
      label: 'rowA',
      training_seed: 101,
      held_out: true,
      health: { model: { mask_violations: 0, revalidated_slots: 2 } },
      comparisons: [
        {
          baseline: 'hold',
          metric: 'delivery_ratio',
          n_expected: 3,
          n_used: 3,
          model_mean: 0.8123456789012345,
          baseline_mean: 0.5,
          mean_difference: 0.3123456789012345,
          std_difference: 0.01,
          zero_variance: false,
          interval: interval('paired_t_across_evaluation_seeds', 3, 0.2875, 0.3371913578024691),
          excluded: [],
        },
        {
          baseline: 'hold',
          metric: 'return',
          n_expected: 3,
          n_used: 1,
          model_mean: 20.0,
          baseline_mean: 19.0,
          mean_difference: 1.0,
          std_difference: null,
          zero_variance: false,
          interval: null,
          interval_omitted: 'fewer than 2 usable pairs',
          excluded: [{ seed: 302, reasons: ['model episode failed'] }],
        },
      ],
    },
  ],
  groups: [
    {
      label: 'rowA',
      runs_expected: 2,
      runs_used: 2,
      excluded_runs: [],
      comparisons: [
        {
          baseline: 'hold',
          metric: 'delivery_ratio',
          common_seeds: [301, 302, 303],
          seeds_dropped_for_commonality: [],
          mean_difference: 0.25,
          std_across_runs: 0.05,
          interval: interval('t_across_training_runs', 2, -0.19, 0.69),
        },
      ],
    },
  ],
}

test('comparison_version separates RL and regression schemas', () => {
  assert.equal(checkComparison(RL).kind, 'rl')
  const regression = checkComparison({ atol: 1e-9, baseline: 'a', candidate: 'b', match: true })
  assert.equal(regression.kind, 'regression')
  assert.match(regression.message ?? '', /not an RL policy comparison/)
})

test('an unlabelled standalone comparison has a visible row name', () => {
  const view = buildComparisonView({
    ...RL,
    evaluations: [{ ...RL.evaluations[0], label: null }],
  })
  assert.equal(view.pairedRows[0].label, 'unlabelled evaluation')
})

test('unsupported version has a clear message', () => {
  const check = checkComparison({ ...RL, comparison_version: 2 })
  assert.equal(check.kind, 'unsupported')
  assert.equal(check.comparison, null)
  assert.match(check.message ?? '', /unsupported comparison_version 2 .*supports 1/)
})

test('paired and group intervals expose exact low/high/n with the right scope', () => {
  const view = buildComparisonView(RL)
  const paired = view.pairedRows[0]
  assert.deepEqual(paired.interval, {
    low: 0.2875,
    high: 0.3371913578024691,
    level: 0.95,
    n: 3,
    kind: 'paired_t_across_evaluation_seeds',
  })
  assert.equal(paired.intervalScope, PAIRED_INTERVAL_SCOPE)
  assert.equal(formatNumber(paired.meanDifference), '0.3123456789012345')
  assert.equal(formatNumber(paired.interval?.high), '0.3371913578024691')
  assert.equal(paired.isPrimaryMetric, true)
  assert.equal(paired.health.model.revalidated_slots, 2)

  const group = view.groupRows[0]
  assert.equal(group.interval?.low, -0.19)
  assert.equal(group.interval?.high, 0.69)
  assert.equal(group.interval?.n, 2)
  assert.equal(group.intervalScope, GROUP_INTERVAL_SCOPE)
  assert.deepEqual(group.commonSeeds, [301, 302, 303])
})

test('a null interval stays null and carries its reason', () => {
  const row = buildComparisonView(RL).pairedRows[1]
  assert.equal(row.interval, null)
  assert.equal(row.intervalOmitted, 'fewer than 2 usable pairs')
  assert.equal(row.comparable, false)
  assert.deepEqual(row.excluded, [{ seed: 302, reasons: ['model episode failed'] }])
  assert.equal(formatNumber(null), '—')
  assert.equal(formatNumber(row.modelMean), '20')
})

test('an incomplete comparison surfaces its missing reason', () => {
  const view = buildComparisonView(RL)
  assert.equal(view.status, 'incomplete')
  assert.equal(view.complete, false)
  assert.deepEqual(view.missingEvaluations, [
    { label: null, trainingSeed: null, reason: 'no eval_manifest.json' },
  ])
  assert.match(view.metricSourceCaveat, /telemetry_window/)
})

test('episodes.csv rows stay strings', () => {
  const table = parseEpisodesCsv('label,training_seed,return\nrowA,101,20.0\n')
  assert.deepEqual(table.columns, ['label', 'training_seed', 'return'])
  assert.deepEqual(table.rows, [{ label: 'rowA', training_seed: '101', return: '20.0' }])
  assert.deepEqual(table.errors, [])
})

test('placement baselines (geometric, optimization) render saved statistics unchanged', () => {
  const [savedHold] = RL.evaluations[0].comparisons
  const geometric = {
    ...savedHold,
    baseline: 'geometric',
    model_mean: 0.7000000000000001,
    baseline_mean: 0.6123456789,
    // deliberately not model_mean - baseline_mean: the viewer must not recompute it
    mean_difference: 0.123,
    std_difference: 0.02,
    interval: interval('paired_t_across_evaluation_seeds', 3, 0.05, 0.196),
  }
  const optimization = {
    ...savedHold,
    baseline: 'optimization',
    model_mean: null,
    baseline_mean: 0.9,
    mean_difference: null,
    interval: null,
    interval_omitted: 'model episodes missing',
  }
  const [savedGroup] = RL.groups[0].comparisons
  const view = buildComparisonView({
    ...RL,
    evaluations: [{ ...RL.evaluations[0], comparisons: [geometric, optimization] }],
    groups: [
      {
        ...RL.groups[0],
        comparisons: [
          { ...savedGroup, baseline: 'geometric', mean_difference: 0.05, interval: null },
        ],
      },
    ],
  })
  const [g, o] = view.pairedRows
  assert.deepEqual(
    view.pairedRows.map((r) => r.baseline),
    ['geometric', 'optimization']
  )
  assert.equal(g.modelMean, 0.7000000000000001)
  assert.equal(g.baselineMean, 0.6123456789)
  assert.equal(g.meanDifference, 0.123)
  assert.deepEqual(g.interval, {
    low: 0.05,
    high: 0.196,
    level: 0.95,
    n: 3,
    kind: 'paired_t_across_evaluation_seeds',
  })
  assert.equal(g.nUsed, 3)
  assert.equal(g.nExpected, 3)
  assert.equal(g.intervalScope, PAIRED_INTERVAL_SCOPE)
  assert.equal(formatNumber(g.modelMean), '0.7000000000000001')

  assert.equal(o.modelMean, null)
  assert.equal(o.meanDifference, null)
  assert.equal(o.baselineMean, 0.9)
  assert.equal(o.interval, null)
  assert.equal(o.intervalOmitted, 'model episodes missing')

  const [group] = view.groupRows
  assert.equal(group.baseline, 'geometric')
  assert.equal(group.meanDifference, 0.05)
  assert.equal(group.interval, null)
  assert.equal(group.intervalOmitted, 'no interval recorded')
  assert.equal(group.intervalScope, GROUP_INTERVAL_SCOPE)
})
