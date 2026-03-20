import { Grid } from '@react-three/drei'

interface Props {
  sceneCX: number
  sceneCY: number
}

export function SceneEnvironment({ sceneCX, sceneCY }: Props) {
  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[300, 400, 200]} intensity={1.2} />
      <pointLight position={[sceneCX, 120, sceneCY]} intensity={0.4} color="#ffffff" />

      <mesh position={[sceneCX, -0.15, sceneCY]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#040d1a" roughness={1} metalness={0} />
      </mesh>

      <Grid
        position={[sceneCX, 0, sceneCY]}
        args={[500, 500]}
        cellSize={25}
        cellThickness={0.4}
        cellColor="#9ca3af"
        sectionSize={100}
        sectionThickness={0.8}
        sectionColor="#374151"
        fadeDistance={600}
        fadeStrength={1}
      />
    </>
  )
}
