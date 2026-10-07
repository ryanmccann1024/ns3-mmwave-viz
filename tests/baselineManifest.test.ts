import test from 'node:test'
import assert from 'node:assert/strict'
import {
  compareScenarioIdentity,
  parseBaselineManifest,
  parseBaselinePlan,
  resolveRef,
} from '../src/lib/baselineManifest.ts'
import type { BaselineManifest } from '../src/lib/baselineManifest.ts'
import { json, makeBaselineManifest, makeBaselinePlan } from './helpers/baselineFixtures.ts'

function manifest(overrides: Record<string, unknown> = {}): BaselineManifest {
  const r = parseBaselineManifest(json(makeBaselineManifest(overrides)))
  assert.ok(r.ok, r.ok ? '' : r.reason)
  return r.value
}

const hashes = (nodes: string | null) => ({
  run_ini_sha256: 'ini-a',
  nodes_json_sha256: nodes,
  buildings_json_sha256: 'bld-a',
  jammers_json_sha256: 'jam-a',
  run_config: 'configs/run.ini',
})

test('1: a full v1 standalone manifest maps every field', () => {
  const v = manifest({
    run_id: 'run-123',
    requested_algorithm: 'auto',
    method: 'geometric',
    objective: 'coverage',
    application: 'mesh',
    executor: 'local',
    started_at: '2026-09-30T12:00:00Z',
    ended_at: '2026-09-30T12:05:00Z',
    status: 'complete',
    error: null,
    planner_seed: 7,
    planner_seed_status: 'used',
    max_iterations: 500,
    max_iterations_status: 'ignored',
    planner_source: { aggregate_sha256: 'src-hash' },
    rf: { sha256: 'rf-hash' },
    source_scenario_identity: hashes('nodes-src'),
    effective_scenario_identity: hashes('nodes-eff'),
    package_versions: { numpy: '2.0.1', bad: 3 },
    mapping_sha256: 'map-hash',
    sim_binary_sha256: 'bin-hash',
    fingerprint: 'fp',
    simulation_seeds: [1, 2],
    initial_displacement_m_total: 12.3,
    planner_wall_s: 4.2,
    plan: 'effective-inputs/baseline-plan.json',
    seeds: [{ seed: 1, status: 'complete', summary: 'seed-1/summary.json' }],
  })
  assert.equal(v.version, 1)
  assert.equal(v.runId, 'run-123')
  assert.equal(v.mode, 'standalone')
  assert.equal(v.requestedAlgorithm, 'auto')
  assert.equal(v.method, 'geometric')
  assert.equal(v.objective, 'coverage')
  assert.equal(v.application, 'mesh')
  assert.equal(v.executor, 'local')
  assert.equal(v.startedAt, '2026-09-30T12:00:00Z')
  assert.equal(v.endedAt, '2026-09-30T12:05:00Z')
  assert.equal(v.status, 'complete')
  assert.equal(v.rawStatus, 'complete')
  assert.equal(v.error, null)
  assert.equal(v.plannerSeed, 7)
  assert.equal(v.plannerSeedStatus, 'used')
  assert.equal(v.maxIterations, 500)
  assert.equal(v.maxIterationsStatus, 'ignored')
  assert.equal(v.plannerSourceSha256, 'src-hash')
  assert.equal(v.rfConfigSha256, 'rf-hash')
  assert.equal(v.mappingSha256, 'map-hash')
  assert.equal(v.simBinarySha256, 'bin-hash')
  assert.equal(v.fingerprint, 'fp')
  assert.deepEqual(v.packageVersions, { numpy: '2.0.1' })
  assert.deepEqual(v.simulationSeeds, [1, 2])
  assert.equal(v.initialDisplacementMTotal, 12.3)
  assert.equal(v.plannerWallS, 4.2)
  assert.equal(v.planRef, 'effective-inputs/baseline-plan.json')
  assert.equal(v.sourceScenarioIdentity?.nodesJsonSha256, 'nodes-src')
  assert.equal(v.effectiveScenarioIdentity?.nodesJsonSha256, 'nodes-eff')
  assert.deepEqual(v.seeds, [
    { seed: 1, status: 'complete', rawStatus: 'complete', summaryRef: 'seed-1/summary.json' },
  ])
})

test('2: unsupported or missing manifest version is rejected', () => {
  const v2 = parseBaselineManifest(json(makeBaselineManifest({ baseline_manifest_version: 2 })))
  assert.equal(v2.ok, false)
  assert.match(v2.ok ? '' : v2.reason, /version/)
  const raw = makeBaselineManifest()
  delete raw.baseline_manifest_version
  const missing = parseBaselineManifest(json(raw))
  assert.equal(missing.ok, false)
  assert.match(missing.ok ? '' : missing.reason, /version/)
})

