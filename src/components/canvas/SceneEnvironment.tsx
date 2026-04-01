import { useMemo } from 'react'
import { Grid, Environment } from '@react-three/drei'
import { getScenarioTheme } from '../../styles/scenarioThemes'
import { generateGroundTexture } from './utils/groundTexture'
import { SceneryObjects } from './SceneryObjects'

interface Props {
  sceneCX: number
  sceneCY: number
  gridSize: number
  planeSize: number
  scenario?: string
}

export function SceneEnvironment({ sceneCX, sceneCY, gridSize, planeSize, scenario = '' }: Props) {
  const theme = useMemo(() => getScenarioTheme(scenario), [scenario])

  const groundTexture = useMemo(
    () => generateGroundTexture(theme.groundTexture, theme.groundColor, planeSize),
    [theme.groundTexture, theme.groundColor, planeSize]
  )

  return (
    <>
      <ambientLight intensity={theme.ambientIntensity} color={theme.ambientColor} />
      <directionalLight
        position={[300, 400, 200]}
        intensity={theme.directionalIntensity}
        color={theme.directionalColor}
      />
      <pointLight
        position={[sceneCX, 120, sceneCY]}
        intensity={theme.pointIntensity}
        color="#ffffff"
      />

      {theme.environmentPreset && (
        <Environment
          preset={theme.environmentPreset}
          background
          backgroundBlurriness={theme.backgroundBlurriness}
          environmentIntensity={theme.environmentIntensity}
        />
      )}

      <mesh position={[sceneCX, -0.15, sceneCY]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshStandardMaterial
          map={groundTexture}
          color={theme.groundColor}
          roughness={1}
          metalness={0}
        />
      </mesh>

      <Grid
        position={[sceneCX, 0, sceneCY]}
        args={[gridSize, gridSize]}
        cellSize={Math.max(25, gridSize / 20)}
        cellThickness={0.4}
        cellColor={theme.gridCellColor}
        sectionSize={Math.max(100, gridSize / 5)}
        sectionThickness={0.8}
        sectionColor={theme.gridSectionColor}
        fadeDistance={gridSize * 1.5}
        fadeStrength={1}
      />

      <SceneryObjects sceneCX={sceneCX} sceneCY={sceneCY} gridSize={gridSize} theme={theme} />
    </>
  )
}
