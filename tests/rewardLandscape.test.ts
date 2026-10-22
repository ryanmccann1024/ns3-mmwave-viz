import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bestMove,
  buildLandscapeView,
  contourLevels,
  fieldDomain,
  isolineSegments,
  landscapeExtent,
  landscapeField,
  landscapeTextureBytes,
  parseRewardLandscape,
  selectSlice,
  sliceFields,
  widenDomain,
} from '../src/lib/rewardLandscape.ts'
import type { RewardLandscape } from '../src/lib/rewardLandscape.ts'
import { HEAT_EMPTY, heatColor, parseHex } from '../src/lib/colorScale.ts'
import { isReaderFileName } from '../src/lib/resultCatalog.ts'

const GRID = { x_min: 0, x_max: 20, nx: 3, y_min: 0, y_max: 10, ny: 2 }

function slice(
  decision: number,
  nodeId: string,
  slot: number,
  extra: Record<string, unknown> = {}
) {
  return {
    decision,
    time_s: decision * 1.0,
    node_id: nodeId,
    slot,
    position: [10, 5, 30],
    values: {
      total: [0, 1, 2, 3, 4, null],
      delivery_ratio: [0, 0.5, 1, 1, 1, null],
    },
    moves: [
      {
        action: 0,
        label: 'W',
        position: [0, 5],
        valid: true,
        total: 1,
        components: { delivery_ratio: 0.9 },
      },
      { action: 1, label: 'E', position: [20, 5], valid: false, total: 9, components: {} },
      {
        action: 2,
        label: 'S',
        position: [10, 0],
        valid: true,
        total: 2,
        components: { delivery_ratio: 0.1 },
      },
    ],
    recorded: { total: 1.5, components: { delivery_ratio: 0.8 } },
    ...extra,
  }
}

function doc(slices: unknown[] = [slice(0, 'R1', 0), slice(10, 'R1', 0), slice(10, 'R2', 1)]) {
  return {
    landscape_version: 1,
    contract: 'mesh_move_2d_v1',
    source: { method: 'channel_query', approximation: 'snapshot', seeds: [101] },
    grid: GRID,
    reward_schema: { components: ['delivery_ratio'], weights: [2] },
    slices,
  }
}

function parsed(d = doc()): RewardLandscape {
  const r = parseRewardLandscape(JSON.stringify(d))
  assert.ok(r.ok, r.ok ? '' : r.message)
  return r.value
}

test('parse reads grid, schema, slices; null cells become NaN', () => {
  const l = parsed()
  assert.deepEqual(l.grid, { xMin: 0, xMax: 20, nx: 3, yMin: 0, yMax: 10, ny: 2 })
  assert.deepEqual(l.components, ['delivery_ratio'])
  assert.deepEqual(l.weights, [2])
  assert.deepEqual(l.source.seeds, [101])
  assert.equal(l.slices.length, 3)
  const t = l.slices[0].values.total
  assert.ok(t instanceof Float32Array)
  assert.equal(t[4], 4)
  assert.ok(Number.isNaN(t[5]))
  assert.deepEqual(l.slices[0].position, [10, 5, 30])
  assert.equal(l.slices[0].moves[1].valid, false)
})

test('parse rejects bad version, grid and array lengths with a message', () => {
  const bad = (d: unknown, re: RegExp) => {
    const r = parseRewardLandscape(JSON.stringify(d))
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.message, re)
  }
  bad({ ...doc(), landscape_version: 2 }, /landscape_version/)
  bad({ ...doc(), grid: { ...GRID, nx: 1 } }, /grid\.nx/)
  bad({ ...doc(), grid: { ...GRID, x_max: 0 } }, /bounds/)
  bad(doc([slice(0, 'R1', 0, { values: { total: [1, 2] } })]), /6/)
  bad(doc([slice(0, 'R1', 0, { values: { delivery_ratio: [0, 0, 0, 0, 0, 0] } })]), /total/)
  bad(doc([slice(0, 'R1', 0, { values: { total: [0, 0, 0, 0, 0, 'x'] } })]), /\[5\]/)
  bad({ ...doc(), slices: [] }, /empty/)
  assert.equal(parseRewardLandscape('{').ok, false)
})

