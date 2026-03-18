import * as THREE from 'three'

interface Props {
  posA: [number, number, number]
  posB: [number, number, number]
  dimmed: boolean
}

export function NlosBlocker({ posA, posB, dimmed }: Props) {
  const mid: [number, number, number] = [
    (posA[0] + posB[0]) / 2,
    (posA[1] + posB[1]) / 2,
    (posA[2] + posB[2]) / 2,
  ]
  const dx = posB[0] - posA[0]
  const dz = posB[2] - posA[2]
  const angle = Math.atan2(dx, dz)

  return (
    <mesh position={mid} rotation={[0, angle, 0]}>
      <planeGeometry args={[14, 18]} />
      <meshBasicMaterial
        color="#f97316"
        transparent
        opacity={dimmed ? 0.03 : 0.16}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
