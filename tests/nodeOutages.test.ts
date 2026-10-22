import test from 'node:test'
import assert from 'node:assert/strict'
import { nodeOutages, outageAt } from '../src/lib/nodeOutages.ts'
import type { SimFrame } from '../src/types.ts'

/** One frame per entry of `states`, each a list of [nodeId, active] */
function frames(states: [number, boolean][][], step = 5): SimFrame[] {
  return states.map((nodes, i) => ({
    time: i * step,
    nodes: nodes.map(([id, active]) => ({ id, x: 0, y: 0, z: 0, nodeType: 'ground', active })),
    links: [],
    flows: [],
    routes: [],
    mcs: [],
    rxPower: [],
  }))
}

test('a node that goes down mid-run is one open outage at its first down frame', () => {
  const f = frames([
    [
      [0, true],
      [1, true],
    ],
    [
      [0, true],
      [1, true],
    ],
    [
      [0, true],
      [1, false],
    ],
    [
      [0, true],
      [1, false],
    ],
  ])
  assert.deepEqual(nodeOutages(f), [{ nodeId: 1, downAt: 10, frameIndex: 2, upAt: null }])
})

test('a node that comes back closes its outage, and a second failure opens another', () => {
  const f = frames([[[0, true]], [[0, false]], [[0, true]], [[0, false]]])
  assert.deepEqual(nodeOutages(f), [
    { nodeId: 0, downAt: 5, frameIndex: 1, upAt: 10 },
    { nodeId: 0, downAt: 15, frameIndex: 3, upAt: null },
  ])
})

test('a node down from the first frame never failed during the run', () => {
  const f = frames([[[0, false]], [[0, false]], [[0, true]]])
  assert.deepEqual(nodeOutages(f), [])
})

test('outageAt covers the outage from its start up to, not including, recovery', () => {
  const outages = nodeOutages(frames([[[0, true]], [[0, false]], [[0, true]]]))
  assert.equal(outageAt(outages, 0, 4.9), undefined)
  assert.equal(outageAt(outages, 0, 5)?.downAt, 5)
  assert.equal(outageAt(outages, 0, 9.9)?.downAt, 5)
  assert.equal(outageAt(outages, 0, 10), undefined)
  assert.equal(outageAt(outages, 1, 5), undefined)
})