test('selectSlice: node, then latest decision at or before, else nearest', () => {
  const l = parsed()
  const pick = (nodeId: string | null, decision: number | null, timeS: number | null = null) =>
    selectSlice(l, { nodeId, decision, timeS })!
  assert.equal(pick('R1', 7).slice.decision, 0)
  assert.equal(pick('R1', 10).slice.decision, 10)
  assert.equal(pick('R1', 99).slice.decision, 10)
  assert.equal(pick('R2', 3).slice.decision, 10) // nothing before 3: nearest
  assert.equal(pick('R2', 3).slice.nodeId, 'R2')
  assert.equal(pick('R2', 3).nodeFallback, false)
  // an uncontrolled node falls back to the lowest slot and says so
  const other = pick('U9', 10)
  assert.equal(other.slice.nodeId, 'R1')
  assert.equal(other.nodeFallback, true)
  assert.equal(pick(null, null).nodeFallback, false)
  assert.equal(pick(null, null).slice.decision, 0)
  assert.equal(pick(null, null, 12).slice.decision, 10)
})

test('component fields are weighted by the schema weight unless raw', () => {
  const l = parsed()
  const s = l.slices[0]
  assert.deepEqual(sliceFields(l, s), ['total', 'delivery_ratio'])
  assert.equal(landscapeField(l, s, 'total', 'weighted'), s.values.total)
  assert.equal(landscapeField(l, s, 'delivery_ratio', 'weighted')![1], 1)
  assert.equal(landscapeField(l, s, 'delivery_ratio', 'raw')![1], 0.5)
  assert.equal(landscapeField(l, s, 'nope', 'raw'), null)
})

test('bestMove skips invalid moves and follows the field', () => {
  const l = parsed()
  const s = l.slices[0]
  assert.equal(bestMove(l, s, 'total'), 2) // E has 9 but is invalid
  assert.equal(bestMove(l, s, 'delivery_ratio'), 0)
})

test('a penalty component rings the smallest penalty, raw or weighted', () => {
  const d = doc([
    slice(0, 'R1', 0, {
      values: { total: [0, 1, 2, 3, 4, 5], travel_fraction: [1, 1, 1, 1, 1, 1] },
      moves: [
        { action: 0, label: 'W', position: [0, 5], total: 1, components: { travel_fraction: 1 } },
        {
          action: 4,
          label: 'hold',
          position: [10, 5],
          total: 2,
          components: { travel_fraction: 0 },
        },
      ],
    }),
  ])
  d.reward_schema = { components: ['travel_fraction'], weights: [-0.2] }
  const l = parsed(d)
  const s = l.slices[0]
  assert.equal(bestMove(l, s, 'travel_fraction'), 1)
  assert.equal(buildLandscapeView(l, s, 'travel_fraction', 'raw')!.best, 1)
  assert.equal(buildLandscapeView(l, s, 'travel_fraction', 'weighted')!.best, 1)
})

test('the colour domain reaches the move values the discs are painted with', () => {
  assert.deepEqual(widenDomain({ lo: 1, hi: 2, diverging: false }, [null, 3, NaN]), {
    lo: 1,
    hi: 3,
    diverging: false,
  })
  assert.deepEqual(widenDomain({ lo: 1, hi: 2, diverging: false }, [-1]), {
    lo: -1,
    hi: 2,
    diverging: true,
  })
  const l = parsed(doc([slice(0, 'R1', 0, { values: { total: [0, 1, 1, 1, 1, 1] } })]))
  const v = buildLandscapeView(l, l.slices[0], 'total', 'weighted')!
  // the field spans 0..1, the valid moves score 1 and 2 (the invalid 9 is left out)
  assert.deepEqual(v.domain, { lo: 0, hi: 2, diverging: false })
  // contours stay inside the field's own range
  assert.ok(v.levels.every((x) => x > 0 && x < 1))
})

