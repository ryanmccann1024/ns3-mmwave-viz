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

// ---- placement baselines in evaluations (policies[name].baseline) ----

const SOURCE_IDENTITY = {
  run_ini_sha256: 'ini-src',
  nodes_json_sha256: 'nodes-src',
  buildings_json_sha256: 'bld-src',
  jammers_json_sha256: 'jam-src',
}

function baselineManifestFile(overrides: object = {}) {
  return {
    baseline_manifest_version: 1,
    run_id: 'geo-1',
    mode: 'evaluation',
    method: 'geometric',
    objective: 'coverage',
    status: 'complete',
    planner_wall_s: 4.25,
    initial_displacement_m_total: 99,
    source_scenario_identity: SOURCE_IDENTITY,
    effective_scenario_identity: { ...SOURCE_IDENTITY, nodes_json_sha256: 'nodes-eff' },
    plan: 'baseline-plan.json',
    ...overrides,
  }
}

function baselineBlock(method: string, overrides: object = {}) {
  return {
    method,
    requested_algorithm: method,
    objective: 'coverage',
    executor: 'local',
    planner_seed: 7,
    max_iterations: null,
    fingerprint: `fp-${method}`,
    initial_displacement_m_total: 12.5,
    effective_scenario_identity: { ...SOURCE_IDENTITY, nodes_json_sha256: 'nodes-eff' },
    planner_source_sha256: 'src-sha',
    rf_config_sha256: 'rf-sha',
    mapping_sha256: 'map-sha',
    manifest: `${method}/baseline/baseline_manifest.json`,
    plan: `${method}/baseline/effective-inputs/baseline-plan.json`,
    ...overrides,
  }
}

/** Standalone eval (root '') whose policies include placement baselines. */
function evalWithBaselines(
  blocks: Record<string, object | null>,
  extra: object = {}
): Record<string, unknown> {
  const base = manifest('rowA', 101, [301])
  const policies: Record<string, unknown> = {}
  for (const [policy, block] of Object.entries(blocks)) {
    policies[policy] = {
      episodes: [
        {
          seed: 301,
          episode_dir: `${REMOTE}/${policy}/episode-0000`,
          status: 'completed',
          error: null,
        },
      ],
      ...(block ? { baseline: block } : {}),
    }
  }
  return { ...base, policies, ...extra }
}

test('legacy evaluation without baseline blocks has baselines {} and is otherwise unchanged', async () => {
  const catalog = fakeCatalog({ 'eval_manifest.json': manifest('rowA', 1, [301]) })
  const experiment = await loadExperiment(catalog, '')
  const evaluation = experiment.evaluations[0]
  assert.deepEqual(evaluation.baselines, {})
  assert.deepEqual(experiment.issues, [])
  assert.equal(evaluation.state, 'ok')
  assert.deepEqual(evaluation.policies, ['model', 'hold'])
  assert.equal(evaluation.episodes.length, 2)
  assert.deepEqual(catalog.reads, ['eval_manifest.json'])
})

test('a baseline block reads planner wall time from its referenced manifest', async () => {
  const catalog = fakeCatalog({
    'eval_manifest.json': evalWithBaselines({ hold: null, geometric: baselineBlock('geometric') }),
    'geometric/baseline/baseline_manifest.json': baselineManifestFile(),
  })
  const experiment = await loadExperiment(catalog, '')
  const evaluation = experiment.evaluations[0]
  assert.deepEqual(Object.keys(evaluation.baselines), ['geometric'])
  const info = evaluation.baselines.geometric
  assert.equal(info.manifestPath, 'geometric/baseline/baseline_manifest.json')
  assert.equal(info.planPath, 'geometric/baseline/effective-inputs/baseline-plan.json')
  assert.equal(info.manifestError, null)
  assert.equal(info.manifest?.runId, 'geo-1')
  assert.equal(info.plannerWallS, 4.25)
  // block-level fields come from the block, not the manifest
  assert.equal(info.objective, 'coverage')
  assert.equal(info.initialDisplacementMTotal, 12.5)
  assert.equal(info.method, 'geometric')
  assert.equal(info.plannerSeed, 7)
  assert.equal(info.maxIterations, null)
  assert.equal(info.plannerSourceSha256, 'src-sha')
  assert.equal(info.rfConfigSha256, 'rf-sha')
  assert.equal(info.mappingSha256, 'map-sha')
  assert.equal(info.effectiveScenarioIdentity?.nodesJsonSha256, 'nodes-eff')
  // the plan is never read at load time
  assert.ok(!catalog.reads.some((p) => p.endsWith('baseline-plan.json')))
})

