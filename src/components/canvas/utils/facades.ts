import * as THREE from 'three'

/**
 * Procedural facade textures. Each tile covers BAYS × FLOORS of real wall
 * (TILE_W × TILE_H metres) so window scale matches the building's true size.
 */
export const TILE_W = 16
export const TILE_H = 14
const BAYS = 4
const FLOORS = 4
const PX = 512

export type FacadeKind = 'glass' | 'brick' | 'precast' | 'panel' | 'siding' | 'barn' | 'interior'

export interface FacadeStyle {
  kind: FacadeKind
  roof: string
  parapet: string
  edge: string
}

export const URBAN_FACADES: FacadeStyle[] = [
  { kind: 'glass', roof: '#4b5158', parapet: '#8b939c', edge: '#dbe4ee' },
  { kind: 'brick', roof: '#3f3a37', parapet: '#7d4a3a', edge: '#f1ddd2' },
  { kind: 'precast', roof: '#55524c', parapet: '#bdb4a3', edge: '#f4efe6' },
  { kind: 'panel', roof: '#4a4d52', parapet: '#c9ccd0', edge: '#f8fafc' },
]
export const RURAL_FACADES: FacadeStyle[] = [
  { kind: 'siding', roof: '#5b3a2c', parapet: '#e9e3d6', edge: '#fbf8f1' },
  { kind: 'barn', roof: '#6b7076', parapet: '#8e2f25', edge: '#f7e9e4' },
  { kind: 'brick', roof: '#4b3b33', parapet: '#7d4a3a', edge: '#f1ddd2' },
]
export const INDOOR_FACADES: FacadeStyle[] = [
  { kind: 'interior', roof: '#9ca3af', parapet: '#d1d5db', edge: '#334155' },
]

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const bw = PX / BAYS
const fh = PX / FLOORS

function noise(ctx: CanvasRenderingContext2D, rand: () => number, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    const v = rand() > 0.5 ? 255 : 0
    ctx.fillStyle = `rgba(${v},${v},${v},${a * rand()})`
    ctx.fillRect(rand() * PX, rand() * PX, 1 + rand() * 2, 1 + rand() * 2)
  }
}

/** Glass pane with a sky-reflection gradient whose strength varies pane to pane */
function pane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rand: () => number,
  base: [number, number, number]
) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h)
  const lift = 25 + rand() * 45
  const [r, gg, b] = base
  g.addColorStop(0, `rgb(${r + lift},${gg + lift},${b + lift})`)
  g.addColorStop(0.55, `rgb(${r},${gg},${b})`)
  g.addColorStop(1, `rgb(${r - 10},${gg - 10},${b - 8})`)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  // blinds / interior hint on a few panes
  if (rand() < 0.3) {
    ctx.fillStyle = 'rgba(220,220,210,0.25)'
    ctx.fillRect(x, y, w, h * (0.2 + rand() * 0.5))
  }
}

function drawGlass(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#2a3a48'
  ctx.fillRect(0, 0, PX, PX)
  const cols = BAYS * 2
  const cw = PX / cols
  for (let f = 0; f < FLOORS; f++) {
    for (let c = 0; c < cols; c++) {
      pane(ctx, c * cw, f * fh, cw, fh * 0.78, rand, [40, 66, 86])
    }
    // spandrel band at each slab
    ctx.fillStyle = '#1d2a35'
    ctx.fillRect(0, f * fh + fh * 0.78, PX, fh * 0.22)
  }
  // aluminium mullions and transoms
  ctx.fillStyle = '#9aa5ae'
  for (let c = 0; c <= cols; c++) ctx.fillRect(c * cw - 2, 0, 4, PX)
  for (let f = 0; f <= FLOORS; f++) ctx.fillRect(0, f * fh - 2, PX, 4)
  ctx.fillStyle = 'rgba(154,165,174,0.6)'
  for (let f = 0; f < FLOORS; f++) ctx.fillRect(0, f * fh + fh * 0.78 - 1, PX, 2)
}

function drawBrick(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#c7b9a8' // mortar
  ctx.fillRect(0, 0, PX, PX)
  const bh = 7
  const bl = 22
  for (let row = 0; row * bh < PX; row++) {
    const off = row % 2 ? bl / 2 : 0
    for (let x = -off; x < PX; x += bl) {
      const r = 120 + rand() * 40
      ctx.fillStyle = `rgb(${r},${55 + rand() * 20},${40 + rand() * 15})`
      ctx.fillRect(x + 1, row * bh + 1, bl - 2, bh - 1.5)
    }
  }
  for (let f = 0; f < FLOORS; f++) {
    for (let c = 0; c < BAYS; c++) {
      const x = c * bw + bw * 0.25
      const y = f * fh + fh * 0.22
      const w = bw * 0.5
      const h = fh * 0.55
      // lintel, sill, frame, two-light sash
      ctx.fillStyle = '#d9d2c5'
      ctx.fillRect(x - 5, y - 8, w + 10, 8)
      ctx.fillRect(x - 6, y + h, w + 12, 6)
      ctx.fillStyle = '#efeae0'
      ctx.fillRect(x - 3, y - 3, w + 6, h + 6)
      pane(ctx, x, y, w, h, rand, [52, 64, 72])
      ctx.fillStyle = '#efeae0'
      ctx.fillRect(x, y + h / 2 - 2, w, 4)
      ctx.fillRect(x + w / 2 - 2, y, 4, h)
    }
  }
}

