import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ResultCatalog } from '../src/lib/resultCatalog.ts'
import {
  discoverExperiments,
  episodeFiles,
  loadExperiment,
  loadTrainingSummary,
  matchingEpisodes,
} from '../src/lib/experimentIndex.ts'

function fakeCatalog(entries: Record<string, unknown>): ResultCatalog & { reads: string[] } {
  const reads: string[] = []
  const text = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
  return {
    name: 'fake',
    reads,
    paths: () => Object.keys(entries).sort(),
    has: (p) => p in entries,
    getFile: async (p) => {
      if (!(p in entries)) return null
      reads.push(p)
      return new File([text(entries[p])], p.split('/').pop() ?? p)
    },
  }
}

const REMOTE = '/cluster/home/u/run'

function manifest(label: string, trainingSeed: number, seeds: number[], extra: object = {}) {
  const episodes = (policy: string) =>
    seeds.map((seed, i) => ({
      seed,
      episode_dir: `${REMOTE}/eval/${label}/train-seed-${trainingSeed}/${policy}/episode-000${i}`,
      status: 'completed',
      error: null,
    }))
  return {
    eval_manifest_version: 2,
    status: 'completed',
    error: null,
    label,
    seed_roles: { training_seed: trainingSeed, held_out_seeds: seeds, held_out: true, overlap: [] },
    episodes_expected: seeds.length * 2,
    episodes_completed: seeds.length * 2,
    contract: { node_ids: ['a', 'b'], slot_node_ids: ['b'], action_meanings: ['west', 'hold'] },
    bundle: { model_selection: 'best', model_sha256: 'abc' },
    policies: { model: { episodes: episodes('model') }, hold: { episodes: episodes('hold') } },
    ...extra,
  }
}

function plan(evaluations: [string, number][]) {
  return {
    experiment_plan_version: 1,
    matrix: { name: 'demo' },
    seeds: { training: [1], model_selection: 201, held_out: [301] },
    rows: [{ name: 'rowA' }],
    evaluations: evaluations.map(([label, training_seed]) => ({
      label,
      training_seed,
      eval_dir: `${REMOTE}/eval/${label}/train-seed-${training_seed}`,
    })),
  }
}

test('discovery prefers plan roots, then comparisons, then standalone evals', () => {
  const catalog = fakeCatalog({
    'exp/experiment_plan.json': {},
    'exp/comparison/comparison.json': {},
    'exp/eval/rowA/train-seed-1/eval_manifest.json': {},
    'cmp/comparison.json': {},
    'cmp/episodes.csv': '',
    'regression/comparison.json': {},
    'solo/eval_manifest.json': {},
  })
  assert.deepEqual(discoverExperiments(catalog), [
    { root: 'cmp', kind: 'comparison' },
    { root: 'exp', kind: 'plan' },
    { root: 'solo', kind: 'eval' },
  ])
})

test('rows with identical train-seed/model/episode/seed tails stay distinct', async () => {
  const catalog = fakeCatalog({
    'experiment_plan.json': plan([
      ['rowA', 101],
      ['rowB', 101],
    ]),
    'eval/rowA/train-seed-101/eval_manifest.json': manifest('rowA', 101, [301]),
    'eval/rowB/train-seed-101/eval_manifest.json': manifest('rowB', 101, [301]),
    'eval/rowA/train-seed-101/model/episode-0000/seed-301/links.csv': 'x',
    'eval/rowA/train-seed-101/model/episode-0000/seed-301/positions.csv': 'x',
  })
  const experiment = await loadExperiment(catalog, '')
  const [a, b] = experiment.evaluations
  assert.deepEqual([a.key, b.key], ['rowA#101', 'rowB#101'])
  const modelA = a.episodes.find((e) => e.policy === 'model')!
  const modelB = b.episodes.find((e) => e.policy === 'model')!
  assert.equal(modelA.seedDir, 'eval/rowA/train-seed-101/model/episode-0000/seed-301')
  assert.equal(modelB.seedDir, 'eval/rowB/train-seed-101/model/episode-0000/seed-301')
  assert.equal(modelA.playable, true)
  assert.equal(modelB.playable, false)
  assert.ok(!catalog.reads.some((p) => p.endsWith('.csv')), 'indexing must not read CSVs')
})

