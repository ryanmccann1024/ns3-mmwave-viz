import type { BuildingState, JammerPoint, JammerState } from '../types.ts'
import type { RadioChannel } from './runIni.ts'
import { jammerActivity, jammerPositionAt } from './jammers.ts'

/*
 * Mean jammer power over the noise floor, mirroring the simulator's JammerModel
 * (src/jammer/jammer-model.cc) and ns-3's 3GPP TR 38.901 path loss. Shadow fading is
 * random per link and is not saved, so it is left out: this is the field before fading.
 */

const SPEED_OF_LIGHT = 299792458

export interface Box {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  zMin: number
  zMax: number
}

export function buildingBoxes(buildings: BuildingState[]): Box[] {
  return buildings.map((b) => ({
    xMin: b.x - b.width / 2,
    xMax: b.x + b.width / 2,
    yMin: b.y - b.depth / 2,
    yMax: b.y + b.depth / 2,
    zMin: b.z,
    zMax: b.z + b.height,
  }))
}

/** ns-3 Box::IsInside: closed bounds. */
export function insideBox(box: Box, p: JammerPoint): boolean {
  return (
    p.x >= box.xMin &&
    p.x <= box.xMax &&
    p.y >= box.yMin &&
    p.y <= box.yMax &&
    p.z >= box.zMin &&
    p.z <= box.zMax
  )
}

/** ns-3 Box::IsIntersect: separating-axis test of a segment against a box. */
export function segmentHitsBox(box: Box, a: JammerPoint, b: JammerPoint): boolean {
  if (insideBox(box, a) || insideBox(box, b)) return true
  const sx = 0.5 * (box.xMax - box.xMin)
  const sy = 0.5 * (box.yMax - box.yMin)
  const sz = 0.5 * (box.zMax - box.zMin)
  const cx = box.xMin + sx
  const cy = box.yMin + sy
  const cz = box.zMin + sz
  const mx = 0.5 * (a.x + b.x) - cx
  const my = 0.5 * (a.y + b.y) - cy
  const mz = 0.5 * (a.z + b.z) - cz
  const lx = a.x - cx - mx
  const ly = a.y - cy - my
  const lz = a.z - cz - mz
  const ex = Math.abs(lx)
  const ey = Math.abs(ly)
  const ez = Math.abs(lz)
  if (Math.abs(mx) > sx + ex) return false
  if (Math.abs(my) > sy + ey) return false
  if (Math.abs(mz) > sz + ez) return false
  if (Math.abs(my * lz - mz * ly) > sy * ez + sz * ey) return false
  if (Math.abs(mx * lz - mz * lx) > sx * ez + sz * ex) return false
  if (Math.abs(mx * ly - my * lx) > sx * ey + sy * ex) return false
  return true
}

export function lineOfSightBlocked(a: JammerPoint, b: JammerPoint, boxes: Box[]): boolean {
  for (const box of boxes) if (segmentHitsBox(box, a, b)) return true
  return false
}

export function noiseFloorDbm(channel: RadioChannel): number {
  return -174 + 10 * Math.log10(channel.bandwidthHz) + channel.noiseFigureDb
}

/** The 3GPP scenarios this module reproduces; others (NYU, indoor) get no map. */
export function fieldSupported(channel: RadioChannel | null): boolean {
  return (
    channel !== null &&
    channel.channelModel === '3gpp' &&
    ['UMa', 'UMi', 'RMa'].includes(channel.scenario)
  )
}

/** RMa defaults: ns-3 AvgBuildingHeight and AvgStreetWidth attributes. */
const RMA_H = 5
const RMA_W = 20

function rmaPl1(fHz: number, d3: number): number {
  return (
    20 * Math.log10((40 * Math.PI * d3 * fHz) / 1e9 / 3) +
    Math.min(0.03 * RMA_H ** 1.72, 10) * Math.log10(d3) -
    Math.min(0.044 * RMA_H ** 1.72, 14.77) +
    0.002 * Math.log10(RMA_H) * d3
  )
}

