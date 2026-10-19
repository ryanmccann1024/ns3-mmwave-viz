// Colour ramps for heatmaps. Stops are interpolated in OKLab so equal steps in value
// read as equal steps in lightness; each ramp is sampled once into a lookup table so
// painting thousands of cells costs an array index, not a colour-space conversion.

export const HEAT_NEUTRAL = '#f0efec'
/** hairline: cells with no data (the UI also hatches or dims them) */
export const HEAT_EMPTY = '#e4e9f2'

const INK_DARK = '#0a1324'
const INK_LIGHT = '#ffffff'

type Rgb = [number, number, number]
type Lab = [number, number, number]

/** '#rgb' or '#rrggbb' as 0–255 channels; null if it is not a hex colour */
export function parseHex(hex: string): Rgb | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) =>
  255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055)

function rgbToOklab([r8, g8, b8]: Rgb): Lab {
  const r = toLinear(r8)
  const g = toLinear(g8)
  const b = toLinear(b8)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToRgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

interface Stop {
  at: number
  hex: string
  lab: Lab
}

const stops = (list: [number, string][]): Stop[] =>
  list.map(([at, hex]) => ({ at, hex, lab: rgbToOklab(parseHex(hex)!) }))

/** colour at t on a stop list (t already inside the stop range); exact stop hex at a stop */
function sample(list: Stop[], t: number): string {
  let i = 0
  while (i < list.length - 2 && t > list[i + 1].at) i++
  const a = list[i]
  const b = list[i + 1]
  const f = (t - a.at) / (b.at - a.at)
  if (f <= 0) return a.hex
  if (f >= 1) return b.hex
  return toHex(oklabToRgb([0, 1, 2].map((k) => a.lab[k] + (b.lab[k] - a.lab[k]) * f) as Lab))
}

/** stop list sampled at `steps` equal intervals over [lo, hi]; stops fall on exact entries */
function table(list: Stop[], steps: number): string[] {
  const lo = list[0].at
  const hi = list[list.length - 1].at
  return Array.from({ length: steps + 1 }, (_, i) => sample(list, lo + ((hi - lo) * i) / steps))
}

const DIVERGING_STEPS = 512
const SEQUENTIAL_STEPS = 256

let divergingLut: string[] | null = null
let sequentialLut: string[] | null = null

function divergingTable(): string[] {
  divergingLut ??= table(
    stops([
      [-1, '#b42f2e'],
      [-0.5, '#ec9c98'],
      [0, HEAT_NEUTRAL],
      [0.5, '#9ec5f4'],
      [1, '#1c5cab'],
    ]),
    DIVERGING_STEPS
  )
  return divergingLut
}

function sequentialTable(): string[] {
  sequentialLut ??= table(
    stops([
      [0, '#eef4fc'],
      [0.5, '#6da7ec'],
      [1, '#104281'],
    ]),
    SEQUENTIAL_STEPS
  )
  return sequentialLut
}

const divergingIndex = (t: number) => {
  const c = Number.isNaN(t) ? 0 : Math.min(1, Math.max(-1, t))
  return Math.round(((c + 1) / 2) * DIVERGING_STEPS)
}
const sequentialIndex = (t: number) => {
  const c = Number.isNaN(t) ? 0 : Math.min(1, Math.max(0, t))
  return Math.round(c * SEQUENTIAL_STEPS)
}

/** -1 → red, 0 → neutral grey, +1 → blue; t is clamped to [-1, 1] and NaN reads as 0 */
export function divergingColor(t: number): string {
  return divergingTable()[divergingIndex(t)]
}

/** single-hue blue, 0 → pale, 1 → deep; t is clamped to [0, 1] and NaN reads as 0 */
export function sequentialColor(t: number): string {
  return sequentialTable()[sequentialIndex(t)]
}

export interface HeatDomain {
  lo: number
  hi: number
  diverging: boolean
}

/** which ramp and entry a finite value lands on (shared by the hex and byte lookups) */
function heatEntry(v: number, domain: HeatDomain): { diverging: boolean; i: number } {
  const { lo, hi } = domain
  if (domain.diverging) {
    const m = Math.max(Math.abs(lo), Math.abs(hi))
    return { diverging: true, i: divergingIndex(m > 0 ? v / m : 0) }
  }
  return {
    diverging: false,
    i: sequentialIndex(hi > lo ? (v - lo) / (hi - lo) : v > 0 ? 1 : 0),
  }
}

/**
 * A cell value as a colour. NaN → HEAT_EMPTY. A diverging domain is centred on 0 and
 * scaled by its larger end; otherwise the value runs lo → hi on the sequential ramp
 * (a flat domain paints positive values at the deep end, zero or less at the pale end).
 */
export function heatColor(v: number, domain: HeatDomain): string {
  if (Number.isNaN(v)) return HEAT_EMPTY
  const e = heatEntry(v, domain)
  return (e.diverging ? divergingTable() : sequentialTable())[e.i]
}

let divergingBytes: Uint8Array | null = null
let sequentialBytes: Uint8Array | null = null

function bytesOf(hexes: string[]): Uint8Array {
  const out = new Uint8Array(hexes.length * 3)
  hexes.forEach((h, i) => out.set(parseHex(h)!, i * 3))
  return out
}

/**
 * heatColor as sRGB bytes written into `out` at `offset` (r, g, b), for filling textures
 * without parsing a hex string per cell. Returns false (and writes nothing) for NaN.
 */
export function writeHeatRgb(
  out: Uint8Array | Uint8ClampedArray,
  offset: number,
  v: number,
  domain: HeatDomain
): boolean {
  if (Number.isNaN(v)) return false
  const e = heatEntry(v, domain)
  const lut = e.diverging
    ? (divergingBytes ??= bytesOf(divergingTable()))
    : (sequentialBytes ??= bytesOf(sequentialTable()))
  out[offset] = lut[e.i * 3]
  out[offset + 1] = lut[e.i * 3 + 1]
  out[offset + 2] = lut[e.i * 3 + 2]
  return true
}

/** WCAG relative luminance of 0–255 sRGB channels */
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

const INK_DARK_LUMINANCE = luminance(parseHex(INK_DARK)!)

/** '#0a1324' or '#ffffff', whichever has the higher contrast over a hex background */
export function readableInk(bg: string): string {
  const rgb = parseHex(bg)
  if (!rgb) return INK_DARK
  const l = luminance(rgb)
  const onDark = 1.05 / (l + 0.05)
  const onLight = (l + 0.05) / (INK_DARK_LUMINANCE + 0.05)
  return onLight >= onDark ? INK_DARK : INK_LIGHT
}
