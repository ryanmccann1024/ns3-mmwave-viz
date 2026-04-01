import * as THREE from 'three'

const SIZE = 512

/** Simple seeded pseudo-random for deterministic textures */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function drawGrass(ctx: CanvasRenderingContext2D) {
  const rand = mulberry32(42)
  // Base green fill
  ctx.fillStyle = '#3a7d32'
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Random patches of lighter/darker green
  for (let i = 0; i < 4000; i++) {
    const x = rand() * SIZE
    const y = rand() * SIZE
    const g = 90 + rand() * 80
    const r = 30 + rand() * 40
    const b = 20 + rand() * 30
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(x, y, 2 + rand() * 4, 1 + rand() * 2)
  }

  // Occasional earth patches
  for (let i = 0; i < 200; i++) {
    const x = rand() * SIZE
    const y = rand() * SIZE
    ctx.fillStyle = `rgba(100,80,50,${0.15 + rand() * 0.15})`
    ctx.beginPath()
    ctx.ellipse(x, y, 3 + rand() * 8, 2 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawConcrete(ctx: CanvasRenderingContext2D) {
  const rand = mulberry32(77)
  // Base gray
  ctx.fillStyle = '#505050'
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Speckle noise
  for (let i = 0; i < 8000; i++) {
    const x = rand() * SIZE
    const y = rand() * SIZE
    const v = 60 + rand() * 100
    ctx.fillStyle = `rgba(${v},${v},${v},0.3)`
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2)
  }

  // Faint crack lines
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(40,40,40,${0.1 + rand() * 0.15})`
    ctx.lineWidth = 0.5 + rand()
    ctx.beginPath()
    let cx = rand() * SIZE
    let cy = rand() * SIZE
    ctx.moveTo(cx, cy)
    for (let j = 0; j < 6; j++) {
      cx += (rand() - 0.5) * 80
      cy += (rand() - 0.5) * 80
      ctx.lineTo(cx, cy)
    }
    ctx.stroke()
  }

  // Subtle road marking hints (thin white lines)
  for (let i = 0; i < 3; i++) {
    const y = 100 + rand() * (SIZE - 200)
    ctx.strokeStyle = `rgba(200,200,200,0.08)`
    ctx.lineWidth = 2
    ctx.setLineDash([20, 30])
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(SIZE, y)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function drawTile(ctx: CanvasRenderingContext2D) {
  const rand = mulberry32(99)
  // Light warm gray base
  ctx.fillStyle = '#c8c0b8'
  ctx.fillRect(0, 0, SIZE, SIZE)

  const tileSize = 64
  // Draw tile grid
  ctx.strokeStyle = 'rgba(160,150,140,0.5)'
  ctx.lineWidth = 1.5
  for (let x = 0; x <= SIZE; x += tileSize) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, SIZE)
    ctx.stroke()
  }
  for (let y = 0; y <= SIZE; y += tileSize) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(SIZE, y)
    ctx.stroke()
  }

  // Slight color variation per tile
  for (let tx = 0; tx < SIZE; tx += tileSize) {
    for (let ty = 0; ty < SIZE; ty += tileSize) {
      const v = rand() * 0.06
      ctx.fillStyle = `rgba(${rand() > 0.5 ? 0 : 255},${rand() > 0.5 ? 0 : 255},${rand() > 0.5 ? 0 : 255},${v})`
      ctx.fillRect(tx + 1, ty + 1, tileSize - 2, tileSize - 2)
    }
  }

  // Subtle speckle
  for (let i = 0; i < 2000; i++) {
    const x = rand() * SIZE
    const y = rand() * SIZE
    const v = 150 + rand() * 80
    ctx.fillStyle = `rgba(${v},${v},${v},0.12)`
    ctx.fillRect(x, y, 1, 1)
  }
}

function drawDark(ctx: CanvasRenderingContext2D, baseColor: string) {
  const [r, g, b] = hexToRgb(baseColor)
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Subtle noise
  const rand = mulberry32(11)
  for (let i = 0; i < 3000; i++) {
    const x = rand() * SIZE
    const y = rand() * SIZE
    const dr = (rand() - 0.5) * 20
    ctx.fillStyle = `rgba(${Math.max(0, r + dr)},${Math.max(0, g + dr)},${Math.max(0, b + dr)},0.3)`
    ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2)
  }
}

const textureCache = new Map<string, THREE.CanvasTexture>()

export function generateGroundTexture(
  type: 'grass' | 'concrete' | 'tile' | 'dark',
  baseColor: string,
  planeSize: number
): THREE.CanvasTexture {
  const cacheKey = `${type}-${baseColor}`
  const cached = textureCache.get(cacheKey)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  switch (type) {
    case 'grass':
      drawGrass(ctx)
      break
    case 'concrete':
      drawConcrete(ctx)
      break
    case 'tile':
      drawTile(ctx)
      break
    case 'dark':
      drawDark(ctx, baseColor)
      break
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping

  // Scale repeat so each tile covers a reasonable area
  const tilesPerSide =
    type === 'tile' ? planeSize / 40 : type === 'grass' ? planeSize / 80 : planeSize / 60
  texture.repeat.set(tilesPerSide, tilesPerSide)

  textureCache.set(cacheKey, texture)
  return texture
}
