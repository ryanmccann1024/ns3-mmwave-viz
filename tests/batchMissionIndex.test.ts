import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResultCatalog } from '../src/lib/resultCatalog.ts'
import { isCatalogFile } from '../src/lib/resultCatalog.ts'
import { discoverExperiments, loadExperiment } from '../src/lib/experimentIndex.ts'
import type { Evaluation } from '../src/lib/experimentIndex.ts'
import { isMissionInternal, missionScenarios } from '../src/lib/missionCampaignIndex.ts'
import { parseOnlineRecord, resolveBatchPath } from '../src/lib/batchMissionIndex.ts'
import { comparisonRows, executionMode } from '../src/lib/missionComparison.ts'

type Data = Record<string, unknown>
const here = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures/batch-manifests.json'), 'utf8')) as {
  index_v4: Data
  online_v5: Data
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const rec = (v: unknown) => v as Data
const list = (v: unknown) => v as Data[]

function catalog(entries: Data): ResultCatalog & { reads: string[] } {
  const reads: string[] = []
  return {
    name: 'batch',
    reads,
    paths: () => Object.keys(entries).sort(),
    has: (path) => path in entries,
    getFile: async (path) => {
      if (!(path in entries)) return null
      reads.push(path)
      const v = entries[path]
      return new File([typeof v === 'string' ? v : JSON.stringify(v)], path.split('/').pop()!)
    },
  }
}

const at = (root: string, path: string) => (root ? `${root}/${path}` : path)

function episodeFiles(entries: Data, root: string, dir: string, seed: number) {
  entries[at(root, `${dir}/rl_episode.json`)] = { status: 'completed', decisions: 64 }
  entries[at(root, `${dir}/steps.jsonl`)] = 'telemetry'
  entries[at(root, `${dir}/inputs/run.ini`)] = '[sim]'
  entries[at(root, `${dir}/inputs/nodes.json`)] = []
  entries[at(root, `${dir}/inputs/buildings.json`)] = []
  for (const name of ['positions.csv', 'links.csv'])
    entries[at(root, `${dir}/seed-${seed}/${name}`)] = 'csv'
}

const metrics = (seed: number) => ({
  final_minute_coverage: seed === 201 ? 0.5 : 0.7,
  final_minute_original_delivery: null,
  travel_m_total: 10,
})

/** Materialize every complete reference of an index as the files the producer writes. */
function materialize(index: Data, root: string): Data {
  const entries: Data = {
    [at(root, 'experiment_plan.json')]: { experiment_plan_version: 3 },
    [at(root, 'campaign_status.json')]: { campaign_version: 2, state: 'completed_with_warnings' },
    [at(root, `main/${index.scene}/mission_scenario.json`)]: index,
    [at(root, 'analysis/rural-coverage-3-peers/comparisons/abc/attempt-1/comparison.json')]: {},
    [at(root, 'analysis/rural-coverage-3-peers/comparisons/abc/attempt-1/episodes.csv')]: '',
    [at(root, 'analysis/rural-coverage-3-peers/reviews/abc/attempt-1/views/v/eval_manifest.json')]: {},
    [at(root, 'state/bindings/x.json')]: {},
    [at(root, 'local/key/eval_manifest.json')]: {},
  }
  const assets = rec(index.assets)
  for (const value of [
    ...Object.values(rec(assets.run_config)),
    assets.reference,
  ]) {
    const path = rec(value)?.path
    if (typeof path === 'string') entries[at(root, path)] = path.endsWith('.ini') ? '[sim]' : {}
  }
  const leaf = (raw: Data, policy: string) => {
    if (raw.status !== 'complete') return
    const seed = raw.seed as number
    const episodes = list(raw.episodes)
    for (const e of episodes) episodeFiles(entries, root, e.episode_dir as string, seed)
    const entry = {
      seed,
      episode_dir: 'episode-0001',
      status: 'completed',
      return: 1.5,
      metrics: metrics(seed),
    }
    if (typeof raw.eval_manifest === 'string')
      entries[at(root, raw.eval_manifest)] = {
        eval_manifest_version: 8,
        status: 'completed',
        label: null,
        episodes_expected: 1,
        episodes_completed: 1,
        seed_roles: { training_seed: 101, held_out: false, held_out_seeds: [] },
        contract: { node_ids: ['a'], slot_node_ids: ['a'], action_meanings: ['hold'] },
        reward_schema: { components: ['delivery_ratio'] },
        scenario_identity: { run_ini_sha256: 'r', nodes_json_sha256: `n-${policy}` },
        bundle: { model_selection: 'checkpoint', model_sha256: raw.model_sha256 ?? null },
        policies: { [policy]: { summary: { return_mean: 9 }, episodes: [entry] } },
      }
    if (typeof raw.online_manifest === 'string') {
      const online = clone(fixtures.online_v5)
      online.protocol = raw.protocol
      online.seed = seed
      online.seed_role = raw.role
      online.evaluation_seeds = [seed]
      list(online.episodes)[0].seed = seed
      list(online.episodes)[0].metrics = metrics(seed)
      entries[at(root, raw.online_manifest)] = online
    }
  }
  for (const model of list(index.models)) for (const raw of list(model.evaluations)) leaf(raw, 'model')
  for (const baseline of list(index.baselines))
    for (const raw of list(baseline.evaluations)) leaf(raw, baseline.policy as string)
  return entries
}

