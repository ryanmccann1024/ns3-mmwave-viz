import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Text, Line } from '@react-three/drei'
import type { NodeState } from '../../types'
import {
  NODE_COLORS,
  NODE_SIZES,
  NODE_LABELS,
  NODE_COLOR_INACTIVE,
  NODE_COLOR_DIMMED,
  NODE_COLOR_SELECTED,
  NODE_FAILURE_COLOR,
  MISSION_TARGET_COLOR,
} from '../../styles/tokens'
import { simToThree, lerpNodeToThree } from './utils/coordinates'
import { NodeShape } from './NodeShape'
import { NodeFailureEffect } from './NodeFailureEffect'

interface Props {
  node: NodeState
  nextNode: NodeState | undefined
  /** Shared mutable ref — updated every RAF tick without React re-renders */
  alphaRef: React.MutableRefObject<number>
  selected: boolean
  highlighted: boolean
  dimmed: boolean
  dim: 1 | 2 | 3
  posScale?: number
  /** replaces the type label, e.g. INVESTIGATOR for an investigation's drone */
  role?: string
  /** this node's path colour in the live replay; shown as a ring and on its name */
  trailTint?: string
  /** fixed per-scene enlargement so models read on large sites */
  modelScale?: number
  onClick: () => void
}

export function NodeObject({
  node,
  nextNode,
  alphaRef,
  selected,
  highlighted,
  dimmed,
  dim,
  posScale = 1,
  role,
  trailTint,
  modelScale = 1,
  onClick,
}: Props) {
  const inactive = !node.active
  const size = NODE_SIZES[node.nodeType] * modelScale

  const color = inactive
    ? NODE_COLOR_INACTIVE
    : selected
      ? NODE_COLOR_SELECTED
      : dimmed
        ? NODE_COLOR_DIMMED
        : NODE_COLORS[node.nodeType]

  const emissive = inactive
    ? '#000000'
    : selected
      ? '#60a5fa'
      : highlighted
        ? NODE_COLORS[node.nodeType]
        : '#000000'

  const emissiveIntensity = inactive ? 0 : selected ? 0.8 : highlighted ? 0.4 : dimmed ? 0 : 0.2

  const turns = node.nodeType === 'air' || node.nodeType === 'vehicle'

  const label = NODE_LABELS[node.nodeType]
  const position = simToThree(node.x, node.y, node.z, dim, posScale)

  // Saved frames can be seconds apart: glide toward the next frame every animation frame,
  // imperatively, so the replay moves smoothly without re-rendering React
  const groupRef = useRef<THREE.Group>(null)
  // Heading turns smoothly toward the direction of travel and holds while the node pauses,
  // instead of snapping each frame (which flickered when steps changed direction)
  const yawRef = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return
    const [x, y, z] = lerpNodeToThree(node, nextNode, alphaRef.current, dim, posScale)
    g.position.set(x, y, z)
    const yg = yawRef.current
    if (!turns || !yg || !nextNode) return
    const dx = nextNode.x - node.x
    const dy = nextNode.y - node.y
    if (dx * dx + dy * dy < 1e-4) return
    const target = Math.atan2(dx, dy)
    const diff = Math.atan2(Math.sin(target - yg.rotation.y), Math.cos(target - yg.rotation.y))
    yg.rotation.y += diff * Math.min(1, dt * 5)
  })

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {selected && !inactive && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size + 3, 0.6, 8, 32]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.6} />
        </mesh>
      )}

      {trailTint && !inactive && (
        // ring in the node's path colour, so each node pairs with its trail at a glance
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[size * 1.15, size * 0.08, 8, 40]} />
          <meshBasicMaterial color={trailTint} transparent opacity={dimmed ? 0.3 : 0.95} />
        </mesh>
      )}

      <group ref={yawRef}>
        <group scale={modelScale}>
          <NodeShape
            nodeType={node.nodeType}
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            seed={node.id}
          />
        </group>
        {inactive && (
          <mesh>
            <sphereGeometry args={[size * 1.3, 8, 8]} />
            <meshBasicMaterial color="#334155" transparent opacity={0.18} depthWrite={false} />
          </mesh>
        )}
      </group>

      <NodeFailureEffect active={!inactive} size={size} />

      <Text
        position={[0, size + 5, 0]}
        fontSize={5}
        color={inactive ? '#475569' : dimmed ? '#334155' : (trailTint ?? '#f1f5f9')}
        anchorX="center"
        anchorY="middle"
        renderOrder={1}
        depthOffset={-1}
        raycast={() => null}
      >
        {node.name ?? String(node.id)}
      </Text>
      <Text
        position={[0, size + 10, 0]}
        fontSize={inactive ? 4 : 3}
        color={
          inactive
            ? NODE_FAILURE_COLOR
            : dimmed
              ? '#1e293b'
              : role
                ? MISSION_TARGET_COLOR
                : NODE_COLORS[node.nodeType]
        }
        anchorX="center"
        anchorY="middle"
        renderOrder={1}
        depthOffset={-1}
        raycast={() => null}
      >
        {inactive ? 'OFFLINE' : (role ?? label)}
      </Text>

      {node.nodeType === 'air' && node.z > 2 && !inactive && dim !== 2 && (
        <Line
          points={[
            [0, 0, 0],
            [0, -node.z, 0],
          ]}
          color="#fbbf24"
          lineWidth={1}
          dashed
          dashSize={4}
          gapSize={3}
          transparent
          opacity={0.35}
        />
      )}
    </group>
  )
}
