import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseNpz } from '../src/lib/npz.ts'

const load = (name: string) => {
  const b = readFileSync(new URL(`./fixtures/${name}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}

test('an uncompressed npz (np.savez, as SB3 writes it) reads back its arrays', async () => {
  const npz = await parseNpz(load('evaluations-stored.npz'))
  assert.deepEqual(npz.timesteps, { shape: [2], data: [400, 800] })
  assert.deepEqual(npz.results, { shape: [2, 2], data: [27.5, 28, 29, 29.5] })
  assert.deepEqual(npz.ep_lengths.shape, [2, 2])
})

test('a compressed npz (np.savez_compressed) is inflated', async () => {
  const npz = await parseNpz(load('evaluations-deflate.npz'))
  assert.deepEqual(npz.results.data, [27.5, 28, 29, 29.5])
})

test('a file that is not a zip is rejected', async () => {
  await assert.rejects(parseNpz(new Uint8Array([1, 2, 3]).buffer), /not a zip/)
})
