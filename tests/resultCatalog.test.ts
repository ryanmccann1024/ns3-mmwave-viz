import test from 'node:test'
import assert from 'node:assert/strict'
import {
  catalogFromDevServer,
  catalogFromDirectoryHandle,
  catalogFromFileList,
  isCatalogFile,
  isReaderFileName,
  isTrainRolloutDirectory,
  normalizeRelPath,
  readJson,
  subCatalog,
} from '../src/lib/resultCatalog.ts'

function picked(relPath: string, body: string): File {
  const file = new File([body], relPath.split('/').pop()!)
  Object.defineProperty(file, 'webkitRelativePath', { value: relPath })
  return file
}

test('normalizeRelPath rejects unsafe paths and tidies safe ones', () => {
  for (const bad of ['', '/abs/x', '../x', 'a/../b', 'a\\b', 'a\0b', 'C:/x', './'])
    assert.equal(normalizeRelPath(bad), null, JSON.stringify(bad))
  assert.equal(normalizeRelPath('./a//b/'), 'a/b')
})

test('file-list catalog strips the picked folder and keeps rows distinct', async () => {
  const tail = 'train-seed-101/model/episode-0000/seed-301/links.csv'
  const catalog = catalogFromFileList([
    picked(`bypass-matrix/eval/row-a/${tail}`, 'A'),
    picked(`bypass-matrix/eval/row-b/${tail}`, 'B'),
    picked('bypass-matrix/experiment_plan.json', '{"v":1}'),
    picked('bypass-matrix/tuning-venv/lib/irrelevant.py', 'ignored'),
    picked('bypass-matrix/train/row-a/train-seed-101/episode-0000/seed-101/links.csv', 'ignored'),
  ])
  assert.equal(catalog.name, 'bypass-matrix')
  assert.deepEqual(catalog.paths(), [
    `eval/row-a/${tail}`,
    `eval/row-b/${tail}`,
    'experiment_plan.json',
  ])
  assert.equal(await (await catalog.getFile(`eval/row-a/${tail}`))!.text(), 'A')
  assert.equal(await (await catalog.getFile(`eval/row-b/${tail}`))!.text(), 'B')
  assert.deepEqual(await readJson(catalog, 'experiment_plan.json'), { v: 1 })
  assert.equal(await readJson(catalog, 'missing.json'), null)
  assert.equal(catalog.truncated, false)

  const row = subCatalog(catalog, 'eval/row-b')
  assert.deepEqual(row.paths(), [tail])
  assert.equal(await (await row.getFile(tail))!.text(), 'B')
  assert.equal(await row.getFile('../row-a/' + tail), null)
})

test('folder catalog counts only reader files and skips training rollouts', async () => {
  const file = (name: string) =>
    ({ kind: 'file', name, getFile: async () => new File(['x'], name) }) as FileSystemFileHandle
  const dir = (
    name: string,
    entries: [string, FileSystemFileHandle | FileSystemDirectoryHandle][]
  ) =>
    ({
      kind: 'directory',
      name,
      async *[Symbol.asyncIterator]() {
        for (const entry of entries) yield entry
      },
    }) as FileSystemDirectoryHandle
  const rollout = dir('episode-0000', [['links.csv', file('links.csv')]])
  const trainSeed = dir('train-seed-101', [['episode-0000', rollout]])
  const row = dir('row-a', [['train-seed-101', trainSeed]])
  const train = dir('train', [['row-a', row]])
  const noise = dir(
    'tuning-venv',
    Array.from(
      { length: 100 },
      (_, i) => [`pkg-${i}.py`, file(`pkg-${i}.py`)] as [string, FileSystemFileHandle]
    )
  )
  const root = dir('outputs', [
    ['tuning-venv', noise],
    ['train', train],
    ['experiment_plan.json', file('experiment_plan.json')],
  ])
  const catalog = await catalogFromDirectoryHandle(root)
  assert.deepEqual(catalog.paths(), ['experiment_plan.json'])
  assert.equal(catalog.truncated, false)
  assert.equal(isReaderFileName('package.json'), false)
  assert.equal(
    isTrainRolloutDirectory('eval/train/train-seed-101/model/episode-0000'.split('/')),
    false
  )
  assert.equal(
    isTrainRolloutDirectory('train/row-a/train-seed-101/eval/episode-0000'.split('/')),
    true
  )
})

test('dev catalog fetches bytes only in getFile', async (t) => {
  const csv = 'exp/eval/row a/train-seed-101/model/episode-0000/seed-301/links.csv'
  const calls: string[] = []
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  globalThis.fetch = (async (input: string) => {
    calls.push(input)
    if (input === '/api/outputs') return Response.json([csv, '../escape.csv'])
    return new Response('time,src\n')
  }) as typeof fetch

  const catalog = await catalogFromDevServer()
  assert.ok(catalog)
  assert.deepEqual(catalog.paths(), [csv])
  assert.ok(catalog.has(csv))
  assert.deepEqual(calls, ['/api/outputs'])

  const file = await catalog.getFile(csv)
  assert.equal(await file!.text(), 'time,src\n')
  assert.deepEqual(calls, [
    '/api/outputs',
    '/outputs/exp/eval/row%20a/train-seed-101/model/episode-0000/seed-301/links.csv',
  ])
})

test('large folder keeps experiments after 50,000 replay files without reading bytes', async () => {
  let reads = 0
  const file = (name: string) =>
    ({
      kind: 'file',
      name,
      getFile: async () => {
        reads += 1
        return new File(['{}'], name)
      },
    }) as FileSystemFileHandle
  const leaf = (name: string, filename: string) =>
    ({
      kind: 'directory',
      name,
      async *[Symbol.asyncIterator]() {
        yield [filename, file(filename)]
      },
    }) as FileSystemDirectoryHandle
  const root = {
    kind: 'directory',
    name: 'outputs',
    async *[Symbol.asyncIterator]() {
      // The iterative walker visits this experiment after all replay directories.
      yield ['last-experiment', leaf('last-experiment', 'experiment_plan.json')]
      for (let i = 0; i < 50_001; i++) {
        const name = `replay-${i}`
        yield [name, leaf(name, 'positions.csv')]
      }
    },
  } as FileSystemDirectoryHandle
  const catalog = await catalogFromDirectoryHandle(root)
  assert.equal(catalog.paths().length, 50_002)
  assert.equal(catalog.truncated, false)
  assert.equal(catalog.has('last-experiment/experiment_plan.json'), true)
  assert.equal(reads, 0)
  assert.ok(await catalog.getFile('last-experiment/experiment_plan.json'))
  assert.equal(reads, 1)
})

test('baseline manifests and plans are catalog files; logs are not', () => {
  assert.equal(isCatalogFile(['baseline_manifest.json']), true)
  assert.equal(isCatalogFile(['custom', '10-16-2', 'campaign_status.json']), true)
  assert.equal(isCatalogFile(['effective-inputs', 'baseline-plan.json']), true)
  assert.equal(
    isCatalogFile('2026-09/30/12-00-00-baseline/baseline_manifest.json'.split('/')),
    true
  )
  assert.equal(isCatalogFile(['planner.log']), false)
  assert.equal(isCatalogFile(['sim.log']), false)
  assert.equal(isCatalogFile(['source-inputs', 'run.ini']), false)
  assert.equal(isCatalogFile(['custom', 'run', 'inputs', 'run.ini']), true)
  // summary.json behavior is unchanged
  assert.equal(isCatalogFile(['seed-1', 'summary.json']), true)
  for (const bad of ['../x', '/abs', 'a\\b']) assert.equal(normalizeRelPath(bad), null, bad)
})