const SCENE = 'rural-coverage-3-peers'

test('fixture copies match the simulator producer fixtures when the sibling checkout exists', (t) => {
  const sim = join(here, '../../ns3-mmwave/scratch/mesh-sim/tests/fixtures')
  if (!existsSync(sim)) {
    t.skip('sibling ns3-mmwave checkout not present')
    return
  }
  for (const [key, file] of [
    ['index_v4', 'batch_index_v4_example.json'],
    ['online_v5', 'batch_online_manifest_v5_example.json'],
  ] as const) {
    const producer = JSON.parse(readFileSync(join(sim, file), 'utf8'))
    // Same values in the same key order: any producer change fails here until re-copied
    assert.equal(JSON.stringify(fixtures[key]), JSON.stringify(producer), file)
  }
})

test('the v4 producer fixture loads under an arbitrary batch folder name', async () => {
  const root = 'custom/My batch (renamed)/nested'
  const c = catalog(materialize(clone(fixtures.index_v4), root))
  const main = `${root}/main/${SCENE}`
  // Batch internals, the batch plan and analysis comparisons are not separate experiments
  assert.deepEqual(discoverExperiments(c), [{ root: main, kind: 'campaign' }])
  const experiment = await loadExperiment(c, main)
  assert.equal(experiment.batch?.name, 'example-batch')
  assert.equal(experiment.batch?.incomplete, true)
  assert.deepEqual(experiment.batch?.missing, [
    'operate/rural-coverage-3-peers/raw-delivery/train-seed-101/checkpoint-final/online-sb3/diagnostic/seed-202',
  ])
  assert.ok(experiment.issues.some((i) => i.includes('no accepted output yet')))
  assert.equal(experiment.campaignProgress?.status, 'completed_with_warnings')
  assert.deepEqual(
    [experiment.campaignProgress?.trained, experiment.campaignProgress?.expected],
    [1, 1]
  )
  // 2 checkpoints x 4 operations, each pooling its two diagnostic seeds
  assert.equal(experiment.evaluations.length, 8)
  assert.equal(new Set(experiment.evaluations.map((e) => e.key)).size, 8)
  for (const e of experiment.evaluations) {
    assert.equal(e.heldOut, false)
    assert.deepEqual(e.policies, ['model', 'scripted', 'hold', 'random_valid'])
    assert.equal(e.trainingRunDir, `${root}/models/${SCENE}/raw-delivery/train/train-seed-101/attempt-1`)
    assert.ok(e.label.includes('Diagnostic seeds'))
    assert.equal(e.missionTags?.batch, 'example-batch')
    assert.equal(e.missionTags?.phase, null)
    for (const episode of e.episodes) {
      assert.ok(episode.playable && episode.hasTelemetry, episode.dir)
      assert.ok(episode.dir.startsWith(`${root}/`))
    }
  }
  const sb3Final = experiment.evaluations.find(
    (e) => e.batch?.view.protocol === 'online_sb3_v1' && e.batch.view.checkpoint === 'final'
  )!
  assert.equal(sb3Final.state, 'incomplete')
  assert.deepEqual(
    sb3Final.episodes.filter((e) => e.policy === 'model').map((e) => e.seed),
    [201]
  )
  assert.match(sb3Final.message!, /seed 202/)
  assert.equal(sb3Final.batch?.view.status, 'incomplete')
  const others = experiment.evaluations.filter((e) => e !== sb3Final)
  assert.ok(others.every((e) => e.state === 'ok'), others.map((e) => e.message).join('\n'))
  assert.deepEqual(
    experiment.evaluations.map(executionMode).sort(),
    [
      'Deterministic',
      'Deterministic',
      'Online',
      'Online',
      'Online',
      'Online',
      'Sampled',
      'Sampled',
    ]
  )
  // Online leaves keep their v5 provenance; the SB3 leaf has no eval manifest at all
  const sb3 = experiment.evaluations.find(
    (e) => e.batch?.view.protocol === 'online_sb3_v1' && e.batch.view.checkpoint === '128'
  )!
  assert.equal(sb3.provenance?.kind, 'online')
  assert.equal(sb3.provenance?.settings?.n_steps, 16)
  assert.equal(sb3.batch?.view.references[0].online?.accounting?.update_cycles, 4)
  assert.ok(sb3.contract, 'model-level contract from a sibling eval manifest')
  // Baseline policies keep their own scenario identity and one summary is never invented
  const scripted = sb3.episodes.find((e) => e.policy === 'scripted')!
  assert.equal(scripted.files.inputHashes?.nodesJson, 'n-scripted')
  assert.equal(sb3.policySummaries.model, null)
})