test('3: invalid JSON, arrays and strings are rejected', () => {
  for (const text of ['{nope', '[]', '"a string"', 'null', '42']) {
    const r = parseBaselineManifest(text)
    assert.equal(r.ok, false, text)
  }
  assert.deepEqual(parseBaselineManifest('{nope'), { ok: false, reason: 'invalid JSON' })
  assert.deepEqual(parseBaselineManifest('[]'), { ok: false, reason: 'not an object' })
})

test('4: lifecycle statuses parse to themselves; unknown ones stay raw', () => {
  for (const status of ['preparing', 'prepared', 'running', 'complete', 'failed', 'interrupted']) {
    const v = manifest({ status })
    assert.equal(v.status, status)
    assert.equal(v.rawStatus, status)
  }
  const odd = manifest({ status: 'exploded' })
  assert.equal(odd.status, 'unknown')
  assert.equal(odd.rawStatus, 'exploded')
})

test('5: objectives are kept raw, truncated and cleaned', () => {
  for (const objective of ['coverage', 'balanced', 'resilience', 'zeta'])
    assert.equal(manifest({ objective }).objective, objective)
  assert.equal(manifest({ objective: 'x'.repeat(200) }).objective, 'x'.repeat(32))
  assert.equal(manifest({ objective: ' cov\u0000er\u0007age\n ' }).objective, 'coverage')
})

test('6: numbers are never coerced and zero is kept', () => {
  assert.equal(manifest({ planner_wall_s: '12' }).plannerWallS, null)
  // JSON cannot carry NaN/Infinity; parse a manifest built from an object with them patched in
  const r = parseBaselineManifest(
    json(makeBaselineManifest()).replace('"planner_wall_s":null', '"planner_wall_s":1e999')
  )
  assert.ok(r.ok)
  assert.equal(r.value.plannerWallS, null)
  assert.equal(manifest({ initial_displacement_m_total: 0 }).initialDisplacementMTotal, 0)
  assert.equal(manifest({ planner_seed: 0 }).plannerSeed, 0)
  assert.equal(manifest({ max_iterations: '500' }).maxIterations, null)
})

test('7: seed records drop entries without numeric seed and unsafe summaries', () => {
  const v = manifest({
    seeds: [
      { seed: 1, status: 'complete', summary: 'seed-1/summary.json' },
      { seed: '2', status: 'complete', summary: 'seed-2/summary.json' },
      { status: 'failed' },
      { seed: 3, status: 'missing', summary: '../seed-3/summary.json' },
      { seed: 4, status: 'weird' },
      'not-a-record',
    ],
  })
  assert.deepEqual(v.seeds, [
    { seed: 1, status: 'complete', rawStatus: 'complete', summaryRef: 'seed-1/summary.json' },
    { seed: 3, status: 'missing', rawStatus: 'missing', summaryRef: null },
    { seed: 4, status: 'unknown', rawStatus: 'weird', summaryRef: null },
  ])
  assert.deepEqual(manifest({ seeds: 'nope' }).seeds, [])
})

test('8: plan references must be safe relative paths', () => {
  assert.equal(
    manifest({ plan: 'effective-inputs/baseline-plan.json' }).planRef,
    'effective-inputs/baseline-plan.json'
  )
  for (const plan of ['../x.json', '/abs', 'C:\\x', 'a\\b', 'x\0y', 3, null])
    assert.equal(manifest({ plan }).planRef, null, String(plan))
})

test('9: host paths and eval references are not carried into the parsed manifest', () => {
  const v = manifest({
    eval_manifest: '../../eval_manifest.json',
    source_run_config_abs: '/home/user/run.ini',
    planner_log: 'planner.log',
    sim_log: 'sim.log',
    origin: { lat: 1, lon: 2 },
  })
  for (const key of [
    'evalManifest',
    'eval_manifest',
    'sourceRunConfigAbs',
    'source_run_config_abs',
    'plannerLog',
    'simLog',
    'origin',
  ])
    assert.ok(!(key in v), key)
  assert.ok(!JSON.stringify(v).includes('/home/user'))
})

