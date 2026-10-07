import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleRuns, parseRunsFromFileList } from '../src/lib/assembleRuns.ts'
import {
  BASELINE_MANIFEST_PATH_RE,
  attachBaselineMeta,
  discoverBaselineRuns,
  unmatchedSeedRecords,
} from '../src/lib/baselineRuns.ts'
import type { BaselineRun } from '../src/lib/baselineRuns.ts'
import {
  catalogFromDevServer,
  catalogFromDirectoryHandle,
  catalogFromFileList,
} from '../src/lib/resultCatalog.ts'
import type { ResultCatalog } from '../src/lib/resultCatalog.ts'
import { groupRuns, groupScenarios, unplayableForBatch } from '../src/lib/scenarioGroups.ts'
import { memoryCatalog } from './helpers/memoryCatalog.ts'
import { json, makeBaselineManifest } from './helpers/baselineFixtures.ts'

const RUN = '2026-09/30/12-00-00-baseline'
const RUN2 = '2026-09/30/12-00-00-baseline-2'
const NESTED = 'relocated/outputs/2026-09/30/12-00-00-baseline'
const MANIFEST = 'baseline_manifest.json'

const standalone = (overrides: Record<string, unknown> = {}) =>
  json(
    makeBaselineManifest({
      method: 'geometric',
      objective: 'coverage',
      plan: 'effective-inputs/baseline-plan.json',
      ...overrides,
    })
  )

const pair = (path: string) => ({ path, file: new File(['x'], path.split('/').pop()!) })
const seedPairs = (runDir: string, seed: number) => [
  pair(`${runDir}/seed-${seed}/links.csv`),
  pair(`${runDir}/seed-${seed}/positions.csv`),
]

async function discovered(files: Record<string, string>, opts = {}) {
  return discoverBaselineRuns(memoryCatalog(files, opts))
}

test('manifest path pattern captures the dated run directory', () => {
  const m = BASELINE_MANIFEST_PATH_RE.exec(`${NESTED}/${MANIFEST}`)
  assert.deepEqual(m?.slice(1), ['2026-09', '30', '12-00-00-baseline'])
  assert.equal(BASELINE_MANIFEST_PATH_RE.test(`12-00-00-baseline/${MANIFEST}`), false)
})

test('1: discovers top-level, sibling and nested runs; ignores eval and undated manifests', async () => {
  const runs = await discovered({
    [`${RUN}/${MANIFEST}`]: standalone(),
    [`${RUN2}/${MANIFEST}`]: standalone(),
    [`${NESTED}/${MANIFEST}`]: standalone(),
    [`exp/eval/row-a/geometric/baseline/${MANIFEST}`]: standalone(),
    [`2026-09/30/baseline/${MANIFEST}`]: standalone(),
    [`exp/eval/row-a/train-seed-1/geometric/episode-0000/2026-09/30/x/${MANIFEST}`]: standalone(),
    [`loose/${MANIFEST}`]: standalone(),
    [`2026-09/12-00-00-baseline/${MANIFEST}`]: standalone(),
  })
  assert.deepEqual(
    runs.map((r) => r.runDir),
    [RUN, RUN2, NESTED]
  )
  const top = runs[0]
  assert.equal(top.yearMonth, '2026-09')
  assert.equal(top.day, '30')
  assert.equal(top.time, '12-00-00-baseline')
  assert.equal(top.manifestPath, `${RUN}/${MANIFEST}`)
  assert.equal(top.manifestError, null)
  assert.equal(top.manifest?.method, 'geometric')
  assert.equal(top.planPath, `${RUN}/effective-inputs/baseline-plan.json`)
  assert.equal(runs[1].time, '12-00-00-baseline-2')
  assert.equal(runs[2].planPath, `${NESTED}/effective-inputs/baseline-plan.json`)
})

test('2: evaluation-mode manifests at run-root depth are excluded', async () => {
  const runs = await discovered({
    [`${RUN}/${MANIFEST}`]: standalone({ mode: 'evaluation' }),
    [`${RUN2}/${MANIFEST}`]: standalone(),
  })
  assert.deepEqual(
    runs.map((r) => r.runDir),
    [RUN2]
  )
})

test('3: a malformed manifest keeps its run with an error', async () => {
  const runs = await discovered({
    [`${RUN}/${MANIFEST}`]: '{not json',
    [`${RUN2}/${MANIFEST}`]: standalone(),
  })
  assert.equal(runs.length, 2)
  assert.equal(runs[0].manifest, null)
  assert.equal(runs[0].manifestError, 'invalid JSON')
  assert.equal(runs[0].planPath, null)
  assert.equal(runs[1].manifestError, null)
  assert.ok(runs[1].manifest)

  const [versioned] = await discovered({
    [`${RUN}/${MANIFEST}`]: json(makeBaselineManifest({ baseline_manifest_version: 9 })),
  })
  assert.match(versioned.manifestError ?? '', /version/)
})