function drawPrecast(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#d6cfc0'
  ctx.fillRect(0, 0, PX, PX)
  noise(ctx, rand, 6000, 0.08)
  for (let f = 0; f < FLOORS; f++) {
    // ribbon window band
    const y = f * fh + fh * 0.3
    const h = fh * 0.45
    for (let c = 0; c < BAYS * 3; c++) {
      pane(ctx, (c * PX) / (BAYS * 3), y, PX / (BAYS * 3), h, rand, [58, 70, 78])
    }
    ctx.fillStyle = '#5c6166'
    for (let c = 0; c <= BAYS * 3; c++) ctx.fillRect((c * PX) / (BAYS * 3) - 1.5, y, 3, h)
    // panel joints and shadow under the sill
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(0, y + h, PX, 4)
    ctx.fillStyle = 'rgba(80,70,60,0.35)'
    ctx.fillRect(0, f * fh, PX, 2)
  }
  ctx.fillStyle = 'rgba(80,70,60,0.25)'
  for (let c = 0; c <= BAYS; c++) ctx.fillRect(c * bw - 1, 0, 2, PX)
}

function drawPanel(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#d9dcdf'
  ctx.fillRect(0, 0, PX, PX)
  for (let f = 0; f < FLOORS; f++) {
    for (let c = 0; c < BAYS; c++) {
      ctx.fillStyle = `rgb(${210 + rand() * 20},${213 + rand() * 20},${217 + rand() * 18})`
      ctx.fillRect(c * bw + 2, f * fh + 2, bw - 4, fh - 4)
      const x = c * bw + bw * 0.18
      const y = f * fh + fh * 0.2
      ctx.fillStyle = '#30353b'
      ctx.fillRect(x - 3, y - 3, bw * 0.64 + 6, fh * 0.56 + 6)
      pane(ctx, x, y, bw * 0.64, fh * 0.56, rand, [44, 58, 70])
    }
  }
}

function drawSiding(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#ece6d8'
  ctx.fillRect(0, 0, PX, PX)
  for (let y = 0; y < PX; y += 9) {
    ctx.fillStyle = 'rgba(120,105,80,0.25)'
    ctx.fillRect(0, y + 7, PX, 2)
  }
  noise(ctx, rand, 3000, 0.05)
  for (let f = 0; f < FLOORS; f++) {
    for (let c = 0; c < BAYS; c += 2) {
      const x = c * bw + bw * 0.6
      const y = f * fh + fh * 0.25
      const w = bw * 0.55
      const h = fh * 0.5
      ctx.fillStyle = '#3d5a3f' // shutters
      ctx.fillRect(x - 14, y, 12, h)
      ctx.fillRect(x + w + 2, y, 12, h)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - 3, y - 3, w + 6, h + 6)
      pane(ctx, x, y, w, h, rand, [60, 70, 76])
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x + w / 2 - 2, y, 4, h)
      ctx.fillRect(x, y + h / 2 - 2, w, 4)
    }
  }
}

function drawBarn(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#8e2f25'
  ctx.fillRect(0, 0, PX, PX)
  for (let x = 0; x < PX; x += 16) {
    ctx.fillStyle = `rgba(0,0,0,${0.12 + rand() * 0.1})`
    ctx.fillRect(x, 0, 3, PX)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(x + 6, 0, 4, PX)
  }
  noise(ctx, rand, 5000, 0.1)
  ctx.fillStyle = '#f2ece2'
  for (let f = 0; f <= FLOORS; f++) ctx.fillRect(0, f * fh - 3, PX, 6)
}

function drawInterior(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#e7e5e0'
  ctx.fillRect(0, 0, PX, PX)
  noise(ctx, rand, 3000, 0.04)
  for (let c = 0; c < BAYS; c++) {
    pane(ctx, c * bw + 8, fh * 0.1, bw - 16, fh * 3.6, rand, [150, 175, 195])
  }
  ctx.fillStyle = '#9aa1a8'
  for (let c = 0; c <= BAYS; c++) ctx.fillRect(c * bw - 3, 0, 6, PX)
}

const DRAW: Record<FacadeKind, (ctx: CanvasRenderingContext2D, rand: () => number) => void> = {
  glass: drawGlass,
  brick: drawBrick,
  precast: drawPrecast,
  panel: drawPanel,
  siding: drawSiding,
  barn: drawBarn,
  interior: drawInterior,
}

const cache = new Map<FacadeKind, THREE.CanvasTexture>()

export function facadeTexture(kind: FacadeKind): THREE.CanvasTexture {
  const hit = cache.get(kind)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PX
  const ctx = canvas.getContext('2d')!
  DRAW[kind](ctx, mulberry32(kind.length * 97 + 13))
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  cache.set(kind, tex)
  return tex
}

const roofCache = new Map<string, THREE.CanvasTexture>()

/** Gravel/membrane roof surface */
export function roofTexture(colour: string): THREE.CanvasTexture {
  const hit = roofCache.get(colour)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, 256, 256)
  const rand = mulberry32(5)
  for (let i = 0; i < 9000; i++) {
    const v = rand() > 0.5 ? 255 : 0
    ctx.fillStyle = `rgba(${v},${v},${v},${0.12 * rand()})`
    ctx.fillRect(rand() * 256, rand() * 256, 1.5, 1.5)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 2, 256)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  roofCache.set(colour, tex)
  return tex
}
