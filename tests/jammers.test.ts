import test from 'node:test'
import assert from 'node:assert/strict'
import { jammerActivity, jammerPositionAt, parseJammers } from '../src/lib/jammers.ts'

test('saved fixed jammer is parsed with no invented range', () => {
  const [jammer] = parseJammers(JSON.stringify([{
    id: 'jammer-0', enabled: true, type: 'constant', target_freq: [2211.3],
    tx_power_dbm: 30, duty_cycle: 1, max_range_m: 0,
    position: { x: 500, y: 0, z: 1.5 },
  }]))
  assert.deepEqual(jammerPositionAt(jammer, 50), { x: 500, y: 0, z: 1.5 })
  assert.equal(jammer.maxRangeM, 0)
  assert.equal(jammerActivity(jammer, 50, 2211.3e6), 'on')
  assert.equal(jammerActivity(jammer, 50, 28e9), 'off')
})

test('waypoints, schedule and probabilistic duty are represented without guessing burst state', () => {
  const [jammer] = parseJammers(JSON.stringify([{
    id: 'moving', type: 'random', duty_cycle: 0.7,
    intervals: [{ start: 10, end: 30 }],
    waypoints: [{ t: 0, x: 0, y: 0, z: 1 }, { t: 20, x: 100, y: 0, z: 1 }],
  }]))
  assert.deepEqual(jammerPositionAt(jammer, 10), { x: 50, y: 0, z: 1 })
  assert.equal(jammerActivity(jammer, 5, 2211.3e6), 'off')
  assert.equal(jammerActivity(jammer, 15, 2211.3e6), 'bursty')
  assert.equal(jammerActivity(jammer, 30, 2211.3e6), 'off')
  assert.equal(jammerActivity({ ...jammer, dutyCycle: 1 }, 15, 2211.3e6), 'on')
  assert.deepEqual(parseJammers('{bad json'), [])
})