test('10: scenario identities map partially and reject non-objects', () => {
  const v = manifest({
    effective_scenario_identity: { nodes_json_sha256: 'eff-nodes' },
    source_scenario_identity: hashes('src-nodes'),
    planner_source: { aggregate_sha256: 'agg', sha256: 'not-this-one' },
  })
  assert.deepEqual(v.effectiveScenarioIdentity, {
    runIniSha256: null,
    nodesJsonSha256: 'eff-nodes',
    buildingsJsonSha256: null,
    jammersJsonSha256: null,
  })
  assert.deepEqual(v.sourceScenarioIdentity, {
    runIniSha256: 'ini-a',
    nodesJsonSha256: 'src-nodes',
    buildingsJsonSha256: 'bld-a',
    jammersJsonSha256: 'jam-a',
  })
  assert.equal(v.plannerSourceSha256, 'agg')
  assert.equal(manifest({ planner_source: { sha256: 'only-this' } }).plannerSourceSha256, null)
  assert.equal(manifest({ effective_scenario_identity: 'hash' }).effectiveScenarioIdentity, null)
  assert.equal(manifest({ source_scenario_identity: [1] }).sourceScenarioIdentity, null)
  assert.equal(manifest({ rf: 'rf.yaml' }).rfConfigSha256, null)
})

test('11: baseline plans parse nodes and reject bad versions', () => {
  const r = parseBaselinePlan(
    json(
      makeBaselinePlan({
        method: 'geometric',
        objective: 'coverage',
        initial_displacement_m_total: 5,
        nodes: [
          {
            id: 'uav-0',
            roster_index: 0,
            slot: 1,
            selected: true,
            original: { x: 0, y: 0, z: 10 },
            planned: { x: 3, y: 4, z: 10 },
            displacement_m: 5,
          },
          { roster_index: 1, selected: true },
          { id: 'uav-2', selected: 'yes', original: { x: 1, y: 'a', z: 0 } },
        ],
      })
    )
  )
  assert.ok(r.ok)
  assert.equal(r.value.method, 'geometric')
  assert.equal(r.value.objective, 'coverage')
  assert.equal(r.value.initialDisplacementMTotal, 5)
  assert.deepEqual(
    r.value.nodes.map((n) => n.id),
    ['uav-0', 'uav-2']
  )
  assert.equal(r.value.nodes[0].selected, true)
  assert.deepEqual(r.value.nodes[0].planned, { x: 3, y: 4, z: 10 })
  assert.equal(r.value.nodes[0].displacementM, 5)
  assert.equal(r.value.nodes[1].selected, false)
  assert.equal(r.value.nodes[1].original, null)
  assert.equal(parseBaselinePlan(json(makeBaselinePlan({ baseline_plan_version: 0 }))).ok, false)
  assert.equal(parseBaselinePlan(json(makeBaselinePlan({ nodes: {} }))).ok, false)
  assert.equal(parseBaselinePlan('nope').ok, false)
})

test('12: resolveRef joins safe references and rejects unsafe ones', () => {
  const root = '2026-09/30/12-00-00-baseline'
  assert.equal(
    resolveRef(root, 'effective-inputs/baseline-plan.json'),
    '2026-09/30/12-00-00-baseline/effective-inputs/baseline-plan.json'
  )
  assert.equal(
    resolveRef('', 'effective-inputs/baseline-plan.json'),
    'effective-inputs/baseline-plan.json'
  )
  assert.equal(resolveRef(root, '../eval_manifest.json'), null)
  assert.equal(resolveRef(root, '/etc/passwd'), null)
  assert.equal(resolveRef(root, 'a\\b'), null)
  assert.equal(resolveRef(root, null), null)
  assert.equal(resolveRef(root, 'C:/x'), null)
})

test('13: compareScenarioIdentity is per hash and never matches on null', () => {
  const a = manifest({ source_scenario_identity: hashes('n1') }).sourceScenarioIdentity
  const b = manifest({
    source_scenario_identity: { ...hashes('n2'), jammers_json_sha256: null },
  }).sourceScenarioIdentity
  assert.deepEqual(compareScenarioIdentity(a, a), {
    runIniSha256: 'match',
    nodesJsonSha256: 'match',
    buildingsJsonSha256: 'match',
    jammersJsonSha256: 'match',
  })
  assert.deepEqual(compareScenarioIdentity(a, b), {
    runIniSha256: 'match',
    nodesJsonSha256: 'mismatch',
    buildingsJsonSha256: 'match',
    jammersJsonSha256: 'unknown',
  })
  assert.deepEqual(compareScenarioIdentity(null, null), {
    runIniSha256: 'unknown',
    nodesJsonSha256: 'unknown',
    buildingsJsonSha256: 'unknown',
    jammersJsonSha256: 'unknown',
  })
  assert.equal(compareScenarioIdentity(a, null).nodesJsonSha256, 'unknown')
})
