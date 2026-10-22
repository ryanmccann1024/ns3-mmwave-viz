// Offline reward landscape (reward_landscape.json, written next to steps.jsonl): for one
// controlled node at one recorded decision, the reward the episode would have scored had
// that node been parked at each point of a grid while every other node stayed put.
// Pure parsing, slice selection and the geometry the 3D layer draws (field, colour
// domain, contour segments, texture bytes, best reachable move).

import type { HeatDomain } from './colorScale.ts'
import { HEAT_EMPTY, parseHex, writeHeatRgb } from './colorScale.ts'

type Rec = Record<string, unknown>

export interface LandscapeGrid {
  xMin: number
  xMax: number
  nx: number
  yMin: number
  yMax: number
  ny: number
}

export interface LandscapeMove {
  action: number
  label: string
  position: [number, number]
  valid: boolean
  total: number | null
  components: Record<string, number | null>
}

export interface LandscapeSlice {
  decision: number
  timeS: number | null
  nodeId: string
  slot: number
  position: [number, number, number]
  /** 'total' (weighted) and one unweighted array per component; null cells are NaN */
  values: Record<string, Float32Array>
  spread: Record<string, Float32Array>
  moves: LandscapeMove[]
  recorded: { total: number | null; components: Record<string, number | null> } | null
}

export interface LandscapeSource {
  method: string
  approximation: string | null
  seeds: number[]
  band: string | null
  runConfig: string | null
  generatedAt: string | null
}

export interface RewardLandscape {
  version: 1
  contract: string | null
  source: LandscapeSource
  grid: LandscapeGrid
  components: string[]
  /** schema weight of each component, same order; 1 when the file gives none */
  weights: number[]
  slices: LandscapeSlice[]
}

export type ParseResult = { ok: true; value: RewardLandscape } | { ok: false; message: string }

/** 'total' or a reward component key */
export type LandscapeField = string
/** components shown as they enter the total (× schema weight) or as raw values */
export type ComponentScale = 'weighted' | 'raw'

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

class LandscapeError extends Error {}
const fail = (message: string): never => {
  throw new LandscapeError(message)
}

function readGrid(raw: unknown): LandscapeGrid {
  if (!isRec(raw)) fail('grid is missing')
  const g = raw as Rec
  const field = (k: string) => num(g[k]) ?? fail(`grid.${k} is not a number`)
  const count = (k: string) => {
    const n = field(k)
    if (!Number.isInteger(n) || n < 2) fail(`grid.${k} must be an integer of at least 2`)
    return n
  }
  const grid = {
    xMin: field('x_min'),
    xMax: field('x_max'),
    nx: count('nx'),
    yMin: field('y_min'),
    yMax: field('y_max'),
    ny: count('ny'),
  }
  if (!(grid.xMax > grid.xMin) || !(grid.yMax > grid.yMin)) fail('grid bounds are empty')
  if (grid.nx * grid.ny > 1_000_000) fail('grid has more than a million cells')
  return grid
}

function readArray(raw: unknown, cells: number, where: string): Float32Array {
  if (!Array.isArray(raw)) return fail(`${where} is not an array`)
  if (raw.length !== cells) fail(`${where} has ${raw.length} values, expected ${cells}`)
  const out = new Float32Array(cells)
  for (let i = 0; i < cells; i++) {
    const v = raw[i]
    if (v === null) out[i] = NaN
    else if (typeof v === 'number' && Number.isFinite(v)) out[i] = v
    else fail(`${where}[${i}] is not a number or null`)
  }
  return out
}

function readArrays(raw: unknown, cells: number, where: string): Record<string, Float32Array> {
  if (raw === undefined || raw === null) return {}
  if (!isRec(raw)) return fail(`${where} is not an object`)
  const out: Record<string, Float32Array> = {}
  for (const [k, v] of Object.entries(raw)) out[k] = readArray(v, cells, `${where}.${k}`)
  return out
}

function readComponents(raw: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  if (isRec(raw)) for (const [k, v] of Object.entries(raw)) out[k] = num(v)
  return out
}

function readXy(raw: unknown, where: string): [number, number] {
  if (!Array.isArray(raw) || raw.length < 2) return fail(`${where} is not an [x, y] pair`)
  return [num(raw[0]) ?? fail(`${where}[0] is not a number`), num(raw[1]) ?? fail(`${where}[1]`)]
}

