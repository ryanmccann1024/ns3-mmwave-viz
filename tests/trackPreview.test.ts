import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTracks } from '../src/lib/trackPreview.ts'

const CSV = `# scenario=demo
time_s,node_id,x,y,z,node_type,active
0.0,0,0,0,12,peer,1
0.0,1,-8,-3,12,peer,1
0.1,0,0,0,12,peer,1
0.1,1,-9,-4,10,peer,1`

test('parseTracks keeps one 3D path per node and drops repeated points', () => {
  assert.deepEqual(parseTracks(CSV), [
    [[0, 0, 12]],
    [
      [-8, -3, 12],
      [-9, -4, 10],
    ],
  ])
})

test('parseTracks thins long paths and keeps both ends', () => {
  const rows = Array.from({ length: 100 }, (_, i) => `${i},0,${i},0,0`).join('\n')
  const [track] = parseTracks(`time_s,node_id,x,y,z\n${rows}`, 10)
  assert.equal(track.length, 10)
  assert.deepEqual(track[0], [0, 0, 0])
  assert.deepEqual(track[9], [99, 0, 0])
})

test('parseTracks returns nothing for files without positions', () => {
  assert.deepEqual(parseTracks('a,b\n1,2'), [])
  assert.deepEqual(parseTracks(''), [])
})
