import test from 'node:test'
import assert from 'node:assert/strict'
import { controlledNodeIndices, decimate, extractTrails } from '../src/lib/trajectory.ts'

test('slot ids map to their index in node_ids, and unknown ids are reported', () => {
  const mapping = controlledNodeIndices({
    node_ids: ['node-a', 'node-b', 'node-c'],
    slot_node_ids: ['node-c', 'node-b', 'ghost'],
  })
  assert.deepEqual(mapping.nodes, [
    { slot: 0, nodeId: 'node-c', index: 2 },
    { slot: 1, nodeId: 'node-b', index: 1 },
  ])
  assert.deepEqual(mapping.missing, ['ghost'])
})

test('trails follow positions.csv for the requested node only', () => {
  const csv = [
    '# scenario=demo',
    '# tickMs=100',
    'time_s,node_id,x,y,z,node_type,active',
    '0.000000,0,0.000000,0.000000,10.000000,peer,1',
    '0.000000,1,200.000000,0.000000,10.000000,peer,1',
    '0.100000,0,0.000000,0.000000,10.000000,peer,1',
    '0.100000,1,198.000000,-1.500000,10.000000,peer,1',
    '',
  ].join('\n')
  const { trails, error } = extractTrails(csv, [1])
  assert.equal(error, null)
  assert.deepEqual([...trails.keys()], [1])
  assert.deepEqual(trails.get(1), [
    { time: 0, x: 200, y: 0, z: 10 },
    { time: 0.1, x: 198, y: -1.5, z: 10 },
  ])
  assert.match(extractTrails('a,b\n1,2\n', [0]).error ?? '', /header lacks/)
})

test('decimation keeps endpoints and returns short input unchanged', () => {
  const points = Array.from({ length: 1001 }, (_, i) => i)
  const out = decimate(points, 50)
  assert.ok(out.length <= 50)
  assert.equal(out[0], 0)
  assert.equal(out[out.length - 1], 1000)
  assert.deepEqual(decimate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 5), [1, 4, 7, 10, 11])
  const short = [1, 2, 3]
  assert.equal(decimate(short, 50), short)
})