test('remote absolute episode_dir resolves only inside the catalog; missing vs not_fetched', async () => {
  const catalog = fakeCatalog({
    'run/experiment_plan.json': plan([
      ['rowA', 1],
      ['rowA', 2],
      ['rowA', 3],
    ]),
    'run/fetch_manifest.json': {
      fetch_manifest_version: 1,
      remote: 'u@cluster:/cluster/home/u/run',
      selection: ['manifests'],
      fetched_at: '2026-09-01T00:00:00+00:00',
      files: [],
      tasks: [
        { index: 0, id: 'rowA/train-seed-1', state: 'completed' },
        { index: 1, id: 'rowA/train-seed-2', state: 'missing' },
        { index: 2, id: 'rowA/train-seed-3', state: 'not_fetched' },
      ],
      comparison: 'absent',
      snapshot_of_incomplete_run: true,
    },
    'run/eval/rowA/train-seed-1/eval_manifest.json': manifest('rowA', 1, [301, 302, 303]),
    'run/eval/rowA/train-seed-1/model/episode-0002/seed-303/links.csv': 'x',
    'run/eval/rowA/train-seed-1/model/episode-0002/seed-303/positions.csv': 'x',
  })
  const experiment = await loadExperiment(catalog, 'run')
  const [one, two, three] = experiment.evaluations
  const episode = one.episodes.find((e) => e.policy === 'model' && e.seed === 303)!
  assert.equal(episode.dir, 'run/eval/rowA/train-seed-1/model/episode-0002')
  assert.ok(one.episodes.every((e) => !e.dir.includes('cluster')))
  assert.equal(episode.playable, true)
  assert.equal(episode.hasTelemetry, false)
  assert.equal(one.state, 'ok')
  assert.equal(two.state, 'missing')
  assert.equal(three.state, 'not_fetched')
  assert.equal(three.fetchTaskState, 'not_fetched')
  assert.equal(experiment.fetch?.snapshotOfIncompleteRun, true)
  assert.equal(experiment.fetch?.comparison, 'absent')
})

test('episodes are matched by seed value, not by ordinal or episode name', async () => {
  const m = manifest('rowA', 1, [301, 302, 303])
  // model ran the seeds in a different order: episode-0000 holds seed 303
  m.policies.model.episodes = [303, 301, 302].map((seed, i) => ({
    seed,
    episode_dir: `C:\\runs\\eval\\rowA\\train-seed-1\\model\\episode-000${i}`,
    status: 'completed',
    error: null,
  }))
  const catalog = fakeCatalog({ 'eval/rowA/train-seed-1/eval_manifest.json': m })
  const experiment = await loadExperiment(catalog, '')
  const matched = matchingEpisodes(experiment.evaluations[0], 303)
  assert.deepEqual(
    matched.map((e) => [e.policy, e.name, e.seed]),
    [
      ['model', 'episode-0000', 303],
      ['hold', 'episode-0002', 303],
    ]
  )
  assert.equal(matched[0].seedDir, 'eval/rowA/train-seed-1/model/episode-0000/seed-303')
})

test('missing positions.csv is actionable; no steps.jsonl is still playable', async () => {
  const base = 'model/episode-0000'
  const catalog = fakeCatalog({
    'eval_manifest.json': manifest('rowA', 1, [301]),
    [`${base}/seed-301/links.csv`]: 'links',
    [`hold/episode-0000/seed-301/links.csv`]: 'links',
    [`hold/episode-0000/seed-301/positions.csv`]: 'positions',
    [`hold/episode-0000/inputs/buildings.json`]: '[]',
    [`hold/episode-0000/inputs/jammers.json`]: '[{"id":"jammer-0"}]',
  })
  const experiment = await loadExperiment(catalog, '')
  assert.equal(experiment.kind, 'eval')
  const [model, hold] = matchingEpisodes(experiment.evaluations[0], 301)
  assert.equal(model.playable, false)
  assert.match(model.message ?? '', /model\/episode-0000\/seed-301\/positions\.csv not found/)
  const refused = await episodeFiles(catalog, model)
  assert.equal(refused.ok, false)

  assert.equal(hold.playable, true)
  assert.equal(hold.hasTelemetry, false)
  const loaded = await episodeFiles(catalog, hold)
  assert.ok(loaded.ok)
  assert.equal(await loaded.files.positionsFile.text(), 'positions')
  assert.ok(loaded.files.buildingsFile)
  assert.ok(loaded.files.jammersJsonFile)
  assert.equal(loaded.files.flowsFile, undefined)
})

test('standalone evaluation may have no label but still exposes its episodes', async () => {
  const catalog = fakeCatalog({
    'eval_manifest.json': { ...manifest('rowA', 101, [301]), label: null },
    'model/episode-0000/seed-301/links.csv': 'links',
    'model/episode-0000/seed-301/positions.csv': 'positions',
  })
  const experiment = await loadExperiment(catalog, '')
  const evaluation = experiment.evaluations[0]
  assert.equal(evaluation.label, 'unlabelled evaluation')
  assert.equal(evaluation.trainingSeed, 101)
  assert.equal(evaluation.state, 'ok')
  assert.equal(evaluation.episodes.length, 2)
  assert.equal(evaluation.episodes.find((e) => e.policy === 'model')?.playable, true)
})