test('baseline block numbers are never coerced from strings', async () => {
  const block = baselineBlock('geometric', {
    planner_seed: '7',
    initial_displacement_m_total: '12.5',
    max_iterations: Infinity,
  })
  const catalog = fakeCatalog({
    'eval_manifest.json': evalWithBaselines({ geometric: block }),
    'geometric/baseline/baseline_manifest.json': baselineManifestFile({ planner_wall_s: '4.25' }),
  })
  const info = (await loadExperiment(catalog, '')).evaluations[0].baselines.geometric
  assert.equal(info.plannerSeed, null)
  assert.equal(info.initialDisplacementMTotal, null)
  assert.equal(info.maxIterations, null)
  assert.equal(info.plannerWallS, null)
})

test('a baseline manifest missing from the catalog is reported, not thrown', async () => {
  const catalog = fakeCatalog({
    'eval_manifest.json': evalWithBaselines({ geometric: baselineBlock('geometric') }),
  })
  const experiment = await loadExperiment(catalog, '')
  const evaluation = experiment.evaluations[0]
  assert.equal(evaluation.state, 'ok')
  assert.equal(evaluation.episodes.length, 1)
  const info = evaluation.baselines.geometric
  assert.equal(info.manifestPath, 'geometric/baseline/baseline_manifest.json')
  assert.equal(info.manifest, null)
  assert.equal(info.manifestError, 'not in catalog')
  assert.equal(info.plannerWallS, null)
  assert.equal(info.sourceIdentityCheck, null)
  assert.equal(info.initialDisplacementMTotal, 12.5)
  assert.equal(info.plannerSourceSha256, 'src-sha')
  assert.equal(info.rfConfigSha256, 'rf-sha')
})

test('an unparseable baseline manifest keeps its parse reason', async () => {
  const catalog = fakeCatalog({
    'eval_manifest.json': evalWithBaselines({ geometric: baselineBlock('geometric') }),
    'geometric/baseline/baseline_manifest.json': baselineManifestFile({
      baseline_manifest_version: 2,
    }),
  })
  const info = (await loadExperiment(catalog, '')).evaluations[0].baselines.geometric
  assert.equal(info.manifest, null)
  assert.equal(info.manifestError, 'unsupported baseline_manifest_version: 2')
  assert.equal(info.plannerWallS, null)
})

test('an escaping baseline manifest reference is never fetched', async () => {
  const catalog = fakeCatalog({
    'exp/eval_manifest.json': evalWithBaselines({
      geometric: baselineBlock('geometric', {
        manifest: '../../outside/baseline_manifest.json',
        plan: '/abs/baseline-plan.json',
      }),
    }),
    'outside/baseline_manifest.json': baselineManifestFile(),
  })
  const experiment = await loadExperiment(catalog, 'exp')
  const info = experiment.evaluations[0].baselines.geometric
  assert.equal(info.manifestPath, null)
  assert.equal(info.planPath, null)
  assert.equal(info.manifest, null)
  assert.equal(info.manifestError, 'unresolvable reference')
  assert.deepEqual(catalog.reads, ['exp/eval_manifest.json'])
})

test('path fields inside a referenced baseline manifest are not followed', async () => {
  const catalog = fakeCatalog({
    'exp/eval_manifest.json': evalWithBaselines({ geometric: baselineBlock('geometric') }),
    'exp/geometric/baseline/baseline_manifest.json': baselineManifestFile({
      eval_manifest: '../../eval_manifest.json',
      source_run_config_abs: '/cluster/home/u/run.ini',
      origin: 'origin.json',
      planner_log: 'planner.log',
      sim_log: 'sim.log',
      source_inputs: 'source-inputs',
      effective_inputs: 'effective-inputs',
    }),
    'exp/geometric/baseline/origin.json': {},
    'exp/geometric/baseline/planner.log': 'log',
    'exp/geometric/baseline/sim.log': 'log',
    'exp/geometric/baseline/baseline-plan.json': {},
  })
  const experiment = await loadExperiment(catalog, 'exp')
  assert.equal(experiment.evaluations[0].baselines.geometric.plannerWallS, 4.25)
  assert.deepEqual(catalog.reads, [
    'exp/eval_manifest.json',
    'exp/geometric/baseline/baseline_manifest.json',
  ])
})

test('a baseline-only evaluation lists both placement baselines with no training seed', async () => {
  const base = evalWithBaselines({
    geometric: baselineBlock('geometric'),
    optimization: baselineBlock('optimization', { objective: 'balanced' }),
  })
  const catalog = fakeCatalog({
    'eval_manifest.json': {
      ...base,
      label: null,
      training: null,
      seed_roles: { ...(base.seed_roles as object), training_seed: null },
    },
    'geometric/baseline/baseline_manifest.json': baselineManifestFile(),
    'optimization/baseline/baseline_manifest.json': baselineManifestFile({
      method: 'optimization',
      planner_wall_s: 61.5,
    }),
  })
  const experiment = await loadExperiment(catalog, '')
  assert.deepEqual(experiment.issues, [])
  const evaluation = experiment.evaluations[0]
  assert.equal(evaluation.trainingSeed, null)
  assert.deepEqual(Object.keys(evaluation.baselines).sort(), ['geometric', 'optimization'])
  assert.equal(evaluation.baselines.geometric.plannerWallS, 4.25)
  assert.equal(evaluation.baselines.optimization.plannerWallS, 61.5)
  assert.equal(evaluation.baselines.optimization.objective, 'balanced')
  assert.ok(evaluation.episodes.every((e) => e.trainingSeed === null))
})