function readSlice(raw: unknown, i: number, cells: number): LandscapeSlice {
  const where = `slices[${i}]`
  if (!isRec(raw)) return fail(`${where} is not an object`)
  const decision = num(raw.decision)
  if (decision === null || !Number.isInteger(decision)) fail(`${where}.decision is not an integer`)
  const slot = num(raw.slot)
  if (slot === null || !Number.isInteger(slot) || slot < 0) fail(`${where}.slot is not a slot`)
  const nodeId = str(raw.node_id) ?? fail(`${where}.node_id is missing`)
  const [x, y] = readXy(raw.position, `${where}.position`)
  const z = Array.isArray(raw.position) ? (num(raw.position[2]) ?? 0) : 0
  const values = readArrays(raw.values, cells, `${where}.values`)
  if (!values.total) fail(`${where}.values.total is missing`)
  const moves: LandscapeMove[] = Array.isArray(raw.moves)
    ? raw.moves.map((m, j) => {
        if (!isRec(m)) return fail(`${where}.moves[${j}] is not an object`)
        return {
          action: num(m.action) ?? j,
          label: str(m.label) ?? String(num(m.action) ?? j),
          position: readXy(m.position, `${where}.moves[${j}].position`),
          valid: m.valid !== false,
          total: num(m.total),
          components: readComponents(m.components),
        }
      })
    : []
  const recorded = isRec(raw.recorded)
    ? { total: num(raw.recorded.total), components: readComponents(raw.recorded.components) }
    : null
  return {
    decision: decision as number,
    timeS: num(raw.time_s),
    nodeId,
    slot: slot as number,
    position: [x, y, z],
    values,
    spread: readArrays(raw.spread, cells, `${where}.spread`),
    moves,
    recorded,
  }
}

/** Parses and validates reward_landscape.json (landscape_version 1). */
export function parseRewardLandscape(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { ok: false, message: `reward_landscape.json is not JSON: ${String(err)}` }
  }
  try {
    if (!isRec(raw)) fail('reward_landscape.json is not an object')
    const r = raw as Rec
    if (r.landscape_version !== 1) {
      fail(`unsupported landscape_version ${JSON.stringify(r.landscape_version)} (expected 1)`)
    }
    const grid = readGrid(r.grid)
    const cells = grid.nx * grid.ny
    const schema = isRec(r.reward_schema) ? r.reward_schema : {}
    const components = Array.isArray(schema.components)
      ? schema.components.filter((c): c is string => typeof c === 'string')
      : []
    const rawWeights = Array.isArray(schema.weights) ? schema.weights : []
    const weights = components.map((_, i) => num(rawWeights[i]) ?? 1)
    if (!Array.isArray(r.slices) || r.slices.length === 0) fail('slices is empty')
    const slices = (r.slices as unknown[]).map((s, i) => readSlice(s, i, cells))
    const src = isRec(r.source) ? r.source : {}
    const seeds = Array.isArray(src.seeds)
      ? src.seeds.filter((s): s is number => typeof s === 'number')
      : []
    return {
      ok: true,
      value: {
        version: 1,
        contract: str(r.contract),
        source: {
          method: str(src.method) ?? 'unknown',
          approximation: str(src.approximation),
          seeds,
          band: str(src.band),
          runConfig: str(src.run_config),
          generatedAt: str(src.generated_at),
        },
        grid,
        components,
        weights,
        slices,
      },
    }
  } catch (err) {
    if (err instanceof LandscapeError) return { ok: false, message: err.message }
    throw err
  }
}

export interface SliceChoice {
  slice: LandscapeSlice
  /** the asked-for node has no slices, so the first controlled slot is shown instead */
  nodeFallback: boolean
}

/**
 * The slice to draw: the asked-for node's slices (else the lowest slot's), then the latest
 * slice at or before the decision (else the nearest one). Without a decision, time_s is
 * used the same way; with neither, the earliest slice.
 */
export function selectSlice(
  landscape: RewardLandscape,
  want: { nodeId: string | null; decision: number | null; timeS: number | null }
): SliceChoice | null {
  const all = landscape.slices
  if (all.length === 0) return null
  let pool = want.nodeId === null ? [] : all.filter((s) => s.nodeId === want.nodeId)
  const nodeFallback = want.nodeId !== null && pool.length === 0
  if (pool.length === 0) {
    const slot = Math.min(...all.map((s) => s.slot))
    pool = all.filter((s) => s.slot === slot)
  }
  const pick = (key: (s: LandscapeSlice) => number | null, target: number) => {
    let atOrBefore: LandscapeSlice | null = null
    let nearest: LandscapeSlice | null = null
    for (const s of pool) {
      const k = key(s)
      if (k === null) continue
      if (k <= target && (atOrBefore === null || k > key(atOrBefore)!)) atOrBefore = s
      if (nearest === null || Math.abs(k - target) < Math.abs(key(nearest)! - target)) nearest = s
    }
    return atOrBefore ?? nearest
  }
  let slice: LandscapeSlice | null = null
  if (want.decision !== null) slice = pick((s) => s.decision, want.decision)
  else if (want.timeS !== null) slice = pick((s) => s.timeS, want.timeS)
  slice ??= pool.reduce((a, b) => (b.decision < a.decision ? b : a))
  return { slice, nodeFallback }
}