/**
 * ns-3 ThreeGpp{Uma,UmiStreetCanyon,Rma}PropagationLossModel::GetLoss{Los,Nlos}, with the
 * jammer as the first mobility model (the simulator calls CalcRxPower(eirp, jammer, rx)).
 * UMa's breakpoint uses hE = 1 m, which ns-3 always draws while the lower end is under 13 m.
 */
export function pathLossDb(
  scenario: string,
  fHz: number,
  jam: JammerPoint,
  rx: JammerPoint,
  los: boolean
): number {
  // sqrt, not Math.hypot: this runs per grid cell and hypot is several times slower
  const d2 = Math.sqrt((jam.x - rx.x) ** 2 + (jam.y - rx.y) ** 2)
  const d3 = Math.sqrt(d2 * d2 + (jam.z - rx.z) ** 2)
  const fGhz = fHz / 1e9

  if (scenario === 'UMi') {
    // GetBsUtHeightsUmiStreetCanyon: the first height is the BS only when it is exactly 10 m
    const hBs = jam.z === 10 ? jam.z : rx.z
    const hUt = jam.z === 10 ? rx.z : jam.z
    const bp = (4 * (hBs - 1) * (hUt - 1) * fHz) / SPEED_OF_LIGHT
    const plLos =
      d2 <= bp
        ? 32.4 + 21 * Math.log10(d3) + 20 * Math.log10(fGhz)
        : 32.4 +
          40 * Math.log10(d3) +
          20 * Math.log10(fGhz) -
          9.5 * Math.log10(bp ** 2 + (hBs - hUt) ** 2)
    if (los) return plLos
    const plNlos = 22.4 + 35.3 * Math.log10(d3) + 21.3 * Math.log10(fGhz) - 0.3 * (hUt - 1.5)
    return Math.max(plLos, plNlos)
  }

  const hBs = Math.max(jam.z, rx.z)
  const hUt = Math.min(jam.z, rx.z)

  if (scenario === 'RMa') {
    const bp = (2 * Math.PI * hBs * hUt * fHz) / SPEED_OF_LIGHT
    const plLos = d2 <= bp ? rmaPl1(fHz, d3) : rmaPl1(fHz, bp) + 40 * Math.log10(d3 / bp)
    if (los) return plLos
    const plNlos =
      161.04 -
      7.1 * Math.log10(RMA_W) +
      7.5 * Math.log10(RMA_H) -
      (24.37 - 3.7 * (RMA_H / hBs) ** 2) * Math.log10(hBs) +
      (43.42 - 3.1 * Math.log10(hBs)) * (Math.log10(d3) - 3) +
      20 * Math.log10(fGhz) -
      (3.2 * Math.log10(11.75 * hUt) ** 2 - 4.97)
    return Math.max(plLos, plNlos)
  }

  // UMa
  const bp = (4 * (hBs - 1) * (hUt - 1) * fHz) / SPEED_OF_LIGHT
  const plLos =
    d2 <= bp
      ? 28 + 22 * Math.log10(d3) + 20 * Math.log10(fGhz)
      : 28 +
        40 * Math.log10(d3) +
        20 * Math.log10(fGhz) -
        9 * Math.log10(bp ** 2 + (hBs - hUt) ** 2)
  if (los) return plLos
  const plNlos = 13.54 + 39.08 * Math.log10(d3) + 20 * Math.log10(fGhz) - 0.6 * (hUt - 1.5)
  return Math.max(plLos, plNlos)
}

/** 3GPP TR 38.901 Table 7.4.2-1, used only when no buildings decide LOS. */
export function losProbability(scenario: string, d2: number, hUt: number): number {
  if (scenario === 'RMa') return d2 <= 10 ? 1 : Math.exp(-(d2 - 10) / 1000)
  if (d2 <= 18) return 1
  if (scenario === 'UMi') return 18 / d2 + Math.exp(-d2 / 36) * (1 - 18 / d2)
  const c = hUt <= 13 ? 0 : ((hUt - 13) / 10) ** 1.5
  return (
    (18 / d2 + Math.exp(-d2 / 63) * (1 - 18 / d2)) *
    (1 + ((c * 5) / 4) * (d2 / 100) ** 3 * Math.exp(-d2 / 150))
  )
}

