import { Line, Text } from '@react-three/drei'
import type { BaselinePlan } from '../../lib/baselineManifest'
import { simToThree } from './utils/coordinates'

interface Props {
  plan: BaselinePlan
  dimensions: 1 | 2 | 3
  posScale: number
}

/** Ghosts the pre-planner positions; live nodes remain at their planned positions. */
export function PlacementLayer({ plan, dimensions, posScale }: Props) {
  return (
    <group>
      {plan.nodes
        .filter(
          (node) =>
            node.selected && node.original && node.planned && (node.displacementM ?? 0) > 0.01
        )
        .map((node) => {
          if (!node.original || !node.planned) return null
          const before = simToThree(
            node.original.x,
            node.original.y,
            node.original.z,
            dimensions,
            posScale
          )
          const after = simToThree(
            node.planned.x,
            node.planned.y,
            node.planned.z,
            dimensions,
            posScale
          )
          return (
            <group key={node.id}>
              <Line
                points={[before, after]}
                color="#60a5fa"
                lineWidth={2}
                dashed
                dashSize={5}
                gapSize={3}
                transparent
                opacity={0.9}
              />
              <group position={before}>
                <mesh>
                  <sphereGeometry args={[4, 12, 12]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.8} depthWrite={false} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[7, 1.5, 8, 28]} />
                  <meshBasicMaterial color="#60a5fa" />
                </mesh>
                <Text
                  position={[0, 13, 0]}
                  fontSize={5}
                  color="#dbeafe"
                  anchorX="center"
                  anchorY="middle"
                  raycast={() => null}
                >
                  {`${node.id} before`}
                </Text>
              </group>
              <Text
                position={[after[0], after[1] + 15, after[2]]}
                fontSize={5}
                color="#93c5fd"
                anchorX="center"
                anchorY="middle"
                raycast={() => null}
              >
                {`${node.id} placed`}
              </Text>
            </group>
          )
        })}
    </group>
  )
}
