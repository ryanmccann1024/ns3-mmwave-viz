import type { BuildingState } from '../../types'
import { simToThree } from './utils/coordinates'

interface Props {
  building: BuildingState
  dim: 1 | 2 | 3
  posScale?: number
}

/**
 * Renders a building as a semi-transparent box sitting on the ground plane.
 * `building.z` is the base (bottom) in sim Z — usually 0.
 * In 2D mode buildings are flattened to a thin footprint indicator.
 */
export function BuildingObject({ building, dim, posScale = 1 }: Props) {
  const { x, y, z, width, depth, height } = building
  const threeHeight = dim === 2 ? 0.5 : height
  const scaledWidth = width * posScale
  const scaledDepth = depth * posScale

  // Building sits on the ground: centre is at base + half height
  const baseZ = dim === 2 ? 0 : z
  const [cx, groundY, cz] = simToThree(x, y, baseZ, dim, posScale)
  const centreY = groundY + threeHeight / 2

  return (
    <group position={[cx, centreY, cz]}>
      {/* Solid walls — muted, semi-transparent */}
      <mesh>
        <boxGeometry args={[scaledWidth, threeHeight, scaledDepth]} />
        <meshStandardMaterial
          color="#334155"
          transparent
          opacity={dim === 2 ? 0.4 : 0.55}
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Wireframe edges for legibility */}
      <mesh>
        <boxGeometry args={[scaledWidth, threeHeight, scaledDepth]} />
        <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.35} />
      </mesh>
    </group>
  )
}
