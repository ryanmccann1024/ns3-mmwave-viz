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
}

const PULSE_COUNT = 3

function deliveryColor(flow: FlowState | undefined): string {
  if (!flow || flow.demandMbps === 0) return '#9ca3af'
  const ratio = flow.deliveredMbps / flow.demandMbps
  if (ratio > 0.8) return '#16a34a' // green
  if (ratio > 0.4) return '#eab308' // yellow
  return '#dc2626' // red
}

export function TrafficFlow({ route, flow, nodeMap, dim }: Props) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const progressRef = useRef<number[]>(
    Array.from({ length: PULSE_COUNT }, (_, i) => i / PULSE_COUNT)
  )

  // Build polyline path from route node IDs
  const pathPositions: THREE.Vector3[] = []
  for (const nodeId of route.path) {
    const node = nodeMap.get(nodeId)
    if (node) {
      const [x, y, z] = simToThree(node.x, node.y, node.z, dim)
      pathPositions.push(new THREE.Vector3(x, y + 2, z)) // slight offset above links
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

  const color = deliveryColor(flow)
  const pulseSpeed =
    0.005 + (route.bottleneckMbps > 0 ? Math.min(route.bottleneckMbps / 2000, 0.01) : 0)

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
          <sphereGeometry args={[1.8, 8, 6]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.6}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  )
}