test('missing metrics stay null and absent results never become zero or a rank', async () => {
  const c = catalog(materialize(clone(fixtures.index_v4), ''))
  const experiment = await loadExperiment(c, `main/${SCENE}`)
  const deterministic = experiment.evaluations.filter(
    (e) => e.batch?.view.protocol === 'frozen_deterministic'
  )
  const episode = deterministic[0].episodes.find((e) => e.policy === 'model')!
  assert.equal(episode.metrics?.final_minute_original_delivery, null)
  const rows = comparisonRows(experiment.evaluations, 'coverage')
  const model = rows.find((r) => r.evaluation === deterministic[0] && r.policy === 'model')!
  assert.equal(model.values.final_minute_coverage, 0.6)
  assert.equal(model.values.final_minute_original_delivery, null)
  assert.equal(model.ranges.final_minute_original_delivery, 'Metric not recorded; no value inferred.')
  // The incomplete group reports only its one completed seed
  const partial = rows.find(
    (r) => r.policy === 'model' && r.evaluation.batch?.view.status === 'incomplete'
  )!
  assert.deepEqual(partial.seeds, [201])
  assert.equal(partial.values.final_minute_coverage, 0.5)
})

test('online v5 records are parsed from explicit fields, never from absolute paths', () => {
  const parsed = parseOnlineRecord(fixtures.online_v5, 'ops/leaf/attempt-1')
  assert.equal(parsed.issue, null)
  assert.equal(parsed.record?.protocol, 'online_gated_v1')
  assert.equal(parsed.record?.seedRole, 'diagnostic')
  assert.deepEqual(parsed.record?.evaluationSeeds, [201])
  assert.equal(parsed.record?.episodeDir, 'ops/leaf/attempt-1/episode-0001')
  assert.equal(parsed.record?.evalManifest, 'ops/leaf/attempt-1/eval_manifest.json')
  assert.equal(parsed.record?.accounting?.untrained_tail_decisions, 0)
  const old = { ...clone(fixtures.online_v5), online_experiment_version: 4 }
  assert.match(parseOnlineRecord(old, 'x').issue!, /unsupported online_experiment_version 4/)
  const unnamed = { ...clone(fixtures.online_v5), protocol: undefined }
  assert.match(parseOnlineRecord(unnamed, 'x').issue!, /no protocol/)
})

