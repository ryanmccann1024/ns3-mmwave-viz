import test from 'node:test'
import assert from 'node:assert/strict'
import { frameIndexAtTime, frameIndexForDecisionWindow } from '../src/lib/frameSeek.ts'

const TOL = 1e-6

/** 0, 0.1, ..., ~1.0 built by accumulation so the values carry float noise. */
function accumulatedFrames(): number[] {
  const out: number[] = []
  let t = 0
  for (let i = 0; i <= 10; i++) {
    out.push(t)
    t += 0.1
  }
  return out
}

test('frameIndexForDecisionWindow picks the latest frame inside (start, end]', () => {
  const frames = accumulatedFrames()
  assert.notEqual(frames[10], 1)
  assert.equal(frameIndexForDecisionWindow([], 0, 1, TOL), null)
  assert.equal(frameIndexForDecisionWindow(frames, 0, 1, TOL), 10)
  assert.equal(frameIndexForDecisionWindow(frames, 0.5, 1, TOL), 10)
  assert.equal(frameIndexForDecisionWindow(frames, 0.45, 0.65, TOL), 6)
})

test('frameIndexForDecisionWindow never substitutes a frame outside the window', () => {
  const frames = accumulatedFrames()
  // a frame exactly at the exclusive start is not inside
  assert.equal(frameIndexForDecisionWindow(frames, 1, 2, TOL), null)
  assert.equal(frameIndexForDecisionWindow([0, 1, 2], 1, 1.5, TOL), null)
  // sampled playback: no frame inside (1.2, 1.8]
  assert.equal(frameIndexForDecisionWindow([0, 1, 2, 3], 1.2, 1.8, TOL), null)
})

test('frameIndexForDecisionWindow rejects malformed input', () => {
  assert.equal(frameIndexForDecisionWindow([0, 0.2, 0.1, 0.3], 0, 1, TOL), null)
  assert.equal(frameIndexForDecisionWindow([0, NaN, 1], 0, 1, TOL), null)
  assert.equal(frameIndexForDecisionWindow([0, 0.5, Infinity], 0, 1, TOL), null)
  assert.equal(frameIndexForDecisionWindow([0, 0.5, 1], 0, 1, -1e-6), null)
  assert.equal(frameIndexForDecisionWindow([0, 0.5, 1], 1, 1, TOL), null)
  assert.equal(frameIndexForDecisionWindow([0, 0.5, 1], 1, 0.5, TOL), null)
})

test('frameIndexForDecisionWindow tolerance accepts a frame just past the end', () => {
  const frames = [0, 0.5, 1 + 1e-9]
  assert.equal(frameIndexForDecisionWindow(frames, 0.5, 1, TOL), 2)
  assert.equal(frameIndexForDecisionWindow(frames, 0.5, 1, 0), null)
})

test('frameIndexAtTime finds the frame recorded at an instant', () => {
  assert.equal(frameIndexAtTime([0, 0.5, 1], 0, TOL), 0)
  assert.equal(frameIndexAtTime([0.5, 1], 0, TOL), null)
  assert.equal(frameIndexAtTime([0, 0.5000005, 1], 0.5, TOL), 1)
  assert.equal(frameIndexAtTime([0, 0.4999995, 1], 0.5, TOL), 1)
  assert.equal(frameIndexAtTime([0, 0.502, 1], 0.5, TOL), null)
  assert.equal(frameIndexAtTime([], 0, TOL), null)
})
