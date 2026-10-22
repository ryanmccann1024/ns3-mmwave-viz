import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import type { LandscapeView } from '../../lib/rewardLandscape'
import { landscapeExtent, landscapeTextureBytes } from '../../lib/rewardLandscape'
import { HEAT_EMPTY, heatColor } from '../../lib/colorScale'
import { simToThree } from './utils/coordinates'

interface Props {
  view: LandscapeView
  dimensions: 1 | 2 | 3
  posScale: number
}

/** Heights above the ground grid (y = 0), so the layers never z-fight */
const MAP_Y = 0.05
const CONTOUR_Y = 0.12
const MARKER_Y = 0.25

const CONTOUR_COLOR = '#0a1324'
const RING_COLOR = '#0a1324'
const BEST_COLOR = '#ffffff'

const noRaycast = () => null

/**
 * The reward landscape laid on the ground: the field as a texture over the grid, contour
 * lines, a ring under the node's recorded position and the five reachable moves coloured by
 * their value (the best one ringed in white). Nothing here takes pointer hits, so clicks fall
 * through to nodes and links. Hidden in the 1D side profile, which has no ground plane.
 */
export function RewardLandscapeLayer({ view, dimensions, posScale }: Props) {
  const { grid, values, domain, slice } = view

  const texture = useMemo(() => {
    const t = new THREE.DataTexture(
      landscapeTextureBytes(values, grid, domain),
      grid.nx,
      grid.ny,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    )
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearFilter
    t.needsUpdate = true
    return t
  }, [values, grid, domain])
  useEffect(() => () => texture.dispose(), [texture])

  const plane = useMemo(() => {
    const e = landscapeExtent(grid)
    const [x, , z] = simToThree((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, 0, dimensions, posScale)
    return {
      position: [x, MAP_Y, z] as [number, number, number],
      width: (e.x1 - e.x0) * posScale,
      depth: (e.y1 - e.y0) * posScale,
    }
  }, [grid, dimensions, posScale])

  const contourPoints = useMemo(() => {
    const pts: [number, number, number][] = []
    const c = view.contours
    for (let i = 0; i + 3 < c.length; i += 4) {
      const [ax, , az] = simToThree(c[i], c[i + 1], 0, dimensions, posScale)
      const [bx, , bz] = simToThree(c[i + 2], c[i + 3], 0, dimensions, posScale)
      pts.push([ax, CONTOUR_Y, az], [bx, CONTOUR_Y, bz])
    }
    return pts
  }, [view.contours, dimensions, posScale])

  // The moves are one step apart, often far less than a grid cell, so they are drawn as a
  // compass rose around the recorded position: true directions, spread to at least 1.5 cells
  const rose = useMemo(() => {
    const cell = Math.min(
      (grid.xMax - grid.xMin) / (grid.nx - 1),
      (grid.yMax - grid.yMin) / (grid.ny - 1)
    )
    const [cx, cy, cz] = slice.position
    const steps = slice.moves
      .map((m) => Math.hypot(m.position[0] - cx, m.position[1] - cy))
      .filter((d) => d > 1e-6)
    const radius = Math.max(cell * 1.5, ...steps)
    const markers = slice.moves.map((m, i) => {
      const dx = m.position[0] - cx
      const dy = m.position[1] - cy
      const d = Math.hypot(dx, dy)
      const [sx, sy] = d > 1e-6 ? [cx + (dx / d) * radius, cy + (dy / d) * radius] : [cx, cy]
      const [x, , z] = simToThree(sx, sy, 0, dimensions, posScale)
      const v = view.moveValues[i]
      return {
        key: `${m.action}-${i}`,
        position: [x, MARKER_Y, z] as [number, number, number],
        color: v === null ? HEAT_EMPTY : heatColor(v, domain),
        valid: m.valid && v !== null,
        best: i === view.best,
      }
    })
    const [x, , z] = simToThree(cx, cy, 0, dimensions, posScale)
    const [, top] = simToThree(cx, cy, cz, 3, posScale)
    return {
      centre: [x, MARKER_Y, z] as [number, number, number],
      top,
      ring: radius * 1.6 * posScale,
      marker: radius * 0.42 * posScale,
      markers,
    }
  }, [grid, slice, view.moveValues, view.best, domain, dimensions, posScale])

  if (dimensions === 1) return null

  return (
    <group>
      <mesh
        position={plane.position}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={noRaycast}
        renderOrder={1}
      >
        <planeGeometry args={[plane.width, plane.depth]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0.8}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {contourPoints.length > 0 && (
        <Line
          points={contourPoints}
          segments
          color={CONTOUR_COLOR}
          lineWidth={1}
          transparent
          opacity={0.4}
          depthWrite={false}
          raycast={noRaycast}
          renderOrder={2}
        />
      )}

      {/* The node's recorded position, with a stem up to it in 3D */}
      <mesh
        position={rose.centre}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={noRaycast}
        renderOrder={3}
      >
        <ringGeometry args={[rose.ring * 0.9, rose.ring, 48]} />
        <meshBasicMaterial color={RING_COLOR} transparent opacity={0.75} depthWrite={false} />
      </mesh>
      {dimensions === 3 && rose.top > MARKER_Y && (
        <Line
          points={[rose.centre, [rose.centre[0], rose.top, rose.centre[2]]]}
          color={RING_COLOR}
          lineWidth={1}
          dashed
          dashSize={2 * posScale}
          gapSize={2 * posScale}
          transparent
          opacity={0.5}
          raycast={noRaycast}
        />
      )}

      {rose.markers.map((m) => (
        <group key={m.key} position={m.position}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={4}>
            <circleGeometry args={[rose.marker, 32]} />
            <meshBasicMaterial
              color={m.color}
              transparent
              opacity={m.valid ? 1 : 0.45}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={5}>
            <ringGeometry
              args={
                m.best
                  ? [rose.marker * 1.05, rose.marker * 1.45, 32]
                  : [rose.marker * 0.92, rose.marker * 1.05, 32]
              }
            />
            <meshBasicMaterial
              color={m.best ? BEST_COLOR : RING_COLOR}
              transparent
              opacity={m.best ? 1 : 0.6}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {m.best && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={5}>
              <ringGeometry args={[rose.marker * 1.45, rose.marker * 1.6, 32]} />
              <meshBasicMaterial color={RING_COLOR} depthWrite={false} toneMapped={false} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}