test('batch paths cannot leave the batch root', async () => {
  for (const bad of ['../x', 'a/../../x', '/abs/x', 'C:/x', 'a\\b', 'https://host/x', 'file:x', ''])
    assert.equal(resolveBatchPath('root', bad), null, bad)
  assert.equal(resolveBatchPath('root', 'main/x.json'), 'root/main/x.json')
  assert.equal(resolveBatchPath('', 'main/x.json'), 'main/x.json')

  const index = clone(fixtures.index_v4)
  const ref = list(list(index.models)[0].evaluations)[0]
  const entries = materialize(index, 'b')
  ref.eval_manifest = '../outside/eval_manifest.json'
  entries['outside/eval_manifest.json'] = {}
  entries[`b/main/${SCENE}/mission_scenario.json`] = index
  const c = catalog(entries)
  const experiment = await loadExperiment(c, `b/main/${SCENE}`)
  assert.ok(!c.reads.some((p) => p.startsWith('outside/')))
  assert.ok(experiment.issues.some((i) => /eval_manifest is not a batch-relative path/.test(i)))
  const affected = experiment.evaluations.find((e) =>
    e.batch?.view.references.some((r) => r.task === ref.task)
  )!
  assert.equal(affected.state, 'incomplete')
})

test('missing scenario assets and unreadable manifests are reported, not filled', async () => {
  const index = clone(fixtures.index_v4)
  const entries = materialize(index, '')
  const buildings = rec(rec(rec(index.assets).run_config).buildings).path as string
  delete entries[buildings]
  const ref = list(list(index.baselines)[0].evaluations)[1]
  delete entries[ref.eval_manifest as string]
  const experiment = await loadExperiment(catalog(entries), `main/${SCENE}`)
  const asset = experiment.batch!.assets.find((a) => a.name === 'buildings')!
  assert.equal(asset.present, false)
  assert.equal(experiment.batch!.assets.find((a) => a.name === 'run_config')!.present, true)
  assert.equal(experiment.batch!.assets.find((a) => a.name === 'reference')!.present, null)
  assert.ok(experiment.issues.some((i) => i.includes(`Scenario asset buildings (${buildings})`)))
  assert.ok(experiment.issues.some((i) => i.includes('is not in the selected folder or not readable')))
  // The scripted seed-202 baseline is absent, so every evaluation it was planned beside is short
  for (const e of experiment.evaluations) {
    assert.equal(e.state, 'incomplete')
    assert.deepEqual(
      e.episodes.filter((p) => p.policy === 'scripted').map((p) => p.seed),
      [201]
    )
  }
})

/** Two training seeds x two checkpoints x two online protocols x two evaluation seeds. */
function sixteenLeafIndex(): Data {
  const base = clone(fixtures.index_v4)
  const models: Data[] = []
  for (const trainingSeed of [101, 102])
    for (const checkpoint of ['128', 'final']) {
      const model = clone(list(base.models)[0])
      model.training_seed = trainingSeed
      model.seed_segment = `train-seed-${trainingSeed}`
      model.checkpoint = checkpoint
      rec(model.training).task = `train/${SCENE}/raw-delivery/train-seed-${trainingSeed}`
      model.evaluations = ['online_gated_v1', 'online_sb3_v1'].flatMap((protocol) =>
        [201, 202].map((seed) => {
          const op = protocol === 'online_gated_v1' ? 'online-gated' : 'online-sb3'
          const leaf = `operations/${SCENE}/raw-delivery/train-seed-${trainingSeed}/checkpoint-${checkpoint}/${op}-${seed}/diagnostic/seed-${seed}/attempt-1`
          return {
            task: `operate/${SCENE}/raw-delivery/train-seed-${trainingSeed}/checkpoint-${checkpoint}/${op}/diagnostic/seed-${seed}`,
            key: `${trainingSeed}-${checkpoint}-${protocol}-${seed}`,
            operation: op,
            operation_digest: `digest-${op}`,
            mode: 'online',
            protocol,
            schedule: null,
            role: 'diagnostic',
            seed,
            model_sha256: `model-${trainingSeed}-${checkpoint}`,
            group: `group-${trainingSeed}-${checkpoint}-${protocol}`,
            status: 'complete',
            attempt: leaf,
            eval_manifest: null,
            online_manifest: `${leaf}/online_manifest.json`,
            weight_audit: `${leaf}/weight_audit.json`,
            manifest_status: 'completed',
            episodes: [{ seed, episode_dir: `${leaf}/episode-0001`, inputs: `${leaf}/episode-0001/inputs` }],
            issues: [],
          }
        })
      )
      models.push(model)
    }
  base.models = models
  base.baselines = []
  base.missing = []
  base.incomplete = false
  return base
}