/** JammerModel::InBeam: hard 3-D cone, omni at 360 degrees. */
export function inBeam(jammer: JammerState, jam: JammerPoint, rx: JammerPoint): boolean {
  if (jammer.beamwidthDeg >= 360) return true
  const az = (jammer.azimuthDeg * Math.PI) / 180
  const ze = (jammer.zenithDeg * Math.PI) / 180
  const px = Math.sin(ze) * Math.sin(az)
  const py = Math.sin(ze) * Math.cos(az)
  const pz = Math.cos(ze)
  const dx = rx.x - jam.x
  const dy = rx.y - jam.y
  const dz = rx.z - jam.z
  const dn = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (dn < 1e-9) return true
  const dot = Math.min(1, Math.max(-1, (px * dx + py * dy + pz * dz) / dn))
  return (Math.acos(dot) * 180) / Math.PI <= jammer.beamwidthDeg / 2
}

/**
 * How far (m) a receiver is inside this jammer's range and beam gates; negative outside.
 * The map stores this instead of a yes/no so the GPU can draw the edge as a smooth line.
 */
export function gateMarginM(jammer: JammerState, jam: JammerPoint, rx: JammerPoint): number {
  const dx = rx.x - jam.x
  const dy = rx.y - jam.y
  const dz = rx.z - jam.z
  const d3 = Math.sqrt(dx * dx + dy * dy + dz * dz)
  let margin = jammer.maxRangeM > 0 ? jammer.maxRangeM - d3 : Infinity
  if (jammer.beamwidthDeg < 360 && d3 > 1e-9) {
    const az = (jammer.azimuthDeg * Math.PI) / 180
    const ze = (jammer.zenithDeg * Math.PI) / 180
    const dot =
      (Math.sin(ze) * Math.sin(az) * dx + Math.sin(ze) * Math.cos(az) * dy + Math.cos(ze) * dz) / d3
    const offAxis = Math.acos(Math.min(1, Math.max(-1, dot)))
    margin = Math.min(margin, (((jammer.beamwidthDeg / 2) * Math.PI) / 180 - offAxis) * d3)
  }
  return margin
}

export interface FieldContext {
  channel: RadioChannel
  carrierHz: number
  boxes: Box[]
  /** the simulator decides LOS from buildings for static_los or any loaded buildings */
  buildingLos: boolean
}

export function fieldContext(
  channel: RadioChannel,
  carrierHz: number,
  buildings: BuildingState[]
): FieldContext {
  return {
    channel,
    carrierHz,
    boxes: buildingBoxes(buildings),
    buildingLos: channel.conditionModel === 'static_los' || buildings.length > 0,
  }
}

/**
 * Received power (W) from one jammer that already passed its time and band gates.
 * `gated: false` skips the range and beam gates and assumes clear line of sight: only
 * the map uses it, to give cells the simulator ignores a value that blends at the edge.
 */
