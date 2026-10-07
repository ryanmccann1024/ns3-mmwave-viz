import test from 'node:test'
import assert from 'node:assert/strict'
import { deliveryRatio, sinrSeries } from '../src/lib/runPreview.ts'

const LINKS = `# scenario=demo
time_s,node_a,node_b,dist_m,sinr_db
0.0,0,1,8,20
0.0,0,2,9,10
0.1,0,1,8,12
0.1,0,2,9,8`

test('sinrSeries averages links per tick and over the run', () => {
  assert.deepEqual(sinrSeries(LINKS), {
    series: [
      { t: 0, v: 15 },
      { t: 0.1, v: 10 },
    ],
    mean: 12.5,
  })
  assert.deepEqual(sinrSeries(LINKS, 1), { series: [{ t: 0, v: 12.5 }], mean: 12.5 })
})

test('sinrSeries tolerates files without SINR', () => {
  assert.deepEqual(sinrSeries('time_s,x\n0,1'), { series: [], mean: null })
  assert.deepEqual(sinrSeries(''), { series: [], mean: null })
})

test('deliveryRatio sums delivered over demanded traffic', () => {
  const flows = `time_s,src,dst,demand_mbps,delivered_mbps
0.0,1,0,100,100
0.1,1,0,100,50`
  assert.equal(deliveryRatio(flows), 0.75)
  assert.equal(deliveryRatio('time_s,src\n0,1'), null)
  assert.equal(deliveryRatio('time_s,demand_mbps,delivered_mbps\n0,0,0'), null)
})
