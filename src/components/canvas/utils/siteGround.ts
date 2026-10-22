import * as THREE from 'three'
import type { BuildingState } from '../../../types'

/**
 * Paints one ground texture for the whole plane from the real building layout:
 * urban scenes get asphalt streets, kerbed sidewalks around each block, lane markings
 * down the open corridors and crosswalks where they cross; rural scenes get meadow,
 * hedged fields, gravel tracks and yards. Detail is kept broad so it doesn't shimmer. Everything is drawn in sim metres.
 */
export type SiteStyle = 'urban' | 'rural' | 'indoor'

export interface SiteSpec {
  style: SiteStyle
  /** sim-space centre and side length of the ground plane */
  cx: number
  cy: number
  size: number
  buildings: BuildingState[]
  extent?: { minX: number; maxX: number; minY: number; maxY: number }
}

const MAX_PX = 4096
const SIDEWALK = 4
const MIN_STREET = 7

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Rect {
  x0: number
  x1: number
  y0: number
  y1: number
}

const footprint = (b: BuildingState, pad = 0): Rect => ({
  x0: b.x - b.width / 2 - pad,
  x1: b.x + b.width / 2 + pad,
  y0: b.y - b.depth / 2 - pad,
  y1: b.y + b.depth / 2 + pad,
})