test('16 distinct leaves pool into 8 groups only where every identity dimension agrees', async () => {
  const index = sixteenLeafIndex()
  const experiment = await loadExperiment(catalog(materialize(index, 'b')), `b/main/${SCENE}`)
  assert.equal(experiment.evaluations.length, 8)
  const dirs = experiment.evaluations.flatMap((e) => e.episodes.map((p) => p.dir))
  assert.equal(dirs.length, 16)
  assert.equal(new Set(dirs).size, 16)
  for (const e of experiment.evaluations) {
    const view = e.batch!.view
    assert.equal(e.state, 'ok', e.message ?? '')
    assert.deepEqual(view.completedSeeds, [201, 202])
    assert.equal(new Set(view.references.map((r) => r.group)).size, 1)
    assert.equal(e.trainingSeed, view.trainingSeed)
    assert.ok(e.label.includes(`checkpoint ${view.checkpoint}`))
  }
  const identities = experiment.evaluations.map((e) => {
    const v = e.batch!.view
    return `${v.trainingSeed}/${v.checkpoint}/${v.protocol}`
  })
  assert.equal(new Set(identities).size, 8)
})

test('equal group digests with a different role, or a repeated seed, are never pooled', async () => {
  const index = sixteenLeafIndex()
  index.models = [list(index.models)[0]]
  const refs = list(list(index.models)[0].evaluations)
  // Same group digest, but this seed was run as model-selection evidence
  refs[1].role = 'model_selection'
  // A second attempt of the same task and seed in the same group
  const repeat = clone(refs[2])
  repeat.attempt = (repeat.attempt as string).replace('attempt-1', 'attempt-2')
  repeat.online_manifest = `${repeat.attempt}/online_manifest.json`
  repeat.episodes = [{ seed: repeat.seed, episode_dir: `${repeat.attempt}/episode-0001` }]
  refs.push(repeat)
  const experiment = await loadExperiment(catalog(materialize(index, '')), `main/${SCENE}`)
  const gated = experiment.evaluations.filter((e) => e.batch?.view.protocol === 'online_gated_v1')
  assert.deepEqual(gated.map((e) => e.batch!.view.role).sort(), ['diagnostic', 'model_selection'])
  for (const e of gated) assert.equal(e.episodes.length, 1)
  assert.ok(gated.some((e) => e.label.includes('Model-selection seeds')))
  const sb3 = experiment.evaluations.find((e) => e.batch?.view.protocol === 'online_sb3_v1')!
  assert.equal(sb3.episodes.length, 2)
  assert.ok(sb3.episodes.every((p) => p.dir.includes('/attempt-1/')))
  assert.equal(sb3.state, 'incomplete')
  assert.ok(experiment.issues.some((i) => /attempts are never pooled/.test(i)))
})

