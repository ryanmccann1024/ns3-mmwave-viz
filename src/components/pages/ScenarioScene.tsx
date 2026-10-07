import { useEffect, useState } from 'react'
import type { RunEntry } from '../../lib/assembleRuns'
import { parseTracks, type Point3 } from '../../lib/trackPreview'
import { MOTION } from '../../styles/motion'

const W = 480
const H = 192
const PAD = 12
/** Screen height given to the highest node; altitude is exaggerated so it reads at card size */
const ALT = 44
// A low camera: wider than true isometric so the ground fills a wide card
const COS = Math.cos(Math.PI / 6)
const SIN = 0.32

// Each run's positions are read once per session, however often its card mounts
const cache = new Map<string, Promise<Point3[][]>>()

function loadTracks(run: RunEntry): Promise<Point3[][]> {
  let pending = cache.get(run.key)
  if (!pending) {
    pending = run.posFile
      .text()
      .then((text) => parseTracks(text))
      .catch(() => [])
    cache.set(run.key, pending)
  }
  return pending
}

/** Isometric sketch of the run at its start: ground grid, nodes at altitude, and their paths */
export function ScenarioScene({ run }: { run: RunEntry | undefined }) {
  const [tracks, setTracks] = useState<Point3[][] | null>(null)
  useEffect(() => {
    if (!run) return
    let cancelled = false
    loadTracks(run).then((t) => {
      if (!cancelled) setTracks(t)
    })
    return () => {
      cancelled = true
    }
  }, [run])

  const frame = 'w-full h-48 rounded-xl bg-white/70 border border-hairline'
  if (!tracks || tracks.length === 0) return <div className={frame} aria-hidden="true" />

  // Ground rectangle around every point, padded so nodes never sit on the edge
  const all = tracks.flat()
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const maxZ = Math.max(0, ...all.map((p) => p[2]))
  const padX = Math.max((Math.max(...xs) - Math.min(...xs)) * 0.15, 10)
  const padY = Math.max((Math.max(...ys) - Math.min(...ys)) * 0.15, 10)
  const [x0, x1] = [Math.min(...xs) - padX, Math.max(...xs) + padX]
  const [y0, y1] = [Math.min(...ys) - padY, Math.max(...ys) + padY]

  const iso = (x: number, y: number) => [(x - y) * COS, -(x + y) * SIN] as const
  const corners = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)]
  const us = corners.map((c) => c[0])
  const vs = corners.map((c) => c[1])
  const scale = Math.min(
    (W - 2 * PAD) / (Math.max(...us) - Math.min(...us)),
    (H - 2 * PAD - ALT) / (Math.max(...vs) - Math.min(...vs))
  )
  const offU = W / 2 - ((Math.max(...us) + Math.min(...us)) / 2) * scale
  const offV = PAD + ALT - Math.min(...vs) * scale
  const ground = (x: number, y: number): [number, number] => {
    const [u, v] = iso(x, y)
    return [offU + u * scale, offV + v * scale]
  }
  const lift = (z: number) => (maxZ > 0 ? (z / maxZ) * ALT : 0)
  const air = ([x, y, z]: Point3): [number, number] => {
    const [gx, gy] = ground(x, y)
    return [gx, gy - lift(z)]
  }
  const path = (pts: [number, number][]) =>
    pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')

  const GRID = 6
  const gridLines = Array.from({ length: GRID + 1 }, (_, i) => {
    const fx = x0 + ((x1 - x0) * i) / GRID
    const fy = y0 + ((y1 - y0) * i) / GRID
    return [
      [ground(fx, y0), ground(fx, y1)],
      [ground(x0, fy), ground(x1, fy)],
    ]
  }).flat()

  // Draw back-to-front so nearer nodes overlap farther ones
  const nodes = tracks
    .map((track) => ({ track, start: track[0], moving: track.length > 1 }))
    .sort((a, b) => ground(a.start[0], a.start[1])[1] - ground(b.start[0], b.start[1])[1])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={frame}
      role="img"
      aria-label="Node layout at the start of the run"
    >
      <g className={MOTION.enterFade}>
        <polygon
          points={path(corners.map((_, i) => ground([x0, x1, x1, x0][i], [y0, y0, y1, y1][i])))}
          className="text-accent"
          fill="currentColor"
          fillOpacity={0.04}
        />
        {gridLines.map(([a, b], i) => (
          <line
            key={i}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            className="text-hairline-strong"
            stroke="currentColor"
            strokeWidth={1}
          />
        ))}
        {nodes.map(({ track, moving }, i) =>
          moving ? (
            <g key={`path-${i}`}>
              <polyline
                points={path(track.map((p) => ground(p[0], p[1])))}
                fill="none"
                className="text-ink-2"
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={path(track.map(air))}
                fill="none"
                className="text-accent"
                stroke="currentColor"
                strokeOpacity={0.6}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ) : null
        )}
        {nodes.map(({ start, moving }, i) => {
          const [gx, gy] = ground(start[0], start[1])
          const [ax, ay] = air(start)
          return (
            <g key={`node-${i}`} className={moving ? 'text-accent' : 'text-ink-title'}>
              <ellipse
                cx={gx}
                cy={gy}
                rx={8}
                ry={3.5}
                className="text-ink"
                fill="currentColor"
                fillOpacity={0.12}
              />
              {ay < gy - 1 && (
                <line
                  x1={gx}
                  y1={gy}
                  x2={ax}
                  y2={ay}
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              )}
              <circle cx={ax} cy={ay} r={8} fill="currentColor" stroke="white" strokeWidth={2.5} />
            </g>
          )
        })}
      </g>
    </svg>
  )
}