test('4: a file that cannot be read does not break discovery', async () => {
  const runs = await discovered(
    { [`${RUN}/${MANIFEST}`]: standalone(), [`${RUN2}/${MANIFEST}`]: standalone() },
    { failPaths: [`${RUN}/${MANIFEST}`] }
  )
  assert.equal(runs.length, 2)
  assert.equal(runs[0].manifest, null)
  assert.equal(runs[0].manifestError, 'manifest not readable')
  assert.ok(!runs[0].manifestError?.includes('simulated'))
  assert.ok(runs[1].manifest)
})

const seeds123 = [
  { seed: 1, status: 'complete', summary: 'seed-1/summary.json' },
  { seed: 2, status: 'complete', summary: 'seed-2/summary.json' },
  { seed: 3, status: 'complete', summary: 'seed-3/summary.json' },
]

test('5, 9, 11: playable seeds gain baseline metadata without duplicates', async () => {
  const baselines = await discovered({ [`${RUN}/${MANIFEST}`]: standalone({ seeds: seeds123 }) })
  const runs = assembleRuns([...seedPairs(RUN, 1), ...seedPairs(RUN, 2)])
  const result = attachBaselineMeta(runs, baselines)
  assert.equal(result.runs.length, 2)
  assert.deepEqual(result.unplayable, [])
  result.runs.forEach((entry, i) => {
    assert.notEqual(entry, runs[i])
    assert.equal(entry.linksFile, runs[i].linksFile)
    assert.equal(entry.posFile, runs[i].posFile)
    assert.equal(entry.key, runs[i].key)
    assert.equal(entry.baseline?.runDir, RUN)
    assert.equal(entry.baseline?.manifest, baselines[0].manifest)
    assert.equal(entry.baseline?.planPath, `${RUN}/effective-inputs/baseline-plan.json`)
    assert.equal(entry.baseline?.seedRecord?.seed, Number(entry.seed.replace('seed-', '')))
  })
  // 11: keys are unique and unchanged
  const keys = result.runs.map((r) => r.key)
  assert.deepEqual(
    keys,
    runs.map((r) => r.key)
  )
  assert.equal(new Set(keys).size, keys.length)
  // 9
  assert.deepEqual(
    unmatchedSeedRecords(baselines[0], [1, 2]).map((s) => s.seed),
    [3]
  )
})

test('6: point runs under the same time never match', async () => {
  const baselines = await discovered({ [`${RUN}/${MANIFEST}`]: standalone({ seeds: seeds123 }) })
  const runs = assembleRuns([
    pair(`${RUN}/point-001/seed-1/links.csv`),
    pair(`${RUN}/point-001/seed-1/positions.csv`),
  ])
  assert.equal(runs[0].point, 'point-001')
  const result = attachBaselineMeta(runs, baselines)
  assert.equal(result.runs[0].baseline, undefined)
  assert.equal(result.runs[0], runs[0])
  assert.equal(result.unplayable.length, 1)
})

test('7, 8: manifest-only failed runs are unplayable; legacy runs are untouched', async () => {
  const baselines = await discovered({
    [`${RUN}/${MANIFEST}`]: standalone({ status: 'failed', error: 'planner crashed' }),
  })
  const legacy = assembleRuns(seedPairs('2026-09/13/13-27-29', 1))
  const result = attachBaselineMeta(legacy, baselines)
  assert.equal(result.unplayable.length, 1)
  assert.equal(result.unplayable[0].manifest?.status, 'failed')
  assert.equal(result.runs.length, 1)
  assert.equal(result.runs[0], legacy[0])
  assert.equal(result.runs[0].baseline, undefined)

  const none = attachBaselineMeta(legacy, [])
  assert.deepEqual(none.unplayable, [])
  assert.equal(none.runs[0].baseline, undefined)
})

test('10: nested roots join on the full run directory and never merge', async () => {
  const baselines = await discovered(
    {
      [`${NESTED}/${MANIFEST}`]: standalone({ seeds: seeds123, method: 'optimization' }),
      [`${RUN}/${MANIFEST}`]: standalone({ seeds: seeds123, method: 'geometric' }),
    },
    { name: 'irrelevant-display-name' }
  )
  const runs = assembleRuns([...seedPairs(NESTED, 1), ...seedPairs(RUN, 1)])
  assert.equal(runs.length, 2)
  assert.notEqual(runs[0].key, runs[1].key)
  const result = attachBaselineMeta(runs, baselines)
  const byDir = new Map(result.runs.map((r) => [r.runDir, r]))
  assert.equal(byDir.get(NESTED)?.baseline?.manifest?.method, 'optimization')
  assert.equal(byDir.get(RUN)?.baseline?.manifest?.method, 'geometric')
  assert.deepEqual(result.unplayable, [])
})

