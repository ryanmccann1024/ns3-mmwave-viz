import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listOutputs, resolveServedPath } from '../vite-plugin-outputs.ts'

function makeTree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'outputs-test-'))
  const root = path.join(base, 'outputs')
  const write = (rel: string, body = 'x') => {
    const abs = path.join(base, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  write('outputs/exp/experiment_plan.json', '{}')
  write('outputs/exp/eval/row-a/train-seed-101/model/episode-0000/seed-301/links.csv')
  write('outputs/exp/eval/row-a/train-seed-101/model/episode-0000/steps.jsonl')
  write('outputs/exp/eval/train/train-seed-101/model/episode-0000/seed-301/links.csv')
  write('outputs/exp/train/row-a/train-seed-101/train_manifest.json', '{}')
  write('outputs/exp/train/row-a/train-seed-101/episode-0003/seed-101/links.csv')
  write('outputs/exp/train/row-a/train-seed-101/model.zip')
  write('outputs-old/x')
  write('secret/links.csv')
  fs.symlinkSync(path.join(base, 'secret', 'links.csv'), path.join(root, 'exp', 'leak.csv'))
  fs.symlinkSync(path.join(base, 'secret'), path.join(root, 'linked'))
  return { base, root }
}

test('serves only regular files contained in the root', (t) => {
  const { base, root } = makeTree()
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))

  const ok = resolveServedPath(root, 'exp/experiment_plan.json?x=1')
  assert.equal(ok.status, 200)
  assert.equal(resolveServedPath(root, '../outputs-old/x').status, 403)
  assert.equal(resolveServedPath(root, '%2e%2e/outputs-old/x').status, 403)
  assert.equal(resolveServedPath(root, '%2Fetc%2Fpasswd').status, 403)
  assert.equal(resolveServedPath(root, 'exp/leak.csv').status, 403)
  assert.equal(resolveServedPath(root, 'linked/links.csv').status, 403)
  assert.equal(resolveServedPath(root, '%E0%A4%A').status, 400)
  assert.equal(resolveServedPath(root, 'exp').status, 404)
  assert.equal(resolveServedPath(root, 'exp/nope.csv').status, 404)
})

test('listing is filtered, skips train rollouts and symlinks, and is capped', (t) => {
  const { base, root } = makeTree()
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))

  const { paths, truncated } = listOutputs(root)
  assert.deepEqual(paths, [
    'exp/eval/row-a/train-seed-101/model/episode-0000/seed-301/links.csv',
    'exp/eval/row-a/train-seed-101/model/episode-0000/steps.jsonl',
    'exp/eval/train/train-seed-101/model/episode-0000/seed-301/links.csv',
    'exp/experiment_plan.json',
    'exp/train/row-a/train-seed-101/train_manifest.json',
  ])
  assert.equal(truncated, false)

  const capped = listOutputs(root, 2)
  assert.equal(capped.paths.length, 2)
  assert.equal(capped.truncated, true)
})
