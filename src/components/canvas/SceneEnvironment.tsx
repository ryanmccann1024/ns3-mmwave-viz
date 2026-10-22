import { useMemo } from 'react'
import * as THREE from 'three'
import { Grid, Environment, Line } from '@react-three/drei'
import type { BuildingState } from '../../types'
import { getScenarioTheme } from '../../styles/scenarioThemes'
import { generateGroundTexture } from './utils/groundTexture'
import { generateSiteTexture } from './utils/siteGround'
import { SceneryObjects } from './SceneryObjects'
import { simToThree } from './utils/coordinates'
import type { SceneBounds } from '../../hooks/useSimData'

interface Props {
  sceneCX: number
  sceneCY: number
  gridSize: number
  planeSize: number
  scenario?: string
  extent?: SceneBounds['extent']
  buildings?: BuildingState[]
  posScale?: number
  dim?: 1 | 2 | 3
}

/** Late-morning sun: high enough for short readable shadows, low enough to model the blocks */
const SUN_DIR: [number, number, number] = [0.45, 0.75, 0.35]

export function SceneEnvironment({
  sceneCX,
  sceneCY,
  gridSize,
  planeSize,
  scenario = '',
  extent,
  buildings = [],
  posScale = 1,
  dim = 3,
}: Props) {
  const theme = useMemo(() => getScenarioTheme(scenario), [scenario])
  const site = theme.site

  const groundTexture = useMemo(() => {
    if (!site) return generateGroundTexture(theme.groundTexture, theme.groundColor, planeSize)
    return generateSiteTexture({
      style: site,
      cx: sceneCX / posScale,
      cy: sceneCY / posScale,
      size: planeSize / posScale,
      buildings,
      extent,
    })
  }, [
    site,
    theme.groundTexture,
    theme.groundColor,
    planeSize,
    sceneCX,
    sceneCY,
    posScale,
    buildings,
    extent,
  ])

  // Faint outline of the simulated area, a little proud of the ground
  const boundary = useMemo(() => {
    if (!extent || dim === 1) return null
    const { minX, maxX, minY, maxY } = extent
    if (maxX - minX < 1 && maxY - minY < 1) return null
    const corner = (sx: number, sy: number) => {
      const [tx, , tz] = simToThree(sx, sy, 0, dim, posScale)
      return [tx, 0.08, tz] as [number, number, number]
    }
    return [
      corner(minX, minY),
      corner(maxX, minY),
      corner(maxX, maxY),
      corner(minX, maxY),
      corner(minX, minY),
    ]
  }, [extent, dim, posScale])

  const outdoor = site === 'urban' || site === 'rural'
  const sunDist = gridSize * 1.2
  const sunPos: [number, number, number] = [
    sceneCX + SUN_DIR[0] * sunDist,
    SUN_DIR[1] * sunDist,
    sceneCY + SUN_DIR[2] * sunDist,
  ]
  const half = (planeSize / 2) * 1.05

  return (
    <>
      {site ? (
        <>
          <hemisphereLight
            args={[
              outdoor ? '#dbe8f5' : '#ffffff',
              site === 'rural' ? '#4a5a30' : '#5b5650',
              outdoor ? 0.9 : 1.2,
            ]}
          />
          <directionalLight
            position={sunPos}
            intensity={outdoor ? 2.2 : 0.6}
            color={outdoor ? '#fff4e0' : '#ffffff'}
            castShadow
            shadow-mapSize={[4096, 4096]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.6}
            shadow-camera-left={-half}
            shadow-camera-right={half}
            shadow-camera-top={half}
            shadow-camera-bottom={-half}
            shadow-camera-near={1}
            shadow-camera-far={sunDist * 3}
          >
            <object3D attach="target" position={[sceneCX, 0, sceneCY]} />
          </directionalLight>
          {outdoor && (
            <>
              <SkyDome
                radius={gridSize * 2}
                centre={[sceneCX, 0, sceneCY]}
                horizon={site === 'urban' ? '#d5dee6' : '#dbe6ee'}
              />
              {/* aerial haze blends the far ground into the horizon */}
              <fog
                attach="fog"
                args={[site === 'urban' ? '#d5dee6' : '#dbe6ee', gridSize * 1.2, gridSize * 3]}
              />
            </>
          )}
          {theme.environmentPreset && (
            <Environment preset={theme.environmentPreset} environmentIntensity={0.35} />
          )}
        </>
      ) : (
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
        </>
      )}

      <mesh position={[sceneCX, -0.15, sceneCY]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshStandardMaterial
          map={groundTexture}
          color={site ? '#ffffff' : theme.groundColor}
          roughness={0.95}
          metalness={0}
        />
      </mesh>

      {/* land beyond the modelled plane, so the horizon isn't a cliff edge */}
      {outdoor && (
        // well below the site plane so the two never z-fight
        <mesh position={[sceneCX, -2, sceneCY]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[planeSize * 8, planeSize * 8]} />
          <meshStandardMaterial color={site === 'rural' ? '#6a8a45' : '#4a4c50'} roughness={1} />
        </mesh>
      )}

      {!site && (
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
      )}

      {boundary && (
        <Line
          points={boundary}
          color={theme.boundaryColor}
          lineWidth={1.5}
          dashed
          dashSize={Math.max(2, gridSize / 100)}
          gapSize={Math.max(1.5, gridSize / 160)}
          transparent
          opacity={0.55}
        />
      )}

      {/* outdoor sites are framed by their painted ground; filler props only clutter it */}
      {!outdoor && (
        <SceneryObjects sceneCX={sceneCX} sceneCY={sceneCY} gridSize={gridSize} theme={theme} />
      )}
    </>
  )
}

/** Clear daytime sky: deep blue overhead fading to a pale horizon that matches the fog */
function SkyDome({
  radius,
  centre,
  horizon,
}: {
  radius: number
  centre: [number, number, number]
  horizon: string
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color('#2f6fd0') },
          mid: { value: new THREE.Color('#79aee8') },
          bottom: { value: new THREE.Color(horizon) },
        },
        vertexShader: `varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vDir;
          void main() {
            float h = max(vDir.y, 0.0);
            vec3 c = mix(bottom, mid, smoothstep(0.0, 0.08, h));
            c = mix(c, top, smoothstep(0.08, 0.5, h));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [horizon]
  )
  return (
    <mesh position={centre} material={material} renderOrder={-1}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  )
}