// ---------------------------------------------------------------------------
// 12: the three real loading paths discover the same baselines and read no CSV
// ---------------------------------------------------------------------------
const FAILED = '2026-09/30/13-00-00-baseline'
const TREE: Record<string, string> = {
  [`${RUN}/${MANIFEST}`]: standalone({
    seeds: [{ seed: 1, status: 'complete', summary: 'seed-1/summary.json' }],
  }),
  [`${RUN}/effective-inputs/baseline-plan.json`]: '{}',
  [`${RUN}/seed-1/links.csv`]: 'time,src\n',
  [`${RUN}/seed-1/positions.csv`]: 'time,node\n',
  [`${RUN}/planner.log`]: 'log',
  [`${FAILED}/${MANIFEST}`]: standalone({ status: 'failed', error: 'no route' }),
}

function spyCatalog(catalog: ResultCatalog, reads: string[]): ResultCatalog {
  return {
    ...catalog,
    getFile: (path) => {
      reads.push(path)
      return catalog.getFile(path)
    },
  }
}

function assertSameBaselines(runs: BaselineRun[], source: string) {
  assert.deepEqual(
    runs.map((r) => [r.runDir, r.manifest?.status, r.manifestError]),
    [
      [RUN, 'complete', null],
      [FAILED, 'failed', null],
    ],
    source
  )
  assert.equal(runs[0].planPath, `${RUN}/effective-inputs/baseline-plan.json`, source)
}

const manifestReadsOnly = (reads: string[], source: string) => {
  assert.ok(reads.length > 0, source)
  for (const path of reads) assert.ok(path.endsWith(`/${MANIFEST}`), `${source}: ${path}`)
}

test('12a: classic picker (catalogFromFileList)', async () => {
  const textReads: string[] = []
  const files = Object.entries(TREE).map(([path, body]) => {
    const file = new File([body], path.split('/').pop()!)
    Object.defineProperty(file, 'webkitRelativePath', { value: `outputs/${path}` })
    const text = file.text.bind(file)
    Object.defineProperty(file, 'text', {
      value: () => {
        textReads.push(path)
        return text()
      },
    })
    return file
  })
  const catalog = catalogFromFileList(files)
  assert.equal(catalog.has(`${RUN}/planner.log`), false)
  const reads: string[] = []
  const baselines = await discoverBaselineRuns(spyCatalog(catalog, reads))
  assertSameBaselines(baselines, 'file list')
  manifestReadsOnly(reads, 'file list')
  manifestReadsOnly(textReads, 'file list text()')

  // The picker's run loader uses the same catalog-relative coordinates
  const runs = parseRunsFromFileList(files)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].runDir, RUN)
  const result = attachBaselineMeta(runs, baselines)
  assert.equal(result.runs[0].baseline?.seedRecord?.seed, 1)
  assert.deepEqual(
    result.unplayable.map((b) => b.runDir),
    [FAILED]
  )
})

test('12b: File System Access folder (catalogFromDirectoryHandle)', async () => {
  const handleReads: string[] = []
  type Node = { [name: string]: Node | string }
  const tree: Node = {}
  for (const [path, body] of Object.entries(TREE)) {
    const parts = path.split('/')
    let node = tree
    for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Node
    node[parts[parts.length - 1]] = body
  }
  const toHandle = (name: string, node: Node, prefix: string): FileSystemDirectoryHandle =>
    ({
      kind: 'directory',
      name,
      async *[Symbol.asyncIterator]() {
        for (const [child, value] of Object.entries(node)) {
          const path = prefix ? `${prefix}/${child}` : child
          if (typeof value === 'string')
            yield [
              child,
              {
                kind: 'file',
                name: child,
                getFile: async () => {
                  handleReads.push(path)
                  return new File([value], child)
                },
              } as FileSystemFileHandle,
            ]
          else yield [child, toHandle(child, value, path)]
        }
      },
    }) as FileSystemDirectoryHandle
  const catalog = await catalogFromDirectoryHandle(toHandle('outputs', tree, ''))
  assert.equal(handleReads.length, 0)
  const baselines = await discoverBaselineRuns(catalog)
  assertSameBaselines(baselines, 'directory handle')
  manifestReadsOnly(handleReads, 'directory handle')
})

