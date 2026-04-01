import { useRef, useMemo, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import type { LinkState, NodeState } from '../../types'
import { simToThree } from './utils/coordinates'
import { linkColor } from './utils/linkColors'

// We use a raw THREE.Line with LineDashedMaterial so positions can be
// updated imperatively without going through React state.

interface Props {
  link: LinkState
  nodeA: NodeState
  nodeB: NodeState
  nextA: NodeState | undefined
  nextB: NodeState | undefined
  /** Shared mutable ref — updated every RAF tick without React re-renders */
  alphaRef: React.MutableRefObject<number>
  selected: boolean
  highlighted: boolean
  dimmed: boolean
  dim: 1 | 2 | 3
  posScale?: number
  onClick: () => void
}

export function LinkObject({
  link,
  nodeA,
  nodeB,
  nextA: _nextA,
  nextB: _nextB,
  alphaRef: _alphaRef,
  selected,
  highlighted,
  dimmed,
  dim,
  posScale = 1,
  onClick,
}: Props) {
  const lineRef = useRef<THREE.Line>(null)
  const midMeshRef = useRef<THREE.Mesh>(null)

  const color = linkColor(link)
  const opacity = dimmed ? 0.06 : 1
  const isLos = link.condition === 'LOS'
  const lineWidth = selected ? 3 : highlighted ? 2.5 : isLos ? 2 : 1.5

  // Create geometry and line object once
  const lineObj = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return new THREE.Line(g)
  }, [])

  // Update line endpoints when node positions change (per frame tick, not 60fps)
  useLayoutEffect(() => {
    if (!lineRef.current) return
    const posA = simToThree(nodeA.x, nodeA.y, nodeA.z, dim, posScale)
    const posB = simToThree(nodeB.x, nodeB.y, nodeB.z, dim, posScale)
    const arr = lineRef.current.geometry.attributes.position.array as Float32Array
    arr[0] = posA[0]
    arr[1] = posA[1]
    arr[2] = posA[2]
    arr[3] = posB[0]
    arr[4] = posB[1]
    arr[5] = posB[2]
    lineRef.current.geometry.attributes.position.needsUpdate = true

    if (!isLos) {
      lineRef.current.computeLineDistances()
    }

    if (midMeshRef.current) {
      midMeshRef.current.position.set(
        (posA[0] + posB[0]) / 2,
        (posA[1] + posB[1]) / 2,
        (posA[2] + posB[2]) / 2
      )
    }
  })

  return (
    <group>
      <primitive ref={lineRef} object={lineObj}>
        {isLos ? (
          <lineBasicMaterial color={color} transparent opacity={opacity} linewidth={lineWidth} />
        ) : (
          <lineDashedMaterial
            color={color}
            transparent
            opacity={opacity}
            linewidth={lineWidth}
            dashSize={10}
            gapSize={6}
          />
        )}
      </primitive>

      {/* Invisible hit sphere at midpoint for click detection */}
      <mesh
        ref={midMeshRef}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <sphereGeometry args={[7, 6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {(selected || highlighted) && !dimmed && (
        <LabelAtMid
          nodeA={nodeA}
          nodeB={nodeB}
          dim={dim}
          posScale={posScale}
          color={color}
          link={link}
        />
      )}
    </group>
  )
}

// -------------------------------------------------------------------------
// Label positioned at link midpoint — only mounted when visible
// -------------------------------------------------------------------------
function LabelAtMid({
  nodeA,
  nodeB,
  dim,
  posScale = 1,
  color,
  link,
}: {
  nodeA: NodeState
  nodeB: NodeState
  dim: 1 | 2 | 3
  posScale?: number
  color: string
  link: LinkState
}) {
  const posA = simToThree(nodeA.x, nodeA.y, nodeA.z, dim, posScale)
  const posB = simToThree(nodeB.x, nodeB.y, nodeB.z, dim, posScale)
  const midPos: [number, number, number] = [
    (posA[0] + posB[0]) / 2,
    (posA[1] + posB[1]) / 2 + 6,
    (posA[2] + posB[2]) / 2,
  ]

  const sinrPart = link.sinr !== undefined ? `  ${link.sinr.toFixed(1)} dB` : ''
  const connPart = !link.connected ? ' (no capacity)' : ''

  return (
    <group position={midPos}>
      <Text
        fontSize={4}
        color={color}
        anchorX="center"
        anchorY="middle"
        renderOrder={2}
        depthOffset={-2}
        raycast={() => null}
      >
        {`${link.condition}${connPart}${sinrPart}`}
      </Text>
    </group>
  )
}
