import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkState,
  filterCatalog,
  folderTree,
  isFolderIncluded,
  isIncluded,
  toggleFolder,
} from '../src/lib/folderFilter.ts'
import { catalogFromFiles } from '../src/lib/resultCatalog.ts'

const PATHS = [
  '2026-05/19/13-59-28-validation/seed-1/links.csv',
  'custom/10-09/local-fast/main/eval_manifest.json',
  'custom/10-09/local-fast-benchmark/eval_manifest.json',
  'custom/10-09-2/main/campaign_resolved.json',
  'custom/10-09-3/main/campaign_resolved.json',
  'summary.json',
]

const tree = folderTree(PATHS)
const find = (path: string) => {
  const walk = (nodes: typeof tree): (typeof tree)[number] | undefined =>
    nodes.map((n) => (n.path === path ? n : walk(n.children))).find(Boolean)
  const node = walk(tree)
  assert.ok(node, path)
  return node
}

test('folderTree lists folders to three levels and skips lone subfolders', () => {
  assert.deepEqual(
    tree.map((n) => n.path),
    ['2026-05', 'custom']
  )
  // 2026-05 holds only 19, so choosing it is choosing 19
  assert.deepEqual(find('2026-05').children, [])
  assert.deepEqual(
    find('custom').children.map((n) => n.name),
    ['10-09', '10-09-2', '10-09-3']
  )
  assert.deepEqual(
    find('custom/10-09').children.map((n) => n.name),
    ['local-fast', 'local-fast-benchmark']
  )
  assert.deepEqual(find('custom/10-09-2').children, [])
})

test('folderTree names a run of lone subfolders as one row and lists what it leads to', () => {
  const merged = folderTree([
    'custom/10-16/main/rural/eval_manifest.json',
    'custom/10-16/models/rural/credit/experiment_plan.json',
    'custom/10-16/models/rural/deeper/experiment_plan.json',
  ])
  assert.deepEqual(
    merged.map((n) => [n.path, n.name]),
    [['custom', 'custom/10-16']]
  )
  const [custom] = merged
  assert.deepEqual(
    custom.children.map((n) => n.path),
    ['custom/10-16/main', 'custom/10-16/models']
  )
  // models holds only rural, which holds two folders: one row for the pair
  const models = custom.children[1]
  assert.equal(models.name, 'models/rural')
  assert.deepEqual(
    models.children.map((n) => n.path),
    ['custom/10-16/models/rural/credit', 'custom/10-16/models/rural/deeper']
  )
  // Turning off one deep folder of a chosen card keeps everything else
  assert.deepEqual(toggleFolder(merged, ['custom'], 'custom/10-16/models/rural/credit').sort(), [
    'custom/10-16/main',
    'custom/10-16/models/rural/deeper',
  ])
})

test('isIncluded keeps root files and matches whole path segments', () => {
  assert.equal(isIncluded('summary.json', []), true)
  assert.equal(isIncluded('custom/10-09/x.json', ['custom/10-09']), true)
  assert.equal(isIncluded('custom/10-09-2/x.json', ['custom/10-09']), false)
  assert.equal(isFolderIncluded('custom', []), false)
  assert.equal(isFolderIncluded('custom/10-09/local-fast', ['custom']), true)
})

test('checkState reports parents of a partial choice as mixed', () => {
  const included = ['custom/10-09/local-fast']
  assert.equal(checkState(find('custom'), included), 'mixed')
  assert.equal(checkState(find('custom/10-09'), included), 'mixed')
  assert.equal(checkState(find('custom/10-09/local-fast'), included), 'on')
  assert.equal(checkState(find('2026-05'), included), 'off')
})

test('toggleFolder turns a parent on over a partial choice', () => {
  assert.deepEqual(toggleFolder(tree, ['custom/10-09-2'], 'custom'), ['custom'])
})

test('toggleFolder turning off a child of a chosen parent keeps its siblings', () => {
  const next = toggleFolder(tree, ['custom', '2026-05'], 'custom/10-09/local-fast')
  assert.deepEqual(next.sort(), [
    '2026-05',
    'custom/10-09-2',
    'custom/10-09-3',
    'custom/10-09/local-fast-benchmark',
  ])
})

test('toggleFolder collapses a folder whose subfolders are all chosen', () => {
  let included = toggleFolder(tree, [], 'custom/10-09-2')
  included = toggleFolder(tree, included, 'custom/10-09-3')
  included = toggleFolder(tree, included, 'custom/10-09')
  assert.deepEqual(included, ['custom'])
  assert.deepEqual(toggleFolder(tree, included, 'custom'), [])
})

test('filterCatalog narrows the listing but still reads hidden files', async () => {
  const catalog = catalogFromFiles(
    'outputs',
    PATHS.map((path) => ({ path, file: new File(['{}'], path.split('/').pop()!) }))
  )
  const shown = filterCatalog(catalog, ['custom/10-09-2'])
  assert.deepEqual(shown.paths(), ['custom/10-09-2/main/campaign_resolved.json', 'summary.json'])
  assert.equal(shown.has('custom/10-09-3/main/campaign_resolved.json'), true)
  assert.ok(await shown.getFile('custom/10-09-3/main/campaign_resolved.json'))
})
