import { Grid } from '@react-three/drei'

interface Props {
  sceneCX: number
  sceneCY: number
  gridSize: number
  planeSize: number
}

export function SceneEnvironment({ sceneCX, sceneCY, gridSize, planeSize }: Props) {
  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[300, 400, 200]} intensity={1.2} />
      <pointLight position={[sceneCX, 120, sceneCY]} intensity={0.4} color="#ffffff" />

      <mesh position={[sceneCX, -0.15, sceneCY]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshStandardMaterial color="#040d1a" roughness={1} metalness={0} />
      </mesh>

      <Grid
        position={[sceneCX, 0, sceneCY]}
        args={[gridSize, gridSize]}
        cellSize={Math.max(25, gridSize / 20)}
        cellThickness={0.4}
        cellColor="#9ca3af"
        sectionSize={Math.max(100, gridSize / 5)}
        sectionThickness={0.8}
        sectionColor="#374151"
        fadeDistance={gridSize * 1.5}
        fadeStrength={1}
      />
    </>
  )
}