export function jammerWattAt(
  jammer: JammerState,
  jam: JammerPoint,
  rx: JammerPoint,
  ctx: FieldContext,
  gated = true
): number {
  const d3 = Math.sqrt((rx.x - jam.x) ** 2 + (rx.y - jam.y) ** 2 + (rx.z - jam.z) ** 2)
  if (gated && jammer.maxRangeM > 0 && d3 > jammer.maxRangeM) return 0
  if (gated && !inBeam(jammer, jam, rx)) return 0
  const eirp = jammer.txPowerDbm + jammer.txArrayGainDbi
  const duty = jammer.type === 'random' ? 1 : jammer.dutyCycle
  const watt = (dbm: number) => 10 ** ((dbm - 30) / 10) * duty
  if (d3 < 1) return watt(eirp)
  const { scenario } = ctx.channel
  if (!gated) return watt(eirp - pathLossDb(scenario, ctx.carrierHz, jam, rx, true))
  if (ctx.buildingLos) {
    const los = !lineOfSightBlocked(jam, rx, ctx.boxes)
    return watt(eirp - pathLossDb(scenario, ctx.carrierHz, jam, rx, los))
  }
  // No buildings: the simulator draws LOS per link, so show the expected power
  const d2 = Math.sqrt((rx.x - jam.x) ** 2 + (rx.y - jam.y) ** 2)
  const p = losProbability(scenario, d2, Math.min(jam.z, rx.z))
  return (
    p * watt(eirp - pathLossDb(scenario, ctx.carrierHz, jam, rx, true)) +
    (1 - p) * watt(eirp - pathLossDb(scenario, ctx.carrierHz, jam, rx, false))
  )
}

/** A jammer transmitting at this instant, and where it is. */
export interface LiveJammer {
  jammer: JammerState
  position: JammerPoint
}

/** Time and band gates; random bursts are drawn as on, at the power they jam with. */
export function liveJammers(
  jammers: JammerState[],
  timeS: number,
  carrierHz: number
): LiveJammer[] {
  return jammers
    .filter((j) => jammerActivity(j, timeS, carrierHz) !== 'off')
    .map((jammer) => ({ jammer, position: jammerPositionAt(jammer, timeS) }))
}

export interface FieldGrid {
  /** sim x, y of the first cell's centre */
  x0: number
  y0: number
  cell: number
  nx: number
  ny: number
}

export interface JammerField {
  grid: FieldGrid
  /** jammer power over the noise floor (dB) per cell, row-major from y0 */
  overNoiseDb: Float32Array
  /**
   * 0.5 + (metres inside the nearest range/beam edge) / 3 cells, clamped to [0, 1]: above 0.5
   * the simulator counts the jamming. 0 inside buildings.
   */
  counted: Float32Array
}

/**
 * The jamming a receiver at `heightM` would see at each grid cell. Cells outside every
 * jammer's range or beam keep the ungated value so the edge interpolates cleanly, but
 * are marked uncounted.
 */
export function computeJammerField(
  live: LiveJammer[],
  ctx: FieldContext,
  heightM: number,
  grid: FieldGrid
): JammerField {
  const n = grid.nx * grid.ny
  const overNoiseDb = new Float32Array(n)
  const counted = new Float32Array(n)
  const noiseWatt = 10 ** ((noiseFloorDbm(ctx.channel) - 30) / 10)
  const rx = { x: 0, y: 0, z: heightM }
  for (let j = 0; j < grid.ny; j++) {
    rx.y = grid.y0 + j * grid.cell
    for (let i = 0; i < grid.nx; i++) {
      rx.x = grid.x0 + i * grid.cell
      const k = j * grid.nx + i
      let gated = 0
      let ungated = 0
      let margin = -Infinity
      for (const { jammer, position } of live) {
        const w = jammerWattAt(jammer, position, rx, ctx, true)
        gated += w
        ungated += w > 0 ? w : jammerWattAt(jammer, position, rx, ctx, false)
        margin = Math.max(margin, gateMarginM(jammer, position, rx))
      }
      counted[k] = ctx.boxes.some((box) => insideBox(box, rx))
        ? 0
        : Math.min(1, Math.max(0, 0.5 + margin / (3 * grid.cell)))
      overNoiseDb[k] = 10 * Math.log10((gated > 0 ? gated : ungated) / noiseWatt)
    }
  }
  return { grid, overNoiseDb, counted }
}

/**
 * A grid covering where the jamming can reach over the whole run: each jammer's path
 * widened by its range, clipped to the scene. Fixed for the run, so a moving jammer only
 * changes values, never geometry.
 */