test('held-out references stay held out and unselected branches are not failures', async () => {
  const index = sixteenLeafIndex()
  index.models = [list(index.models)[0]]
  const refs = list(list(index.models)[0].evaluations)
  for (const ref of refs.slice(0, 2)) ref.role = 'held_out'
  for (const ref of refs.slice(2)) {
    ref.status = 'skipped_selection'
    ref.attempt = null
    ref.online_manifest = null
    ref.weight_audit = null
    ref.episodes = []
  }
  const experiment = await loadExperiment(catalog(materialize(index, '')), `main/${SCENE}`)
  assert.equal(experiment.evaluations.length, 1)
  const [held] = experiment.evaluations
  assert.equal(held.heldOut, true)
  assert.deepEqual(held.heldOutSeeds, [201, 202])
  assert.ok(held.label.includes('Held-out seeds'))
  const skipped = experiment.batch!.views.find((v) => v.status === 'skipped_selection')!
  assert.equal(skipped.protocol, 'online_sb3_v1')
  assert.deepEqual(skipped.evaluationKeys, [])
})

test('legacy v1 and v4 indexes coexist; the legacy root keeps the legacy loader', async () => {
  const entries = materialize(clone(fixtures.index_v4), 'batch')
  const legacy = 'custom/10-16'
  const scene = 'urban-investigation-extra-large'
  entries[`${legacy}/main/${scene}/mission_scenario.json`] = {
    mission_scenario_version: 1,
    models: [{ scene, reward: 'investigation', comparison: 'standard', profile: 'standard' }],
  }
  const c = catalog(entries)
  assert.deepEqual(discoverExperiments(c), [
    { root: `batch/main/${SCENE}`, kind: 'campaign' },
    { root: `${legacy}/main/${scene}`, kind: 'campaign' },
  ])
  const layouts = missionScenarios(c.paths())
  assert.equal(layouts.find((l) => l.campaign === 'batch')?.batch, true)
  assert.equal('batch' in layouts.find((l) => l.campaign === legacy)!, false)
  // Batch-only internal folders are not hidden in a legacy campaign
  assert.equal(isMissionInternal(`${legacy}/analysis`, layouts), false)
  assert.equal(isMissionInternal('batch/analysis/x', layouts), true)
  assert.equal(isMissionInternal('batch', layouts), true)
  const old = await loadExperiment(c, `${legacy}/main/${scene}`)
  assert.equal(old.batch, undefined)
  assert.equal(old.evaluations[0].batch, undefined)
  assert.equal(old.evaluations[0].message, 'Model training or evaluation is pending.')
  const batch = await loadExperiment(c, `batch/main/${SCENE}`)
  assert.equal(batch.evaluations.length, 8)
})

test('a batch root keeps training rollouts and internals out of the catalog and run lists', () => {
  const rollout = `models/${SCENE}/raw-delivery/train/train-seed-101/attempt-1/rollouts/episode-0003`
  assert.equal(isCatalogFile(`${rollout}/seed-101/links.csv`.split('/')), false)
  assert.equal(isCatalogFile(`${rollout}/rl_episode.json`.split('/')), true)
  assert.equal(isCatalogFile(`${rollout}/inputs/run.ini`.split('/')), false)
  assert.equal(isCatalogFile(`main/${SCENE}/assets/e63180bbdaec/run.ini`.split('/')), true)
  assert.equal(isCatalogFile('elsewhere/assets/e63180bbdaec/run.ini'.split('/')), false)
  assert.equal(
    isCatalogFile(
      `models/${SCENE}/raw-delivery/train/train-seed-101/attempt-1/train_manifest.json`.split('/')
    ),
    true
  )
})

test('only the batch index explicit protocol decides the execution mode', () => {
  const view = (protocol: string, mode: string, schedule: unknown = null) =>
    ({
      label: 'Frozen sampled',
      batch: { name: 'b', view: { kind: 'model', protocol, mode, schedule } },
    }) as unknown as Evaluation
  assert.equal(executionMode(view('frozen_deterministic', 'frozen')), 'Deterministic')
  assert.equal(executionMode(view('frozen_sampled', 'frozen')), 'Sampled')
  assert.equal(
    executionMode(view('frozen_sampled', 'frozen', { kind: 'stall-burst', digest: 'd' })),
    'Sampling schedule'
  )
  assert.equal(executionMode(view('online_sb3_v1', 'online')), 'Online')
})