test('12c: dev server (catalogFromDevServer)', async (t) => {
  const calls: string[] = []
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  const listed = Object.keys(TREE).filter((p) => !p.endsWith('.log'))
  globalThis.fetch = (async (input: string) => {
    calls.push(input)
    if (input === '/api/outputs') return Response.json(listed)
    const rel = decodeURIComponent(input.replace(/^\/outputs\//, ''))
    const body = TREE[rel]
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body)
  }) as typeof fetch

  const catalog = await catalogFromDevServer()
  assert.ok(catalog)
  const baselines = await discoverBaselineRuns(catalog)
  assertSameBaselines(baselines, 'dev server')
  assert.equal(calls[0], '/api/outputs')
  manifestReadsOnly(calls.slice(1), 'dev server')
  assert.ok(!calls.some((c) => c.endsWith('.csv')))
})

// ---------------------------------------------------------------------------
// Non-playable navigation (unit level; ScenarioRow rendering is a manual check)
// ---------------------------------------------------------------------------
test('grouping: an unplayable baseline is its own scenario and date group', async () => {
  const baselines = await discovered({
    [`2026-09/29/09-00-00-baseline/${MANIFEST}`]: standalone({ status: 'failed' }),
  })
  const legacy = assembleRuns(seedPairs('2026-09/13/13-27-29', 1))
  const { runs, unplayable } = attachBaselineMeta(legacy, baselines)

  const batches = groupRuns(runs, unplayable)
  assert.deepEqual(
    batches.map(([batch, rs]) => [batch, rs.length]),
    [
      ['2026-09/29', 0],
      ['2026-09/13', 1],
    ]
  )
  assert.deepEqual(unplayableForBatch(unplayable, '2026-09/13'), [])

  const scenarios = groupScenarios([], unplayableForBatch(unplayable, '2026-09/29'))
  assert.equal(scenarios.length, 1)
  assert.deepEqual(scenarios[0].runs, [])
  assert.equal(scenarios[0].key, '2026-09/29/09-00-00-baseline')
  assert.equal(scenarios[0].name, '09-00-00-baseline')
  assert.equal(scenarios[0].batch, '2026-09/29')
  assert.equal(scenarios[0].buildings, false)
  assert.equal(scenarios[0].baseline, unplayable[0])

  // Merged newest first with the playable scenarios of the same list
  const all = groupScenarios(runs, unplayable)
  assert.deepEqual(
    all.map((s) => s.name),
    ['09-00-00-baseline', '13-27-29']
  )
})

test('grouping: a playable baseline stays one scenario; nested copies stay apart', async () => {
  const baselines = await discovered({
    [`${RUN}/${MANIFEST}`]: standalone({ seeds: seeds123 }),
    [`${NESTED}/${MANIFEST}`]: standalone({ seeds: seeds123 }),
  })
  const { runs, unplayable } = attachBaselineMeta(
    assembleRuns([...seedPairs(RUN, 1), ...seedPairs(RUN, 2), ...seedPairs(NESTED, 1)]),
    baselines
  )
  assert.deepEqual(unplayable, [])
  // Even if a caller passes the baseline again, it is not emitted twice
  const scenarios = groupScenarios(runs, baselines)
  assert.equal(scenarios.length, 2)
  const top = scenarios.find((s) => s.runDir === RUN)!
  assert.equal(top.key, `${RUN}/`)
  assert.deepEqual(
    top.runs.map((r) => r.seed),
    ['seed-1', 'seed-2']
  )
  assert.equal(top.baseline, undefined)
  assert.ok(top.runs.every((r) => r.baseline?.runDir === RUN))
  assert.equal(scenarios.find((s) => s.runDir === NESTED)?.runs.length, 1)
})

test('grouping: legacy scenarios are unchanged', () => {
  const runs = assembleRuns([
    ...seedPairs('2026-09/13/13-27-29', 2),
    ...seedPairs('2026-09/13/13-27-29', 1),
    pair('2026-09/13/13-27-29/point-001/seed-1/links.csv'),
    pair('2026-09/13/13-27-29/point-001/seed-1/positions.csv'),
  ])
  const scenarios = groupScenarios(runs)
  assert.deepEqual(
    scenarios.map((s) => [s.key, s.point, s.runs.map((r) => r.seed)]),
    [
      ['2026-09/13/13-27-29/', undefined, ['seed-1', 'seed-2']],
      ['2026-09/13/13-27-29/point-001', 'point-001', ['seed-1']],
    ]
  )
  assert.deepEqual(
    groupRuns(runs).map(([b, rs]) => [b, rs.length]),
    [['2026-09/13', 3]]
  )
})