test('source identity is compared per hash with the manifest source identity only', async () => {
  const load = async (evalIdentity: object | undefined, manifestOverrides: object) => {
    const catalog = fakeCatalog({
      'eval_manifest.json': evalWithBaselines(
        { geometric: baselineBlock('geometric') },
        evalIdentity === undefined ? {} : { scenario_identity: evalIdentity }
      ),
      'geometric/baseline/baseline_manifest.json': baselineManifestFile(manifestOverrides),
    })
    return (await loadExperiment(catalog, '')).evaluations[0].baselines.geometric
  }

  const differing = await load(
    {
      run_ini_sha256: 'ini-src',
      nodes_json_sha256: 'nodes-other',
      buildings_json_sha256: 'bld-src',
    },
    {}
  )
  assert.deepEqual(differing.sourceIdentityCheck, {
    runIniSha256: 'match',
    nodesJsonSha256: 'mismatch',
    buildingsJsonSha256: 'match',
    jammersJsonSha256: 'unknown',
  })

  // placement changes the effective node layout by design: that is never a mismatch
  const effectiveOnly = await load(SOURCE_IDENTITY, {
    effective_scenario_identity: {
      ...SOURCE_IDENTITY,
      nodes_json_sha256: 'nodes-moved',
      run_ini_sha256: 'ini-moved',
    },
  })
  assert.ok(effectiveOnly.sourceIdentityCheck)
  assert.ok(!Object.values(effectiveOnly.sourceIdentityCheck).includes('mismatch'))
  assert.ok(Object.values(effectiveOnly.sourceIdentityCheck).every((v) => v === 'match'))

  const noEvalIdentity = await load(undefined, {})
  assert.equal(noEvalIdentity.manifestError, null)
  assert.equal(noEvalIdentity.sourceIdentityCheck, null)

  const noSourceIdentity = await load(SOURCE_IDENTITY, { source_scenario_identity: null })
  assert.equal(noSourceIdentity.sourceIdentityCheck, null)

  const catalog = fakeCatalog({
    'eval_manifest.json': evalWithBaselines(
      { geometric: baselineBlock('geometric') },
      { scenario_identity: SOURCE_IDENTITY }
    ),
  })
  const missing = (await loadExperiment(catalog, '')).evaluations[0].baselines.geometric
  assert.equal(missing.sourceIdentityCheck, null)
})

test('known policies sort model, hold, geometric, optimization; manifest order is kept', async () => {
  const catalog = fakeCatalog({
    'eval_manifest.json': evalWithBaselines({
      optimization: baselineBlock('optimization'),
      model: null,
      zzz_custom: null,
      geometric: baselineBlock('geometric'),
      hold: null,
    }),
  })
  const evaluation = (await loadExperiment(catalog, '')).evaluations[0]
  assert.deepEqual(evaluation.policies, [
    'optimization',
    'model',
    'zzz_custom',
    'geometric',
    'hold',
  ])
  assert.deepEqual(
    matchingEpisodes(evaluation, 301).map((e) => e.policy),
    ['model', 'hold', 'geometric', 'optimization', 'zzz_custom']
  )
})

test('baseline-policy episodes keep null metrics and statuses as recorded', async () => {
  const data = evalWithBaselines({ geometric: baselineBlock('geometric') })
  const policies = data.policies as Record<string, { episodes: Record<string, unknown>[] }>
  policies.geometric.episodes = [
    {
      seed: 301,
      episode_dir: `${REMOTE}/geometric/episode-0000`,
      status: 'failed',
      error: 'sim exited',
      exit_code: null,
      decisions: null,
      return: null,
      metrics: { delivery_ratio: null, mean_throughput_mbps: 3.5 },
    },
  ]
  const catalog = fakeCatalog({ 'eval_manifest.json': data })
  const [episode] = (await loadExperiment(catalog, '')).evaluations[0].episodes
  assert.equal(episode.policy, 'geometric')
  assert.equal(episode.status, 'failed')
  assert.equal(episode.playable, false)
  assert.equal(episode.decisions, null)
  assert.equal(episode.return, null)
  assert.equal(episode.exitCode, null)
  assert.deepEqual(episode.metrics, { delivery_ratio: null, mean_throughput_mbps: 3.5 })
})
