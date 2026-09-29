import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleRuns, fetchRunsFromDevServer, isLegacyRunPath } from '../src/lib/assembleRuns.ts'

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
