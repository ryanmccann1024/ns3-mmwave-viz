import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { RouteState, NodeState, FlowState } from '../../types'
import { simToThree } from './utils/coordinates'

interface Props {
  route: RouteState
  flow: FlowState | undefined
  nodeMap: Map<number, NodeState>
  dim: 1 | 2 | 3
  flowIndex: number
  posScale?: number
}

const PULSE_COUNT = 3
const MIN_RADIUS = 1.0
const MAX_RADIUS = 3.5
const MAX_DEMAND = 500 // Mbps cap for scaling
const MIN_SPEED = 0.002
const MAX_SPEED = 0.02
const Y_OFFSET_BASE = 2
const Y_OFFSET_STEP = 2.5

// Distinct colors per flow so multiple flows on the same link are distinguishable
const FLOW_PALETTE = [
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#10b981', // emerald
  '#a855f7', // purple
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#ec4899', // pink
]

export function TrafficFlow({ route, flow, nodeMap, dim, flowIndex, posScale = 1 }: Props) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const progressRef = useRef<number[]>(
    Array.from({ length: PULSE_COUNT }, (_, i) => i / PULSE_COUNT)
  )

  const yOffset = Y_OFFSET_BASE + flowIndex * Y_OFFSET_STEP

  // Build polyline path from route node IDs
  const pathPositions: THREE.Vector3[] = []
  for (const nodeId of route.path) {
    const node = nodeMap.get(nodeId)
    if (node) {
      const [x, y, z] = simToThree(node.x, node.y, node.z, dim, posScale)
      pathPositions.push(new THREE.Vector3(x, y + yOffset, z))
    }
  }

  // Compute cumulative distances along the path
  const segLengths: number[] = []
  let totalLength = 0
  for (let i = 1; i < pathPositions.length; i++) {
    const d = pathPositions[i].distanceTo(pathPositions[i - 1])
    segLengths.push(d)
    totalLength += d
  }

  const color = FLOW_PALETTE[flowIndex % FLOW_PALETTE.length]
  const demand = flow?.demandMbps ?? 0
  const delivered = flow?.deliveredMbps ?? 0
  const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.min(demand / MAX_DEMAND, 1)
  const pulseSpeed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.min(delivered / MAX_DEMAND, 1)
  // Dim opacity when delivery is poor
  const deliveryRatio = demand > 0 ? delivered / demand : 0
  const opacity = deliveryRatio > 0.4 ? 0.85 : 0.5

  useFrame(() => {
    if (totalLength === 0 || pathPositions.length < 2) return

    for (let p = 0; p < PULSE_COUNT; p++) {
      progressRef.current[p] = (progressRef.current[p] + pulseSpeed) % 1

      const targetDist = progressRef.current[p] * totalLength
      let accum = 0
      for (let i = 0; i < segLengths.length; i++) {
        if (accum + segLengths[i] >= targetDist) {
          const t = (targetDist - accum) / segLengths[i]
          const pos = pathPositions[i].clone().lerp(pathPositions[i + 1], t)
          const mesh = meshRefs.current[p]
          if (mesh) {
            mesh.position.copy(pos)
          }
          break
        }
        accum += segLengths[i]
      }
    }
  })

  if (pathPositions.length < 2 || totalLength === 0) return null

  return (
    <group>
      {Array.from({ length: PULSE_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el
          }}
          position={pathPositions[0]}
        >
          <sphereGeometry args={[radius, 8, 6]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.6}
            transparent
            opacity={opacity}
          />
        </mesh>
      ))}
    </group>
  )
}
