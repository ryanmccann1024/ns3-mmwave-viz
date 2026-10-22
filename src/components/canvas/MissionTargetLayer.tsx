import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import type { NodeState } from '../../types'
import { distanceToTarget, type InvestigationTarget } from '../../lib/missionTarget'
import { MISSION_REACHED_COLOR, MISSION_TARGET_COLOR } from '../../styles/tokens'
import { lerpNodeToThree, simToThree } from './utils/coordinates'

interface Props {
  target: InvestigationTarget
  /** the investigator in the current and next frame, when it maps to a CSV node */
  investigator: NodeState | undefined
  nextInvestigator: NodeState | undefined
  alphaRef: React.MutableRefObject<number>
  dim: 1 | 2 | 3
  posScale: number
}

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]
const PIN_HEIGHT = 30
/** just above the ground plane (-0.15) so the discs never z-fight with it */
const LIFT = 0.4

/**
 * The investigation goal on the ground: the arrival zone, the coverage ring around it, a pin
 * with a label, and a dashed guide line from the investigator. Turns green once the
 * investigator is inside the arrival zone.
 */
export function MissionTargetLayer({
  target,
  investigator,
  nextInvestigator,
  alphaRef,
  dim,
  posScale,
}: Props) {
  const [gx, , gz] = simToThree(target.x, target.y, 0, dim, posScale)
  const arrival = target.arrivalRadiusM * posScale
  const coverage = target.coverageRadiusM * posScale
  const reached =
    investigator !== undefined &&
    target.arrivalRadiusM > 0 &&
    distanceToTarget(investigator, target) <= target.arrivalRadiusM
  const color = reached ? MISSION_REACHED_COLOR : MISSION_TARGET_COLOR

  // One two-point dashed line from the investigator to the goal, created once and moved on
  // every commit and every animation frame as the investigator glides between saved frames
  const guideRef = useRef<THREE.Line>(null)
  const guideObj = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return new THREE.Line(g)
  }, [])
  const place = () => {
    const line = guideRef.current
    if (!line) return
    line.visible = investigator !== undefined && !reached
    if (!line.visible || !investigator) return
    const [x, y, z] = lerpNodeToThree(
      investigator,
      nextInvestigator,
      alphaRef.current,
      dim,
      posScale
    )
    const arr = line.geometry.attributes.position.array as Float32Array
    arr[0] = x
    arr[1] = y
    arr[2] = z
    arr[3] = gx
    arr[4] = LIFT
    arr[5] = gz
    line.geometry.attributes.position.needsUpdate = true
    line.computeLineDistances()
  }
  useLayoutEffect(place)
  useFrame(place)

  const surface = {
    color,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  } as const

  return (
    <group>
      <group position={[gx, LIFT, gz]}>
        {coverage > 0 && (
          <>
            <mesh rotation={FLAT} raycast={() => null}>
              <circleGeometry args={[coverage, 96]} />
              <meshBasicMaterial {...surface} opacity={0.07} />
            </mesh>
            <mesh rotation={FLAT} raycast={() => null}>
              <ringGeometry args={[Math.max(0, coverage - 1), coverage, 96]} />
              <meshBasicMaterial {...surface} opacity={0.55} />
            </mesh>
          </>
        )}
        {arrival > 0 && (
          <>
            <mesh rotation={FLAT} raycast={() => null}>
              <circleGeometry args={[arrival, 64]} />
              <meshBasicMaterial {...surface} opacity={0.22} />
            </mesh>
            <mesh rotation={FLAT} raycast={() => null}>
              <ringGeometry args={[Math.max(0, arrival - 1.2), arrival, 64]} />
              <meshBasicMaterial {...surface} opacity={0.95} />
            </mesh>
          </>
        )}
        {dim === 3 && (
          <>
            <mesh position={[0, PIN_HEIGHT / 2, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.5, 0.5, PIN_HEIGHT, 8]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            <mesh position={[0, PIN_HEIGHT, 0]} raycast={() => null}>
              <sphereGeometry args={[2.2, 16, 12]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          </>
        )}
        <Text
          position={[0, (dim === 3 ? PIN_HEIGHT : 0) + 7, 0]}
          fontSize={5}
          color={color}
          anchorX="center"
          anchorY="middle"
          renderOrder={1}
          depthOffset={-1}
          raycast={() => null}
        >
          {reached ? 'TARGET REACHED' : 'TARGET'}
        </Text>
      </group>
      <primitive ref={guideRef} object={guideObj} raycast={() => null}>
        <lineDashedMaterial
          color={color}
          transparent
          opacity={0.85}
          depthWrite={false}
          toneMapped={false}
          dashSize={4}
          gapSize={3}
        />
      </primitive>
    </group>
  )
}
