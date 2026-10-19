import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HEAT_EMPTY,
  HEAT_NEUTRAL,
  divergingColor,
  heatColor,
  parseHex,
  readableInk,
  sequentialColor,
} from '../src/lib/colorScale.ts'

const lightness = (hex: string) => {
  const [r, g, b] = parseHex(hex)!
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

test('divergingColor hits every anchor exactly', () => {
  assert.equal(divergingColor(-1), '#b42f2e')
  assert.equal(divergingColor(-0.5), '#ec9c98')
  assert.equal(divergingColor(0), HEAT_NEUTRAL)
  assert.equal(divergingColor(0.5), '#9ec5f4')
  assert.equal(divergingColor(1), '#1c5cab')
})

test('divergingColor clamps and treats NaN as neutral', () => {
  assert.equal(divergingColor(-7), '#b42f2e')
  assert.equal(divergingColor(Infinity), '#1c5cab')
  assert.equal(divergingColor(NaN), HEAT_NEUTRAL)
})

test('divergingColor darkens monotonically away from 0 on both sides', () => {
  let prev = lightness(divergingColor(0))
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const l = lightness(divergingColor(t))
    assert.ok(l <= prev + 1e-9, `blue side at ${t}`)
    prev = l
  }
  prev = lightness(divergingColor(0))
  for (let t = -0.05; t >= -1.0001; t -= 0.05) {
    const l = lightness(divergingColor(t))
    assert.ok(l <= prev + 1e-9, `red side at ${t}`)
    prev = l
  }
})

test('divergingColor midpoints are valid hex between anchors', () => {
  const c = divergingColor(0.25)
  assert.match(c, /^#[0-9a-f]{6}$/)
  assert.notEqual(c, HEAT_NEUTRAL)
  assert.notEqual(c, '#9ec5f4')
})

test('sequentialColor anchors, clamping and NaN', () => {
  assert.equal(sequentialColor(0), '#eef4fc')
  assert.equal(sequentialColor(0.5), '#6da7ec')
  assert.equal(sequentialColor(1), '#104281')
  assert.equal(sequentialColor(-3), '#eef4fc')
  assert.equal(sequentialColor(3), '#104281')
  assert.equal(sequentialColor(NaN), '#eef4fc')
  assert.ok(lightness(sequentialColor(0.25)) > lightness(sequentialColor(0.75)))
})

test('heatColor: NaN is empty, diverging scales by the larger end', () => {
  const div = { lo: -2, hi: 4, diverging: true }
  assert.equal(heatColor(NaN, div), HEAT_EMPTY)
  assert.equal(heatColor(4, div), '#1c5cab')
  assert.equal(heatColor(-2, div), '#ec9c98')
  assert.equal(heatColor(0, div), HEAT_NEUTRAL)
  assert.equal(heatColor(-100, div), '#b42f2e')
  assert.equal(heatColor(3, { lo: 0, hi: 0, diverging: true }), HEAT_NEUTRAL)
})

test('heatColor: sequential runs lo to hi and handles a flat domain', () => {
  const seq = { lo: 10, hi: 20, diverging: false }
  assert.equal(heatColor(10, seq), '#eef4fc')
  assert.equal(heatColor(15, seq), '#6da7ec')
  assert.equal(heatColor(20, seq), '#104281')
  assert.equal(heatColor(99, seq), '#104281')
  assert.equal(heatColor(1, { lo: 1, hi: 1, diverging: false }), '#104281')
  assert.equal(heatColor(0, { lo: 0, hi: 0, diverging: false }), '#eef4fc')
})

test('readableInk picks the higher-contrast text colour', () => {
  assert.equal(readableInk('#ffffff'), '#0a1324')
  assert.equal(readableInk(HEAT_NEUTRAL), '#0a1324')
  assert.equal(readableInk('#eef4fc'), '#0a1324')
  assert.equal(readableInk('#000'), '#ffffff')
  assert.equal(readableInk('#104281'), '#ffffff')
  assert.equal(readableInk('#b42f2e'), '#ffffff')
  assert.equal(readableInk('#1c5cab'), '#ffffff')
  assert.equal(readableInk('not a colour'), '#0a1324')
})