/** Open intervals along one axis that no (padded) footprint covers: the through-streets. */
function corridors(rects: Rect[], axis: 'x' | 'y', lo: number, hi: number) {
  const spans = rects
    .map((r) => (axis === 'x' ? [r.x0, r.x1] : [r.y0, r.y1]))
    .sort((a, b) => a[0] - b[0])
  const gaps: [number, number][] = []
  let cursor = lo
  for (const [a, b] of spans) {
    if (a > cursor && a - cursor >= MIN_STREET) gaps.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (hi - cursor >= MIN_STREET) gaps.push([cursor, hi])
  // edge gaps that run off the field are open land, not streets
  return gaps.filter(([a, b]) => a > lo && b < hi)
}

const cache = new Map<string, THREE.CanvasTexture>()

export function generateSiteTexture(spec: SiteSpec): THREE.CanvasTexture {
  const key = JSON.stringify([
    spec.style,
    spec.cx,
    spec.cy,
    spec.size,
    spec.extent,
    spec.buildings.map((b) => [b.x, b.y, b.width, b.depth]),
  ])
  const hit = cache.get(key)
  if (hit) return hit

  const px = Math.min(MAX_PX, Math.max(1024, 2 ** Math.ceil(Math.log2(spec.size * 2))))
  const k = px / spec.size // pixels per metre
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = px
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(7)
  // sim (x, y) → canvas; canvas rows run with sim y (see SceneEnvironment plane orientation)
  const X = (x: number) => (x - (spec.cx - spec.size / 2)) * k
  const Y = (y: number) => (y - (spec.cy - spec.size / 2)) * k
  const fillRect = (r: Rect) => ctx.fillRect(X(r.x0), Y(r.y0), (r.x1 - r.x0) * k, (r.y1 - r.y0) * k)

  const field = spec.extent ?? {
    minX: spec.cx - spec.size / 2,
    maxX: spec.cx + spec.size / 2,
    minY: spec.cy - spec.size / 2,
    maxY: spec.cy + spec.size / 2,
  }
  const blocks = spec.buildings.map((b) => footprint(b, SIDEWALK))
  const streetsX = corridors(blocks, 'x', field.minX, field.maxX) // run along sim y
  const streetsY = corridors(blocks, 'y', field.minY, field.maxY) // run along sim x

  // Broad, soft variation only: anything near one texel wide shimmers as the camera zooms
  const blotches = (colours: string[], n: number, minM: number, maxM: number, alpha: number) => {
    ctx.save()
    ctx.filter = `blur(${Math.max(2, minM * k * 0.4)}px)`
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = alpha * (0.5 + rand() * 0.5)
      ctx.fillStyle = colours[Math.floor(rand() * colours.length)]
      const r = (minM + rand() * (maxM - minM)) * k
      ctx.beginPath()
      ctx.ellipse(
        rand() * px,
        rand() * px,
        r,
        r * (0.5 + rand() * 0.5),
        rand() * Math.PI,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    ctx.restore()
  }
  // markings and edges are at least ~3 texels wide so they stay stable under mipmapping
  const minLine = (m: number) => Math.max(3, m * k)

  if (spec.style === 'indoor') {
    ctx.fillStyle = '#cfc8bf'
    ctx.fillRect(0, 0, px, px)
    blotches(['#d8d2c9', '#c4bdb3'], 80, 6, 20, 0.35)
    ctx.strokeStyle = 'rgba(90,80,70,0.18)'
    ctx.lineWidth = minLine(0.08)
    for (let m = 0; m < spec.size; m += 3) {
      ctx.beginPath()
      ctx.moveTo(m * k, 0)
      ctx.lineTo(m * k, px)
      ctx.moveTo(0, m * k)
      ctx.lineTo(px, m * k)
      ctx.stroke()
    }
  } else if (spec.style === 'rural') {
    // meadow base with large soft tonal drift, like grass seen from height
    ctx.fillStyle = '#6a8a45'
    ctx.fillRect(0, 0, px, px)
    blotches(['#5f8040', '#789850', '#6f8c3f', '#82955a'], 140, 25, 90, 0.45)
    // irregular fields in muted crop tones: column and row widths vary like real parcels
    const fields = ['#8a9a55', '#9b9a62', '#7d9a4c', '#a69a6a', '#6f9142']
    const cuts = (lo: number, hi: number) => {
      const out = [lo]
      while (out[out.length - 1] < hi) out.push(out[out.length - 1] + 70 + rand() * 90)
      return out
    }
    const xs = cuts(spec.cx - spec.size / 2, spec.cx + spec.size / 2)
    const ys = cuts(spec.cy - spec.size / 2, spec.cy + spec.size / 2)
    for (let i = 0; i + 1 < xs.length; i++) {
      for (let j = 0; j + 1 < ys.length; j++) {
        if (rand() < 0.4) continue // open pasture
        ctx.globalAlpha = 0.45
        ctx.fillStyle = fields[Math.floor(rand() * fields.length)]
        fillRect({ x0: xs[i] + 2, x1: xs[i + 1] - 2, y0: ys[j] + 2, y1: ys[j + 1] - 2 })
        ctx.globalAlpha = 1
      }
    }
    // soft hedgerows along some parcel edges only
    ctx.save()
    ctx.filter = `blur(${Math.max(1.5, 0.6 * k)}px)`
    ctx.strokeStyle = 'rgba(58,80,38,0.5)'
    ctx.lineWidth = minLine(1.6)
    for (const x of xs) {
      if (rand() < 0.4) continue
      ctx.beginPath()
      ctx.moveTo(X(x), 0)
      ctx.lineTo(X(x), px)
      ctx.stroke()
    }
    for (const y of ys) {
      if (rand() < 0.4) continue
      ctx.beginPath()
      ctx.moveTo(0, Y(y))
      ctx.lineTo(px, Y(y))
      ctx.stroke()
    }
    ctx.restore()
    // gravel farm tracks along the open corridors and yards around buildings
    ctx.fillStyle = '#a89878'
    for (const [a, b] of streetsX) {
      const mid = (a + b) / 2
      fillRect({ x0: mid - 2, x1: mid + 2, y0: field.minY, y1: field.maxY })
    }
    for (const [a, b] of streetsY) {
      const mid = (a + b) / 2
      fillRect({ x0: field.minX, x1: field.maxX, y0: mid - 2, y1: mid + 2 })
    }
    for (const b of spec.buildings) {
      ctx.fillStyle = '#a99f8c'
      fillRect(footprint(b, 3))
    }
  } else {
    // asphalt with soft wear patches
    ctx.fillStyle = '#45474b'
    ctx.fillRect(0, 0, px, px)
    blotches(['#424448', '#4a4c50'], 220, 4, 25, 0.3)

    const lane = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      colour: string,
      dashed: boolean
    ) => {
      ctx.strokeStyle = colour
      ctx.lineWidth = minLine(0.25)
      ctx.setLineDash(dashed ? [4 * k, 6 * k] : [])
      ctx.beginPath()
      ctx.moveTo(X(x0), Y(y0))
      ctx.lineTo(X(x1), Y(y1))
      ctx.stroke()
      ctx.setLineDash([])
    }
    // centre lines: dashed white on narrow streets, solid double on wide ones (muted, so trails stay the brightest lines)
    for (const [a, b] of streetsX) {
      const mid = (a + b) / 2
      if (b - a > 14) {
        lane(mid - 0.3, field.minY, mid - 0.3, field.maxY, 'rgba(214,210,196,0.55)', false)
        lane(mid + 0.3, field.minY, mid + 0.3, field.maxY, 'rgba(214,210,196,0.55)', false)
      } else lane(mid, field.minY, mid, field.maxY, 'rgba(225,225,220,0.55)', true)
    }
    for (const [a, b] of streetsY) {
      const mid = (a + b) / 2
      if (b - a > 14) {
        lane(field.minX, mid - 0.3, field.maxX, mid - 0.3, 'rgba(214,210,196,0.55)', false)
        lane(field.minX, mid + 0.3, field.maxX, mid + 0.3, 'rgba(214,210,196,0.55)', false)
      } else lane(field.minX, mid, field.maxX, mid, 'rgba(225,225,220,0.55)', true)
    }

    // junctions: clear the centre lines, add stop lines and zebra crossings (0.5 m bars, 0.5 m gaps)
    for (const [xa, xb] of streetsX) {
      for (const [ya, yb] of streetsY) {
        ctx.fillStyle = '#45474b'
        fillRect({ x0: xa, x1: xb, y0: ya, y1: yb })
        ctx.fillStyle = 'rgba(232,232,232,0.85)'
        const depth = 3
        for (let s = xa + 0.6; s < xb - 0.6; s += 1) {
          fillRect({ x0: s, x1: s + 0.5, y0: ya - depth - 0.8, y1: ya - 0.8 })
          fillRect({ x0: s, x1: s + 0.5, y0: yb + 0.8, y1: yb + depth + 0.8 })
        }
        for (let s = ya + 0.6; s < yb - 0.6; s += 1) {
          fillRect({ x0: xa - depth - 0.8, x1: xa - 0.8, y0: s, y1: s + 0.5 })
          fillRect({ x0: xb + 0.8, x1: xb + depth + 0.8, y0: s, y1: s + 0.5 })
        }
      }
    }

    // sidewalks: kerb, then pale concrete with gentle tonal variation
    for (const r of blocks) {
      ctx.fillStyle = '#8d8b86'
      fillRect({ x0: r.x0 - 0.35, x1: r.x1 + 0.35, y0: r.y0 - 0.35, y1: r.y1 + 0.35 })
      ctx.fillStyle = '#b4b1aa'
      fillRect(r)
    }
    ctx.save()
    ctx.beginPath()
    for (const r of blocks) ctx.rect(X(r.x0), Y(r.y0), (r.x1 - r.x0) * k, (r.y1 - r.y0) * k)
    ctx.clip()
    blotches(['#aeaba4', '#bdbab3'], 300, 2, 8, 0.4)
    ctx.restore()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  cache.set(key, tex)
  return tex
}