/** Fields a slice can show: 'total' first, then the schema components it has values for */
export function sliceFields(landscape: RewardLandscape, slice: LandscapeSlice): string[] {
  return ['total', ...landscape.components.filter((c) => slice.values[c])]
}

function weightOf(landscape: RewardLandscape, field: string, scale: ComponentScale): number {
  if (field === 'total' || scale === 'raw') return 1
  const i = landscape.components.indexOf(field)
  return i >= 0 ? landscape.weights[i] : 1
}

/** The grid to colour: the weighted total, or a component (× its weight when 'weighted') */
export function landscapeField(
  landscape: RewardLandscape,
  slice: LandscapeSlice,
  field: LandscapeField,
  scale: ComponentScale
): Float32Array | null {
  const values = slice.values[field]
  if (!values) return null
  const w = weightOf(landscape, field, scale)
  if (w === 1) return values
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i] * w
  return out
}

/** A move's value on the same field and scale as the map; null when it has none */
export function moveValue(
  landscape: RewardLandscape,
  move: LandscapeMove,
  field: LandscapeField,
  scale: ComponentScale
): number | null {
  const v = field === 'total' ? move.total : (move.components[field] ?? null)
  return v === null ? null : v * weightOf(landscape, field, scale)
}

/**
 * Index of the valid move that adds the most reward on the field (first on ties); null if
 * none. Always ranked as weighted, so a raw view of a penalty (negative weight) still rings
 * the move with the smallest penalty rather than the largest raw value.
 */
export function bestMove(
  landscape: RewardLandscape,
  slice: LandscapeSlice,
  field: LandscapeField
): number | null {
  let best: number | null = null
  let bestV = -Infinity
  slice.moves.forEach((m, i) => {
    const v = m.valid ? moveValue(landscape, m, field, 'weighted') : null
    if (v !== null && v > bestV) {
      bestV = v
      best = i
    }
  })
  return best
}

/**
 * Colour domain over the finite values: diverging around 0 when they straddle it, else a
 * sequential lo → hi run. null when every cell is empty.
 */
export function fieldDomain(values: ArrayLike<number>): HeatDomain | null {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (lo > hi) return null
  return { lo, hi, diverging: lo < 0 && hi > 0 }
}

/** The domain stretched to cover extra finite values (e.g. the moves coloured on the same scale) */
export function widenDomain(domain: HeatDomain, extra: (number | null)[]): HeatDomain {
  let { lo, hi } = domain
  for (const v of extra) {
    if (v === null || !Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return { lo, hi, diverging: lo < 0 && hi > 0 }
}

/** A 1/2/5 × 10^k step giving roughly `target` intervals over span */
function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
}

/** Round contour levels strictly inside the domain (none for a flat field) */
export function contourLevels(domain: HeatDomain, target = 8): number[] {
  const span = domain.hi - domain.lo
  if (!(span > 0)) return []
  const step = niceStep(span, target)
  const out: number[] = []
  for (let k = Math.ceil(domain.lo / step); k * step <= domain.hi; k++) {
    const v = Number((k * step).toPrecision(12))
    if (v > domain.lo && v < domain.hi) out.push(v)
  }
  return out
}

/**
 * Isolines of one level by marching squares over the cell-centre lattice, as flat sim-xy
 * segments [x0, y0, x1, y1, ...]. Squares with an empty corner are skipped; saddles are
 * resolved by the square's mean.
 */
export function isolineSegments(
  values: ArrayLike<number>,
  grid: LandscapeGrid,
  level: number
): number[] {
  const { nx, ny } = grid
  const out: number[] = []
  const dx = (grid.xMax - grid.xMin) / (nx - 1)
  const dy = (grid.yMax - grid.yMin) / (ny - 1)
  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = values[iy * nx + ix] // bottom left
      const b = values[iy * nx + ix + 1] // bottom right
      const c = values[(iy + 1) * nx + ix + 1] // top right
      const d = values[(iy + 1) * nx + ix] // top left
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d)))
        continue
      const code =
        (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0)
      if (code === 0 || code === 15) continue
      const x0 = grid.xMin + ix * dx
      const y0 = grid.yMin + iy * dy
      const t = (u: number, v: number) => (level - u) / (v - u)
      // edge crossing points
      const bottom = () => [x0 + t(a, b) * dx, y0]
      const right = () => [x0 + dx, y0 + t(b, c) * dy]
      const top = () => [x0 + t(d, c) * dx, y0 + dy]
      const left = () => [x0, y0 + t(a, d) * dy]
      const seg = (p: number[], q: number[]) => out.push(p[0], p[1], q[0], q[1])
      switch (code) {
        case 1:
        case 14:
          seg(left(), bottom())
          break
        case 2:
        case 13:
          seg(bottom(), right())
          break
        case 3:
        case 12:
          seg(left(), right())
          break
        case 4:
        case 11:
          seg(right(), top())
          break
        case 6:
        case 9:
          seg(bottom(), top())
          break
        case 7:
        case 8:
          seg(left(), top())
          break
        case 5:
        case 10: {
          const centreAbove = (a + b + c + d) / 4 >= level
          // above-corners a & c (code 5) join through an above centre, cutting off b and d
          if ((code === 5) === centreAbove) {
            seg(bottom(), right())
            seg(left(), top())
          } else {
            seg(left(), bottom())
            seg(right(), top())
          }
          break
        }
      }
    }
  }
  return out
}