test('version, status and directory problems are reported, not thrown', async () => {
  const catalog = fakeCatalog({
    'experiment_plan.json': { experiment_plan_version: 9 },
    'comparison/comparison.json': { atol: 0, match: true },
    'eval/rowA/train-seed-1/eval_manifest.json': manifest('rowA', 1, [301], {
      status: 'running',
      episodes_completed: 1,
    }),
    'eval/rowA/train-seed-7/eval_manifest.json': manifest('rowZ', 2, [301]),
    'eval/rowB/train-seed-1/eval_manifest.json': { eval_manifest_version: 1 },
  })
  const experiment = await loadExperiment(catalog, '')
  const message = (artifact: string) =>
    experiment.artifacts.find((a) => a.artifact === artifact)?.message ?? ''
  assert.match(message('experiment_plan'), /unsupported experiment_plan_version 9/)
  assert.match(message('comparison'), /not an RL policy comparison/)
  assert.equal(experiment.comparison, null)
  const rowA = experiment.evaluations.find((e) => e.key === 'rowA#1')!
  assert.equal(rowA.state, 'incomplete')
  assert.equal(rowA.simulatorStatus, 'running')
  assert.ok(experiment.issues.some((i) => /does not match its directory/.test(i)))
  assert.ok(experiment.issues.some((i) => /unsupported eval_manifest_version 1/.test(i)))
})

test('training summary reports the model the evaluation used', async () => {
  const catalog = fakeCatalog({
    'eval/rowA/train-seed-1/eval_manifest.json': manifest('rowA', 1, [301]),
    'train/rowA/train-seed-1/train_manifest.json': {
      manifest_version: 4,
      status: 'completed',
      seed: 1,
      hyperparameters: { gamma: 0.95 },
      best_mean_reward: 20,
    },
  })
  const experiment = await loadExperiment(catalog, '')
  const summary = await loadTrainingSummary(catalog, '', experiment.evaluations[0])
  assert.equal(summary.message, null)
  assert.equal(summary.bestMeanReward, 20)
  assert.equal(summary.modelUsedByEval, 'best')
  const absent = await loadTrainingSummary(fakeCatalog({}), '', experiment.evaluations[0])
  assert.equal(absent.present, false)
})

const REAL_ROOT =
  '/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim/outputs/bypass-matrix'

test('smoke: real bypass-matrix root', { skip: !existsSync(REAL_ROOT) }, async () => {
  const all: string[] = []
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      const next = rel === '' ? name : `${rel}/${name}`
      if (statSync(abs).isDirectory()) walk(abs, next)
      else all.push(next)
    }
  }
  walk(REAL_ROOT, '')
  const known = new Set(all)
  const catalog: ResultCatalog = {
    name: 'bypass-matrix',
    paths: () => [...all].sort(),
    has: (p) => known.has(p),
    getFile: async (p) => (known.has(p) ? new File([readFileSync(join(REAL_ROOT, p))], p) : null),
  }
  assert.deepEqual(discoverExperiments(catalog), [{ root: '', kind: 'plan' }])
  const experiment = await loadExperiment(catalog, '')
  assert.deepEqual(experiment.issues, [])
  assert.ok(experiment.comparison)
  assert.equal(experiment.evaluations.length, 4)
  for (const evaluation of experiment.evaluations) {
    assert.equal(evaluation.state, 'ok')
    assert.ok(evaluation.episodes.length > 0)
    assert.ok(evaluation.episodes.every((e) => e.playable && e.hasTelemetry))
  }
})

test('a standalone baseline-only evaluation (training: null) is kept, with no training seed', async () => {
  const base = manifest('rowA', 101, [301])
  const catalog = fakeCatalog({
    'eval_manifest.json': {
      ...base,
      label: null,
      training: null,
      seed_roles: { ...base.seed_roles, training_seed: null },
    },
    'hold/episode-0000/seed-301/links.csv': 'links',
    'hold/episode-0000/seed-301/positions.csv': 'positions',
  })
  const experiment = await loadExperiment(catalog, '')
  assert.deepEqual(experiment.issues, [])
  const evaluation = experiment.evaluations[0]
  assert.equal(evaluation.trainingSeed, null)
  assert.equal(evaluation.state, 'ok')
  assert.equal(evaluation.episodes.find((e) => e.policy === 'hold')?.playable, true)
})

test('a standalone manifest missing its training seed without saying training: null is still an error', async () => {
  const base = manifest('rowA', 101, [301])
  const catalog = fakeCatalog({
    'eval_manifest.json': { ...base, seed_roles: { ...base.seed_roles, training_seed: null } },
  })
  const experiment = await loadExperiment(catalog, '')
  assert.equal(experiment.evaluations.length, 0)
  assert.match(experiment.issues[0], /does not record a training seed/)
})
