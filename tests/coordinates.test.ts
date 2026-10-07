import test from 'node:test'
import assert from 'node:assert/strict'
import { lerpNodeToThree } from '../src/components/canvas/utils/coordinates.ts'

test('lerpNodeToThree glides part-way to the next frame, Y-up', () => {
  const a = { x: 0, y: 10, z: 2 }
  const b = { x: 100, y: 30, z: 6 }
  assert.deepEqual(lerpNodeToThree(a, b, 0), [0, 2, 10])
  assert.deepEqual(lerpNodeToThree(a, b, 0.5), [50, 4, 20])
  assert.deepEqual(lerpNodeToThree(a, b, 1), [100, 6, 30])
})

test('lerpNodeToThree holds still without a next frame and clamps past 1', () => {
  const a = { x: 5, y: 5, z: 5 }
  assert.deepEqual(lerpNodeToThree(a, undefined, 0.7), [5, 5, 5])
  assert.deepEqual(lerpNodeToThree(a, { x: 15, y: 5, z: 5 }, 3), [15, 5, 5])
})