export function fieldGrid(
  jammers: JammerState[],
  times: number[],
  scene: { cx: number; cy: number; size: number },
  maxCells = 220
): FieldGrid {
  const half = scene.size / 2
  let xMin = scene.cx - half
  let xMax = scene.cx + half
  let yMin = scene.cy - half
  let yMax = scene.cy + half
  if (jammers.length && jammers.every((j) => j.maxRangeM > 0)) {
    let bx0 = Infinity
    let bx1 = -Infinity
    let by0 = Infinity
    let by1 = -Infinity
    const stops = [...times, ...jammers.flatMap((j) => j.waypoints.map((w) => w.t))]
    for (const jammer of jammers) {
      for (const t of stops) {
        const p = jammerPositionAt(jammer, t)
        bx0 = Math.min(bx0, p.x - jammer.maxRangeM)
        bx1 = Math.max(bx1, p.x + jammer.maxRangeM)
        by0 = Math.min(by0, p.y - jammer.maxRangeM)
        by1 = Math.max(by1, p.y + jammer.maxRangeM)
      }
    }
    xMin = Math.max(xMin, bx0)
    xMax = Math.min(xMax, bx1)
    yMin = Math.max(yMin, by0)
    yMax = Math.min(yMax, by1)
  }
  const span = Math.max(xMax - xMin, yMax - yMin, 1)
  const cell = Math.max(0.5, span / maxCells)
  return {
    x0: xMin + cell / 2,
    y0: yMin + cell / 2,
    cell,
    nx: Math.max(2, Math.ceil((xMax - xMin) / cell)),
    ny: Math.max(2, Math.ceil((yMax - yMin) / cell)),
  }
}

export interface VolumeGrid {
  /**
   * The horizontal grid every layer shares. When `follow` is set its x0/y0 are offsets
   * from the jammer, and the grid moves with it.
   */
  plan: FieldGrid
  /** true for a single range-limited jammer: a tight grid centred on it */
  follow: boolean
  /** receiver height of each layer's centre, bottom up (sim metres) */
  heights: number[]
  /** layer thickness (m); the volume spans 0 to heights.length * cellZ */
  cellZ: number
}

/**
 * Layers from the ground to the top of the highest jammer's range (a 3-D distance, so a
 * dome), or to well above the nodes when a jammer has no range limit. A single
 * range-limited jammer gets a fixed-size grid that follows it, finer than one covering its
 * whole path. Layers are about as thick as the cells are wide, at most `maxLayers`.
 */
export function volumeGrid(
  jammers: JammerState[],
  times: number[],
  scene: { cx: number; cy: number; size: number },
  nodeTopM: number,
  maxCells = 104,
  maxLayers = 48
): VolumeGrid {
  const stops = [...times, ...jammers.flatMap((j) => j.waypoints.map((w) => w.t))]
  const bounded = jammers.length > 0 && jammers.every((j) => j.maxRangeM > 0)
  const follow = bounded && jammers.length === 1
  let plan: FieldGrid
  if (follow) {
    // two cells of margin so the dome never touches the box faces
    const r = jammers[0].maxRangeM
    const cell = Math.max(0.5, (2 * r) / (maxCells - 4))
    plan = {
      x0: -cell * (maxCells / 2 - 0.5),
      y0: -cell * (maxCells / 2 - 0.5),
      cell,
      nx: maxCells,
      ny: maxCells,
    }
  } else {
    plan = fieldGrid(jammers, times, scene, maxCells)
  }
  let top = Math.max(60, nodeTopM * 1.5 + 20)
  if (bounded) {
    top = 0
    for (const jammer of jammers)
      for (const t of stops) top = Math.max(top, jammerPositionAt(jammer, t).z + jammer.maxRangeM)
    top += plan.cell
  }
  const nz = Math.max(2, Math.min(maxLayers, Math.ceil(top / plan.cell)))
  const cellZ = top / nz
  return { plan, follow, heights: Array.from({ length: nz }, (_, k) => (k + 0.5) * cellZ), cellZ }
}