/** Every level's isolines together */
export function contourSegments(
  values: ArrayLike<number>,
  grid: LandscapeGrid,
  levels: number[]
): number[] {
  const out: number[] = []
  for (const level of levels) {
    for (const v of isolineSegments(values, grid, level)) out.push(v)
  }
  return out
}

/**
 * Sim-space rectangle the texture covers: the cell-centre lattice padded by half a cell,
 * so each texel centre sits exactly on its grid point.
 */
export function landscapeExtent(grid: LandscapeGrid) {
  const hx = (grid.xMax - grid.xMin) / (grid.nx - 1) / 2
  const hy = (grid.yMax - grid.yMin) / (grid.ny - 1) / 2
  return { x0: grid.xMin - hx, x1: grid.xMax + hx, y0: grid.yMin - hy, y1: grid.yMax + hy }
}

/**
 * RGBA bytes (nx × ny) for a ground texture, row 0 first (v = 0 of a DataTexture). The
 * layer lays a PlaneGeometry flat with rotation.x = -π/2, which sends local (x, y, 0) to
 * Three (x, 0, -y): v = 0 (local -y) lands on Three +z, i.e. the highest sim y. So texture
 * row r takes grid row ny - 1 - r. Empty cells are fully transparent but keep the empty
 * colour, so linear filtering fades their edge to it rather than to black.
 */
export function landscapeTextureBytes(
  values: ArrayLike<number>,
  grid: LandscapeGrid,
  domain: HeatDomain,
  alpha = 255
): Uint8Array<ArrayBuffer> {
  const { nx, ny } = grid
  const out = new Uint8Array(nx * ny * 4)
  const empty = parseHex(HEAT_EMPTY)!
  for (let r = 0; r < ny; r++) {
    const iy = ny - 1 - r
    for (let ix = 0; ix < nx; ix++) {
      const o = (r * nx + ix) * 4
      if (writeHeatRgb(out, o, values[iy * nx + ix], domain)) out[o + 3] = alpha
      else out.set(empty, o)
    }
  }
  return out
}

/** Everything the 3D layer and the legend draw for one slice and field */
export interface LandscapeView {
  grid: LandscapeGrid
  slice: LandscapeSlice
  values: Float32Array
  domain: HeatDomain
  levels: number[]
  /** flat sim-xy segments of every contour level */
  contours: number[]
  /** each move's value on the shown field (null: none or invalid) */
  moveValues: (number | null)[]
  best: number | null
}

/** The drawable view of a slice's field; null when the field is missing or entirely empty */
export function buildLandscapeView(
  landscape: RewardLandscape,
  slice: LandscapeSlice,
  field: LandscapeField,
  scale: ComponentScale
): LandscapeView | null {
  const values = landscapeField(landscape, slice, field, scale)
  if (!values) return null
  const fieldRange = fieldDomain(values)
  if (!fieldRange) return null
  const moveValues = slice.moves.map((m) =>
    m.valid ? moveValue(landscape, m, field, scale) : null
  )
  // the discs share the map's colour scale, so the legend has to reach their values too
  const domain = widenDomain(fieldRange, moveValues)
  const levels = contourLevels(fieldRange)
  return {
    grid: landscape.grid,
    slice,
    values,
    domain,
    levels,
    contours: contourSegments(values, landscape.grid, levels),
    moveValues,
    best: bestMove(landscape, slice, field),
  }
}
