import { Text, Line } from '@react-three/drei'
import type { LinkState, NodeState } from '../../types'
import { interpPos } from './utils/coordinates'
import { linkColor } from './utils/linkColors'
import { NlosBlocker } from './NlosBlocker'

interface Props {
  link: LinkState
  nodeA: NodeState
  nodeB: NodeState
  nextA: NodeState | undefined
  nextB: NodeState | undefined
  alpha: number
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
  nextA,
  nextB,
  alpha,
  selected,
  highlighted,
  dimmed,
  dim,
  onClick,
}: Props) {
  const posA = interpPos(nodeA, nextA, alpha, dim)
  const posB = interpPos(nodeB, nextB, alpha, dim)
  const color = linkColor(link)
  const opacity = dimmed ? 0.06 : 1
  const isLos = link.condition === 'LOS'
  const width = selected ? 4 : highlighted ? 3 : isLos ? 2.5 : 1.5
  const mid: [number, number, number] = [
    (posA[0] + posB[0]) / 2,
    (posA[1] + posB[1]) / 2,
    (posA[2] + posB[2]) / 2,
  ]

  return (
    <group>
      <Line
        points={[posA, posB]}
        color={color}
        lineWidth={width}
        dashed={!isLos}
        dashSize={10}
        gapSize={6}
        transparent
        opacity={opacity}
      />

      {!isLos && link.connected && <NlosBlocker posA={posA} posB={posB} dimmed={dimmed} />}

      {(selected || highlighted) && !dimmed && (
        <Text
          position={[mid[0], mid[1] + 6, mid[2]]}
          fontSize={4}
          color={color}
          anchorX="center"
          anchorY="middle"
          renderOrder={2}
          depthOffset={-2}
          raycast={() => null}
        >
          {`${link.condition}  ${link.rxPower.toFixed(1)} dBm`}
        </Text>
      )}

      <mesh
        position={mid}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <sphereGeometry args={[7, 6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
