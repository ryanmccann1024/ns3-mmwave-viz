import test from 'node:test'
import assert from 'node:assert/strict'
import { missionTimeline } from '../src/lib/missionTimeline.ts'
import type { StepRecord } from '../src/lib/episodeTelemetry.ts'
test('LOS timeline excludes unavailable peers and travel includes only controlled peers', () => {
  const contract = { node_ids: ['a', 'b', 'c'], slot_node_ids: ['a'], action_meanings: [] }
  const points = [0, 1].map((i) => ({
    time_s: i,
    facts: {
      nodes: [
        [i * 2, 0, 0],
        [20 + i * 5, 0, 0],
        [40, 0, 0],
      ],
      node_available: [true, false, true],
      links: [
        [40, 1, 1],
        [5, 1, 0],
        [40, 1, 1],
      ],
      mission_state: { survivor_delivery: 0.5 },
      window: {},
    },
  })) as unknown as StepRecord[]
  const series = missionTimeline(points, contract)
  assert.equal(series[1].los, 0)
  assert.equal(series[1].sinr, 5)
  assert.equal(series[1].travel, 2)
  assert.equal(series[1].service, 50)
})