test('fieldDomain ignores NaN and diverges only across zero', () => {
  assert.deepEqual(fieldDomain([1, NaN, 3]), { lo: 1, hi: 3, diverging: false })
  assert.deepEqual(fieldDomain([-1, 2]), { lo: -1, hi: 2, diverging: true })
  assert.equal(fieldDomain([NaN]), null)
})

test('contourLevels are round and strictly inside the domain', () => {
  assert.deepEqual(contourLevels({ lo: 0, hi: 1, diverging: false }, 5), [0.2, 0.4, 0.6, 0.8])
  assert.deepEqual(contourLevels({ lo: -0.95, hi: 0.95, diverging: true }, 4), [-0.5, 0, 0.5])
  assert.deepEqual(contourLevels({ lo: 2, hi: 2, diverging: false }), [])
})

test('isolines of a plane in x are vertical lines at the interpolated x', () => {
  const grid = { xMin: 0, xMax: 20, nx: 3, yMin: 0, yMax: 10, ny: 2 }
  // value = x / 10 at every cell centre
  const values = [0, 1, 2, 0, 1, 2]
  const segs = isolineSegments(values, grid, 0.5)
  assert.deepEqual(segs, [5, 0, 5, 10])
  assert.deepEqual(isolineSegments(values, grid, 1.5), [15, 0, 15, 10])
  // empty corners skip the square
  assert.deepEqual(isolineSegments([0, 1, 2, 0, NaN, 2], grid, 0.5), [])
})

test('saddles are split by the square mean', () => {
  const grid = { xMin: 0, xMax: 1, nx: 2, yMin: 0, yMax: 1, ny: 2 }
  // layout [a bl, b br, d tl, c tr]: a and c high, mean 0.5 >= 0.4 joins them
  const round = (xs: number[]) => xs.map((v) => Math.round(v * 1e6) / 1e6)
  const saddle = round(isolineSegments([1, 0, 0, 1], grid, 0.4))
  // the cut-off corners are b (bottom right) and d (top left)
  assert.deepEqual(saddle, [0.6, 0, 1, 0.4, 0, 0.6, 0.4, 1])
  // mean below the level: a and c are cut off instead
  const low = round(isolineSegments([1, 0, 0, 1], grid, 0.6))
  assert.deepEqual(low, [0, 0.4, 0.4, 0, 1, 0.6, 0.6, 1])
})

test('texture covers half a cell beyond the lattice and stores the top sim row first', () => {
  const grid = { xMin: 0, xMax: 20, nx: 3, yMin: 0, yMax: 10, ny: 2 }
  assert.deepEqual(landscapeExtent(grid), { x0: -5, x1: 25, y0: -5, y1: 15 })
  const values = [0, 1, 2, 3, 4, NaN]
  const domain = { lo: 0, hi: 4, diverging: false }
  const bytes = landscapeTextureBytes(values, grid, domain, 200)
  assert.equal(bytes.length, 3 * 2 * 4)
  // texture row 0 = grid row iy = 1 (values 3, 4, NaN)
  assert.deepEqual([...bytes.slice(0, 3)], parseHex(heatColor(3, domain)))
  assert.equal(bytes[3], 200)
  assert.equal(bytes[2 * 4 + 3], 0) // empty cell transparent
  // ...in the empty colour, so filtering fades the edge to it, not to black
  assert.deepEqual([...bytes.slice(2 * 4, 2 * 4 + 3)], parseHex(HEAT_EMPTY))
  // texture row 1 = grid row 0
  assert.deepEqual([...bytes.slice(12, 15)], parseHex(heatColor(0, domain)))
})

test('the catalog lists reward_landscape.json', () => {
  assert.equal(isReaderFileName('reward_landscape.json'), true)
})
