import test from 'node:test'
import assert from 'node:assert/strict'
import { parseJammers } from '../src/lib/jammers.ts'
import { parseRadioChannel } from '../src/lib/runIni.ts'
import {
  computeJammerField,
  fieldContext,
  fieldGrid,
  gateMarginM,
  jammerWattAt,
  liveJammers,
  noiseFloorDbm,
  pathLossDb,
  segmentHitsBox,
  volumeGrid,
} from '../src/lib/jammerField.ts'

const URBAN_INI = `[scenario]
name = urban-jamming-small
[channel]
band = sub-6
frequency_ghz = 5.8
scenario = UMa
channel_model = 3gpp
condition_model = static_los
bandwidth_mhz = 5.0
noise_figure_db = 20.0
`

const jammerAt = (extra: Record<string, unknown> = {}) =>
  parseJammers(
    JSON.stringify([
      {
        id: 'j',
        enabled: true,
        tx_power_dbm: 18,
        tx_array_gain_dbi: 3,
        max_range_m: 140,
        target_freq: [5800],
        position: { x: 200, y: 200, z: 1.5 },
        ...extra,
      },
    ])
  )[0]

const overNoise = (watt: number, noiseDbm: number) => 10 * Math.log10(watt) + 30 - noiseDbm

test('run.ini channel settings, with the simulator defaults for absent keys', () => {
  const ch = parseRadioChannel(URBAN_INI)
  assert.deepEqual(ch, {
    scenario: 'UMa',
    channelModel: '3gpp',
    conditionModel: 'static_los',
    bandwidthHz: 5e6,
    noiseFigureDb: 20,
  })
  assert.ok(Math.abs(noiseFloorDbm(ch) - -87.01) < 0.01)
  assert.deepEqual(parseRadioChannel('[channel]\n'), {
    scenario: 'UMi',
    channelModel: '3gpp',
    conditionModel: 'auto',
    bandwidthHz: 400e6,
    noiseFigureDb: 5,
  })
})

test('jammer power matches the simulator run with shadow fading off', () => {
  // Expected values are the jamming implied by links.csv/rx-power.csv of an ns-3 run of
  // urban-jamming-small with ThreeGppPropagationLossModel::ShadowingEnabled=false
  const ch = parseRadioChannel(URBAN_INI)
  const ctx = fieldContext(ch, 5.8e9, [])
  const j = jammerAt()
  const noise = noiseFloorDbm(ch)
  const drone = overNoise(jammerWattAt(j, j.position, { x: 170, y: 210, z: 20 }, ctx), noise)
  const ground = overNoise(jammerWattAt(j, j.position, { x: 200, y: 230, z: 1.5 }, ctx), noise)
  assert.ok(Math.abs(drone - 30.34) < 0.01, `drone ${drone}`)
  assert.ok(Math.abs(ground - 28.82) < 0.01, `ground ${ground}`)
})

test('range and beam gates are hard edges, and the margin says how far inside', () => {
  const ch = parseRadioChannel(URBAN_INI)
  const ctx = fieldContext(ch, 5.8e9, [])
  const omni = jammerAt()
  assert.ok(jammerWattAt(omni, omni.position, { x: 339, y: 200, z: 1.5 }, ctx) > 0)
  assert.equal(jammerWattAt(omni, omni.position, { x: 341, y: 200, z: 1.5 }, ctx), 0)
  assert.ok(Math.abs(gateMarginM(omni, omni.position, { x: 330, y: 200, z: 1.5 }) - 10) < 1e-9)

  // 60 degree beam pointing east along the ground
  const east = jammerAt({ beamwidth_deg: 60, azimuth_deg: 90, zenith_deg: 90 })
  assert.ok(jammerWattAt(east, east.position, { x: 300, y: 220, z: 1.5 }, ctx) > 0)
  assert.equal(jammerWattAt(east, east.position, { x: 200, y: 300, z: 1.5 }, ctx), 0)
  assert.ok(gateMarginM(east, east.position, { x: 200, y: 300, z: 1.5 }) < 0)
})

test('a building between jammer and receiver means NLOS and less jamming', () => {
  const box = { xMin: 240, xMax: 250, yMin: 190, yMax: 210, zMin: 0, zMax: 9 }
  const jam = { x: 200, y: 200, z: 1.5 }
  assert.equal(segmentHitsBox(box, jam, { x: 300, y: 200, z: 1.5 }), true)
  assert.equal(segmentHitsBox(box, jam, { x: 300, y: 200, z: 40 }), false)
  assert.equal(segmentHitsBox(box, jam, { x: 200, y: 300, z: 1.5 }), false)
  const rx = { x: 300, y: 200, z: 1.5 }
  assert.ok(pathLossDb('UMa', 5.8e9, jam, rx, false) > pathLossDb('UMa', 5.8e9, jam, rx, true))
})

test('the map counts cells inside the range, not inside buildings, and only while on', () => {
  const ch = parseRadioChannel(URBAN_INI)
  const building = { id: 0, x: 250, y: 200, z: 0, width: 10, depth: 20, height: 9 }
  const ctx = fieldContext(ch, 5.8e9, [building])
  const j = jammerAt({ intervals: [{ start: 10, end: 20 }] })
  assert.deepEqual(liveJammers([j], 5, 5.8e9), [])
  const live = liveJammers([j], 15, 5.8e9)
  const grid = fieldGrid([j], [0, 30], { cx: 200, cy: 200, size: 600 })
  const field = computeJammerField(live, ctx, 1.5, grid)
  const at = (x: number, y: number) =>
    Math.round((y - grid.y0) / grid.cell) * grid.nx + Math.round((x - grid.x0) / grid.cell)
  assert.equal(field.counted[at(220, 200)], 1)
  assert.equal(field.counted[at(250, 200)], 0)
  // 164 m away: past the 140 m range, still on the grid
  assert.equal(field.counted[at(330, 300)], 0)
  // behind the building is weaker than the same distance in the open
  assert.ok(field.overNoiseDb[at(280, 200)] < field.overNoiseDb[at(200, 280)])
})

test('a single range-limited jammer gets a grid that follows it and covers its dome', () => {
  const j = jammerAt({
    waypoints: [
      { t: 0, x: 200, y: 30, z: 1.5 },
      { t: 240, x: 200, y: 200, z: 1.5 },
    ],
  })
  const v = volumeGrid([j], [0, 300], { cx: 200, cy: 200, size: 600 }, 20)
  assert.equal(v.follow, true)
  const half = (v.plan.nx * v.plan.cell) / 2
  assert.ok(half > 140, `half width ${half}`)
  assert.ok(Math.abs(v.plan.x0 + (v.plan.nx - 1) * v.plan.cell * 0.5) < 1e-9, 'centred on jammer')
  // the dome reaches 1.5 m + 140 m up
  assert.ok(v.heights.length * v.cellZ >= 141.5)
  assert.ok(v.heights[0] > 0.5 && v.heights[0] < v.cellZ)

  // two jammers, or one without a range, use one fixed grid over the scene
  const unbounded = jammerAt({ max_range_m: 0 })
  const fixed = volumeGrid([unbounded], [0, 300], { cx: 200, cy: 200, size: 600 }, 20)
  assert.equal(fixed.follow, false)
  assert.ok(fixed.heights.length * fixed.cellZ >= 50)
})
