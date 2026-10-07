import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assembleRuns,
  fetchRunsFromDevServer,
  isLegacyRunPath,
  parseRunsFromFileList,
} from '../src/lib/assembleRuns.ts'
import { catalogFromFileList } from '../src/lib/resultCatalog.ts'

const RL = 'bypass-matrix/eval/local-delivery/train-seed-101/model/episode-0000/seed-301'
const pair = (path: string) => ({ path, file: new File(['x'], path.split('/').pop()!) })

test('legacy path predicate', () => {
  for (const p of [
    '2026-09/13/13-27-29/seed-1/links.csv',
    'outputs/2026-09/15/13-27-29/point-001/seed-1/links.csv',
    '2026-09/15/13-27-29/point-001/inputs/nodes.json',
    '2026-09/13/13-27-29/inputs/buildings-wood.json',
    '2026-05/19/13-59-28-validation/arpo-2-x-misc-12345678/seed-3/positions.csv',
  ])
    assert.equal(isLegacyRunPath(p), true, p)
  for (const p of [
    `${RL}/links.csv`,
    'bypass-matrix/eval/local-delivery/train-seed-101/model/episode-0000/inputs/nodes.json',
    'one-seed/model/episode-0000/seed-301/links.csv',
    '2026-09/13/13-27-29/summary.json',
  ])
    assert.equal(isLegacyRunPath(p), false, p)
})

test('legacy runs still group; RL paths produce no run', () => {
  const runs = assembleRuns([
    pair('2026-09/13/13-27-29/seed-1/links.csv'),
    pair('2026-09/13/13-27-29/seed-1/positions.csv'),
    pair('2026-09/13/13-27-29/inputs/nodes.json'),
    pair('2026-09/13/13-27-29/inputs/jammers.json'),
    pair(`${RL}/links.csv`),
    pair(`${RL}/positions.csv`),
    pair('bypass-matrix/eval/local-delivery/train-seed-101/model/episode-0000/inputs/nodes.json'),
  ])
  assert.equal(runs.length, 1)
  assert.equal(runs[0].key, '2026-09/13/13-27-29/seed-1')
  assert.equal(runs[0].time, '13-27-29')
  assert.ok(runs[0].nodesJsonFile)
  assert.ok(runs[0].jammersJsonFile)
})

test('dev-server discovery never downloads RL files', async (t) => {
  const calls: string[] = []
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  globalThis.fetch = (async (input: string) => {
    calls.push(input)
    if (input !== '/api/outputs') return new Response('x')
    return Response.json([
      '2026-09/13/13-27-29/seed-1/links.csv',
      '2026-09/13/13-27-29/seed-1/positions.csv',
      `${RL}/links.csv`,
      `${RL}/positions.csv`,
      'bypass-matrix/experiment_plan.json',
    ])
  }) as typeof fetch

  const runs = await fetchRunsFromDevServer()
  assert.equal(runs?.length, 1)
  assert.deepEqual(calls.sort(), [
    '/api/outputs',
    '/outputs/2026-09/13/13-27-29/seed-1/links.csv',
    '/outputs/2026-09/13/13-27-29/seed-1/positions.csv',
  ])
})

const BASE = '2026-09/30/12-00-00-baseline'
const seedPair = (dir: string, seed = 1) => [
  pair(`${dir}/seed-${seed}/links.csv`),
  pair(`${dir}/seed-${seed}/positions.csv`),
]

test('top-level runs keep their key and record the run directory', () => {
  const runs = assembleRuns([
    ...seedPair('2026-09/13/13-27-29'),
    pair('2026-09/13/13-27-29/point-001/seed-1/links.csv'),
    pair('2026-09/13/13-27-29/point-001/seed-1/positions.csv'),
  ])
  assert.deepEqual(
    runs.map((r) => [r.key, r.runDir, r.point]),
    [
      ['2026-09/13/13-27-29/seed-1', '2026-09/13/13-27-29', undefined],
      ['2026-09/13/13-27-29/point-001/seed-1', '2026-09/13/13-27-29', 'point-001'],
    ]
  )
})

test('baseline run directories group as ordinary seed runs', () => {
  const runs = assembleRuns([...seedPair(BASE), ...seedPair(`${BASE}-2`)])
  assert.equal(runs.length, 2)
  const byTime = new Map(runs.map((r) => [r.time, r]))
  assert.equal(byTime.get('12-00-00-baseline')?.key, `${BASE}/seed-1`)
  assert.equal(byTime.get('12-00-00-baseline')?.runDir, BASE)
  assert.equal(byTime.get('12-00-00-baseline-2')?.runDir, `${BASE}-2`)
  assert.notEqual(byTime.get('12-00-00-baseline')?.key, byTime.get('12-00-00-baseline-2')?.key)
  for (const p of [`${BASE}/seed-1/links.csv`, `${BASE}-2/seed-1/positions.csv`])
    assert.equal(isLegacyRunPath(p), true, p)
  assert.equal(isLegacyRunPath(`${BASE}/episode-0001/seed-1/links.csv`), false)
})

test('a manifest-only baseline run yields no entry', () => {
  assert.deepEqual(
    assembleRuns([
      pair(`${BASE}/baseline_manifest.json`),
      pair(`${BASE}/effective-inputs/baseline-plan.json`),
    ]),
    []
  )
})

test('nested dated runs with the same suffix stay distinct', () => {
  const runs = assembleRuns([
    ...seedPair(`a/outputs/${BASE}`),
    ...seedPair(`b/outputs/${BASE}`),
    pair(`a/outputs/${BASE}/inputs/nodes.json`),
  ])
  assert.equal(runs.length, 2)
  const byDir = new Map(runs.map((r) => [r.runDir, r]))
  assert.equal(byDir.get(`a/outputs/${BASE}`)?.key, `a/outputs/${BASE}/seed-1`)
  assert.equal(byDir.get(`b/outputs/${BASE}`)?.key, `b/outputs/${BASE}/seed-1`)
  // Shared inputs apply only to their own run directory
  assert.ok(byDir.get(`a/outputs/${BASE}`)?.nodesJsonFile)
  assert.equal(byDir.get(`b/outputs/${BASE}`)?.nodesJsonFile, undefined)
})

test('classic picker paths drop the picked folder, matching the catalog', () => {
  const picked = (rel: string) => {
    const file = new File(['x'], rel.split('/').pop()!)
    Object.defineProperty(file, 'webkitRelativePath', { value: rel })
    return file
  }
  const files = [
    picked(`outputs/${BASE}/seed-1/links.csv`),
    picked(`outputs/${BASE}/seed-1/positions.csv`),
    picked(`outputs/${BASE}/baseline_manifest.json`),
    picked(`outputs/${BASE}/episode-0001/seed-1/links.csv`),
    picked(`outputs/${BASE}/episode-0001/seed-1/positions.csv`),
  ]
  const runs = parseRunsFromFileList(files)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].runDir, BASE)
  assert.equal(runs[0].key, `${BASE}/seed-1`)
  const catalog = catalogFromFileList(files)
  assert.ok(catalog.has(`${runs[0].runDir}/baseline_manifest.json`))
})