test('references with the same group but a different per-row INI copy are never pooled', async () => {
  const index = sixteenLeafIndex()
  index.models = [list(index.models)[0]]
  const refs = list(list(index.models)[0].evaluations).slice(0, 2)
  list(index.models)[0].evaluations = refs
  refs[0].config = { path: `main/${SCENE}/assets/aaaaaaaaaaaa/run.ini`, sha256: 'a'.repeat(64), config_source: 'row' }
  refs[1].config = { path: `main/${SCENE}/assets/bbbbbbbbbbbb/run.ini`, sha256: 'b'.repeat(64), config_source: 'row' }
  const entries = materialize(index, '')
  entries[`main/${SCENE}/assets/aaaaaaaaaaaa/run.ini`] = '[sim]'
  const experiment = await loadExperiment(catalog(entries), `main/${SCENE}`)
  assert.equal(experiment.evaluations.length, 2)
  const views = experiment.evaluations.map((e) => e.batch!.view)
  assert.deepEqual(views.map((v) => v.config?.sha256?.[0]).sort(), ['a', 'b'])
  assert.ok(views.every((v) => v.config?.source === 'row' && v.references.length === 1))
  assert.deepEqual(views.map((v) => v.config?.present).sort(), [false, true])
  assert.equal(new Set(experiment.evaluations.map((e) => e.label)).size, 2)
  assert.ok(experiment.evaluations.some((e) => e.label.includes('row INI bbbbbbbbbbbb')))
  // The producer fixture records its scenario run_config INI on every reference
  const fixture = await loadExperiment(
    catalog(materialize(clone(fixtures.index_v4), '')),
    `main/${SCENE}`
  )
  const config = fixture.evaluations[0].batch!.view.config!
  assert.equal(config.source, 'run_config')
  assert.equal(config.present, true)
})

test('placement baselines keep their planning identity and differing planning seeds stay apart', async () => {
  const index = clone(fixtures.index_v4)
  const scripted = list(index.baselines)[0]
  const geometric = clone(scripted)
  geometric.policy = 'geometric'
  geometric.planning = {
    planning_seed: 7,
    planning_seed_source: 'matrix',
    planner_settings_sha256: 'p'.repeat(64),
    mapping_file: { path: `main/${SCENE}/assets/mapping/mapping.json`, sha256: 'm'.repeat(64) },
  }
  for (const raw of list(geometric.evaluations)) {
    raw.policy = 'geometric'
    raw.task = (raw.task as string).replace('scripted', 'geometric')
    raw.eval_manifest = (raw.eval_manifest as string).replace('scripted', 'geometric')
    raw.attempt = (raw.attempt as string).replace('scripted', 'geometric')
    raw.episodes = list(raw.episodes).map((e) => ({
      ...e,
      episode_dir: (e.episode_dir as string).replace('scripted', 'geometric'),
    }))
  }
  index.baselines = [...list(index.baselines), geometric]
  const experiment = await loadExperiment(catalog(materialize(index, '')), `main/${SCENE}`)
  const view = experiment.batch!.views.find((v) => v.policy === 'geometric')!
  assert.equal(view.planning?.planningSeed, 7)
  assert.equal(view.planning?.planningSeedSource, 'matrix')
  assert.equal(view.planning?.mappingFile?.path, `main/${SCENE}/assets/mapping/mapping.json`)
  assert.ok(view.label.includes('planning seed 7'))
  assert.deepEqual(view.completedSeeds, [201, 202])
  assert.ok(experiment.evaluations[0].policies.includes('geometric'))

  // A reference-level planning seed overrides the entry's and splits the group
  list(geometric.evaluations)[1].planning = { ...rec(geometric.planning), planning_seed: 8 }
  const split = await loadExperiment(catalog(materialize(index, '')), `main/${SCENE}`)
  const views = split.batch!.views.filter((v) => v.policy === 'geometric')
  assert.deepEqual(views.map((v) => v.planning?.planningSeed).sort(), [7, 8])
  assert.ok(views.every((v) => v.references.length === 1))
  // Two differently identified groups are not shown beside the models as one baseline
  assert.ok(!split.evaluations[0].policies.includes('geometric'))
  assert.ok(split.issues.some((i) => /Baseline geometric has 2 differently identified groups/.test(i)))
})
