import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import type { LinkState, NodeState } from '../../types'
import { interpPos } from './utils/coordinates'
import { linkColor } from './utils/linkColors'

// We use a raw THREE.Line with LineDashedMaterial so positions can be
// updated imperatively via useFrame without going through React state.

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
  onClick,
}: Props) {
  const lineRef = useRef<THREE.Line>(null)
  const midMeshRef = useRef<THREE.Mesh>(null)

  const color = linkColor(link)
  const opacity = dimmed ? 0.06 : 1
  const isLos = link.condition === 'LOS'
  const lineWidth = selected ? 3 : highlighted ? 2.5 : isLos ? 2 : 1.5

  // Initialise geometry with dummy positions; useFrame keeps it current
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 1, 1),
  ])

  // Imperatively move endpoints every frame
  useFrame(() => {
    const posA = interpPos(nodeA, undefined, 0, dim)
    const posB = interpPos(nodeB, undefined, 0, dim)
    const mid: [number, number, number] = [
      (posA[0] + posB[0]) / 2,
      (posA[1] + posB[1]) / 2,
      (posA[2] + posB[2]) / 2,
    ]

    if (lineRef.current) {
      const arr = lineRef.current.geometry.attributes.position.array as Float32Array
      arr[0] = posA[0]
      arr[1] = posA[1]
      arr[2] = posA[2]
      arr[3] = posB[0]
      arr[4] = posB[1]
      arr[5] = posB[2]
      lineRef.current.geometry.attributes.position.needsUpdate = true
      if (!isLos) {
        ;(lineRef.current as THREE.Line).computeLineDistances()
      }
    }

    if (midMeshRef.current) {
      midMeshRef.current.position.set(mid[0], mid[1], mid[2])
    }
  })

  return (
    <group>
      <primitive
        ref={lineRef}
        object={Object.assign(new THREE.Line(geom), {
          // We return a new Line each render but React reconciles by ref identity
        })}
      >
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
          nextA={_nextA}
          nodeB={nodeB}
          nextB={_nextB}
          alphaRef={_alphaRef}
          dim={dim}
          color={color}
          link={link}
        />
      )}
    </group>
  )
}

// -------------------------------------------------------------------------
// Separate component so useFrame runs only when label is visible
// -------------------------------------------------------------------------
function LabelAtMid({
  nodeA,
  nextA: _nextA,
  nodeB,
  nextB: _nextB,
  alphaRef: _alphaRef,
  dim,
  color,
  link,
}: {
  nodeA: NodeState
  nextA: NodeState | undefined
  nodeB: NodeState
  nextB: NodeState | undefined
  alphaRef: React.MutableRefObject<number>
  dim: 1 | 2 | 3
  color: string
  link: LinkState
}) {
  const textRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!textRef.current) return
    const posA = interpPos(nodeA, undefined, 0, dim)
    const posB = interpPos(nodeB, undefined, 0, dim)
    textRef.current.position.set(
      (posA[0] + posB[0]) / 2,
      (posA[1] + posB[1]) / 2 + 6,
      (posA[2] + posB[2]) / 2
    )
  })

  const sinrPart = link.sinr !== undefined ? `  ${link.sinr.toFixed(1)} dB` : ''

  return (
    <group ref={textRef}>
      <Text
        fontSize={4}
        color={color}
        anchorX="center"
        anchorY="middle"
        renderOrder={2}
        depthOffset={-2}
        raycast={() => null}
      >
        {`${link.condition}${sinrPart}`}
      </Text>
    </group>
  )
}
