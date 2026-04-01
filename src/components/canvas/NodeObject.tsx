import * as THREE from 'three'
import { Text, Line } from '@react-three/drei'
import type { NodeState } from '../../types'
import {
  NODE_COLORS,
  NODE_SIZES,
  NODE_LABELS,
  NODE_COLOR_INACTIVE,
  NODE_COLOR_DIMMED,
  NODE_COLOR_SELECTED,
} from '../../styles/tokens'
import { simToThree, headingRotation } from './utils/coordinates'
import { NodeShape } from './NodeShape'

interface Props {
  node: NodeState
  nextNode: NodeState | undefined
  /** Shared mutable ref — updated every RAF tick without React re-renders */
  alphaRef: React.MutableRefObject<number>
  selected: boolean
  highlighted: boolean
  dimmed: boolean
  dim: 1 | 2 | 3
  onClick: () => void
}

export function NodeObject({
  node,
  nextNode,
  alphaRef: _alphaRef,
  selected,
  highlighted,
  dimmed,
  dim,
  onClick,
}: Props) {
  const inactive = !node.active
  const size = NODE_SIZES[node.nodeType]

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

  const rotation =
    node.nodeType === 'air' || node.nodeType === 'vehicle'
      ? headingRotation(node, nextNode, dim)
      : new THREE.Euler(0, 0, 0)

  const label = NODE_LABELS[node.nodeType]
  const position = simToThree(node.x, node.y, node.z, dim)

  return (
    <group
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

      <group rotation={rotation}>
        <NodeShape
          nodeType={node.nodeType}
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
        {inactive && (
          <mesh>
            <sphereGeometry args={[size * 1.3, 8, 8]} />
            <meshBasicMaterial color="#334155" transparent opacity={0.18} depthWrite={false} />
          </mesh>
        )}
      </group>

      <Text
        position={[0, size + 5, 0]}
        fontSize={5}
        color={inactive ? '#475569' : dimmed ? '#334155' : '#f1f5f9'}
        anchorX="center"
        anchorY="middle"
        renderOrder={1}
        depthOffset={-1}
        raycast={() => null}
      >
        {String(node.id)}
      </Text>
      <Text
        position={[0, size + 10, 0]}
        fontSize={3}
        color={inactive ? '#475569' : dimmed ? '#1e293b' : NODE_COLORS[node.nodeType]}
        anchorX="center"
        anchorY="middle"
        renderOrder={1}
        depthOffset={-1}
        raycast={() => null}
      >
        {inactive ? 'OFFLINE' : label}
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
