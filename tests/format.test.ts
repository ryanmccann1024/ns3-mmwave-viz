import test from 'node:test'
import assert from 'node:assert/strict'
import {
  batchLabel,
  experimentGroup,
  groupExperimentRoots,
  groupProjects,
  folderLabel,
  runTimeLabel,
  scenarioLabel,
  shortNumber,
} from '../src/lib/format.ts'

test('a dated experiment folder splits into name and date', () => {
  assert.deepEqual(folderLabel('2026-09/22/17-48-rl-test-baselines'), {
    name: 'rl-test-baselines',
    date: 'Sep 22, 17:48',
  })
})

test('a seconds field in the folder time is accepted', () => {
  assert.equal(folderLabel('2026-04/19/13-59-28-validation').name, 'validation')
})

test('other layouts fall back to the last path segment', () => {
  assert.deepEqual(folderLabel('fetched/my-run'), { name: 'my-run', date: null })
  assert.deepEqual(folderLabel(''), { name: '', date: null })
})

test('shortNumber rounds by magnitude and marks missing values', () => {
  assert.equal(shortNumber(28.956934523809526), '28.96')
  assert.equal(shortNumber(0.9478467261904762), '0.948')
  assert.equal(shortNumber(1234.56), '1234.6')
  assert.equal(shortNumber(null), 'n/a')
  assert.equal(shortNumber(Number.NaN), 'n/a')
})

test('runTimeLabel reads a bare timestamp folder and ignores named ones', () => {
  assert.equal(runTimeLabel('2026-09/22/17-50-56'), 'Sep 22, 17:50:56')
  assert.equal(runTimeLabel('2026-09/22/17-48-rl-test-baselines'), null)
})

test('scenarioLabel splits the code from a readable title', () => {
  assert.deepEqual(scenarioLabel('arpo-2-7-throughput-dynamic-04172026'), {
    title: 'Throughput dynamic',
    code: 'ARPO 2.7',
  })
  assert.deepEqual(scenarioLabel('arpo-2-x-blocking-04172026'), {
    title: 'Blocking',
    code: 'ARPO 2.x',
  })
  assert.deepEqual(scenarioLabel('my_custom-run'), { title: 'My custom run', code: null })
  assert.equal(scenarioLabel('arpo-2-2-los-obstruction-04172026').title, 'LOS obstruction')
})

test('batchLabel names and dates the batch folder', () => {
  assert.deepEqual(batchLabel('2026-05/19/13-59-28-validation/arpo-1-1-static-04172026'), {
    name: 'Validation',
    date: 'May 19, 13:59',
    sortKey: '2026-05-19 13:59',
  })
  assert.deepEqual(batchLabel('2026-05/19/13-59-28'), {
    name: null,
    date: 'May 19, 13:59',
    sortKey: '2026-05-19 13:59',
  })
  assert.deepEqual(batchLabel('elsewhere/run'), { name: null, date: null, sortKey: null })
})

test('experimentGroup names the folder an experiment sits in', () => {
  assert.deepEqual(experimentGroup('custom/10-09/local-fast/main/small-jammer'), {
    key: 'custom/10-09/local-fast/main',
    name: 'Local fast · Main',
    date: 'Oct 9',
  })
  assert.deepEqual(experimentGroup('2026-09/22/17-48-rl-test'), {
    key: '2026-09/22',
    name: null,
    date: 'Sep 22',
  })
  assert.deepEqual(experimentGroup('solo'), { key: '', name: null, date: null })
})

test('groupExperimentRoots gathers scenarios by folder, newest first', () => {
  const roots = ['a/x/one', 'a/x/two', 'b/y/one'].map((root) => ({ root }))
  assert.deepEqual(
    groupExperimentRoots(roots).map((g) => [g.key, g.roots.map((r) => r.root)]),
    [
      ['b/y', ['b/y/one']],
      ['a/x', ['a/x/two', 'a/x/one']],
    ]
  )
})

test('groupProjects puts sibling folders that share a name stem together', () => {
  const groups = groupExperimentRoots(
    [
      'custom/10-09/local-fast-calibration-1/small-hold',
      'custom/10-09/local-fast/main/small-hold',
      'custom/10-09/other/small-hold',
    ].map((root) => ({ root }))
  )
  const projects = groupProjects(groups, ['custom/10-09/local-fast-benchmark'])
  assert.deepEqual(
    projects.map((p) => ({
      title: p.title,
      date: p.date,
      experiments: p.experiments.map((e) => e.short),
      training: p.training.map((t) => t.short),
    })),
    [
      { title: 'Other', date: 'Oct 9', experiments: ['Other'], training: [] },
      {
        title: 'Local fast',
        date: 'Oct 9',
        experiments: ['Main', 'Calibration 1'],
        training: ['Benchmark'],
      },
    ]
  )
})
