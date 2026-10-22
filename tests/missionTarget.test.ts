import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceToTarget, investigationTarget, missionOverlay } from '../src/lib/missionTarget.ts'

const MISSION = {
  version: 1,
  kind: 'investigation',
  investigator_id: 'drone-1',
  goal_x: 345.0,
  goal_y: 300.0,
  arrival_radius_m: 15.0,
  coverage_radius_m: 50.0,
  dwell_s: 30.0,
}

test('an investigation mission yields its goal, radii and investigator', () => {
  assert.deepEqual(investigationTarget(MISSION), {
    investigatorId: 'drone-1',
    x: 345,
    y: 300,
    arrivalRadiusM: 15,
    coverageRadiusM: 50,
    dwellS: 30,
  })
})

test('recovery missions carry goal fields but have no target to show', () => {
  assert.equal(investigationTarget({ ...MISSION, kind: 'recovery', investigator_id: '' }), null)
})

test('a missing goal or investigator, or no mission at all, gives no target', () => {
  assert.equal(investigationTarget({ ...MISSION, goal_x: undefined }), null)
  assert.equal(investigationTarget({ ...MISSION, investigator_id: '' }), null)
  assert.equal(investigationTarget(undefined), null)
  assert.equal(investigationTarget('investigation'), null)
})

test('distance to the target is horizontal only', () => {
  const target = investigationTarget(MISSION)!
  assert.equal(distanceToTarget({ x: 345, y: 300 }, target), 0)
  assert.equal(distanceToTarget({ x: 345 - 30, y: 300 + 40 }, target), 50)
})

test('the overlay finds the investigator by its position in the contract node order', () => {
  const contract = {
    node_ids: ['ground-1', 'drone-1', 'vehicle-1'],
    slot_node_ids: ['drone-1'],
    mission: MISSION,
  }
  const csv = new Set([0, 1, 2])
  assert.equal(missionOverlay(contract, csv)?.investigatorCsvId, 1)
  // A roster that does not match the contract still shows the target, without the investigator
  assert.equal(missionOverlay(contract, new Set([0, 1]))?.investigatorCsvId, null)
  assert.equal(
    missionOverlay(contract, csv, ['drone-1', 'ground-1', 'vehicle-1'])?.investigatorCsvId,
    null
  )
  assert.equal(missionOverlay({ ...contract, mission: undefined }, csv), null)
})

test('team investigation retains its team radius and shared goal', () => {
  const target = investigationTarget({
    ...MISSION,
    version: 2,
    team_investigation: true,
    team_radius_m: 50,
  })!
  assert.equal(target.teamInvestigation, true)
  assert.equal(target.teamRadiusM, 50)
  assert.equal(target.x, 345)
})
