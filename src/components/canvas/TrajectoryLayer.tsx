import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import type { TrailPoint } from '../../lib/trajectory'
import { decimate } from '../../lib/trajectory'
import { trailColor } from '../../styles/tokens'
import { simToThree } from './utils/coordinates'

export interface Trail {
  policy: string
  nodeIndex: number
  nodeId?: string
  points: TrailPoint[]
}

interface Props {
  trails: Trail[]
  dim: 1 | 2 | 3
  posScale: number
  /** The live replay stays solid; other policies get translucent position ghosts. */
  replayPolicy?: string
  /** playback time: the path is solid up to here and faint beyond */
  time: number
}

const MAX_TRAIL_POINTS = 500
const MARKER_RADIUS = 1
const GHOST_RADIUS = 4

type Vec3 = [number, number, number]

/** Split a timed path at t, adding the interpolated point so the two halves meet */
function splitAt(points: TrailPoint[], t: number): [TrailPoint[], TrailPoint[]] {
  const i = points.findIndex((p) => p.time > t)
  if (i === -1) return [points, []]
  if (i === 0) return [[], points]
  const a = points[i - 1]
  const b = points[i]
  const f = (t - a.time) / (b.time - a.time || 1)
  const mid = {
    time: t,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
  }
  return [
    [...points.slice(0, i), mid],
    [mid, ...points.slice(i)],
  ]
}

export function TrajectoryLayer({ trails, dim, posScale, replayPolicy, time }: Props) {
  const paths = useMemo(
    () =>
      trails
        .filter((t) => t.points.length >= 2)
        .map((t) => ({
          key: `${t.policy}-${t.nodeIndex}`,
          policy: t.policy,
          color: trailColor(t.policy),
          points: decimate(t.points, MAX_TRAIL_POINTS),
        })),
    [trails]
  )

  const toThree = (p: TrailPoint): Vec3 => simToThree(p.x, p.y, p.z, dim, posScale)

  return (
    <>
      {paths.map((path) => {
        const [done, ahead] = splitAt(path.points, time)
        const liveReplay = path.policy === replayPolicy
        const atTime = toThree(done[done.length - 1] ?? ahead[0])
        const start = toThree(path.points[0])
        const end = toThree(path.points[path.points.length - 1])
        return (
          <group key={path.key}>
            {/* where the node goes next: faint, and drawn only where the solid part is not */}
            {ahead.length >= 2 && (
              <Line
                points={ahead.map(toThree)}
                color={path.color}
                lineWidth={2}
                transparent
                opacity={liveReplay ? 0.3 : 0.18}
                depthTest={false}
                renderOrder={4}
              />
            )}
            {/* where it has been */}
            {done.length >= 2 && (
              <Line
                points={done.map(toThree)}
                color={path.color}
                lineWidth={liveReplay ? 4 : 2.5}
                transparent={!liveReplay}
                opacity={liveReplay ? 1 : 0.65}
                depthTest={false}
                renderOrder={5}
              />
            )}
            {liveReplay ? (
              <>
                <mesh position={start} renderOrder={6}>
                  <sphereGeometry args={[MARKER_RADIUS, 16, 16]} />
                  <meshBasicMaterial
                    color={path.color}
                    transparent
                    opacity={0.4}
                    depthTest={false}
                  />
                </mesh>
                <mesh position={end} renderOrder={6}>
                  <sphereGeometry args={[MARKER_RADIUS * 1.15, 16, 16]} />
                  <meshBasicMaterial
                    color={path.color}
                    transparent
                    opacity={ahead.length >= 2 ? 0.4 : 1}
                    depthTest={false}
                  />
                </mesh>
              </>
            ) : (
              <group position={atTime} renderOrder={7}>
                <mesh raycast={() => null}>
                  <sphereGeometry args={[GHOST_RADIUS, 16, 12]} />
                  <meshBasicMaterial
                    color={path.color}
                    transparent
                    opacity={0.45}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
                  <torusGeometry args={[GHOST_RADIUS + 2, 0.8, 8, 28]} />
                  <meshBasicMaterial
                    color={path.color}
                    transparent
                    opacity={0.9}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            )}
          </group>
        )
      })}
    </>
  )
}
