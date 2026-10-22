import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { BuildingState } from '../../types'
import { getScenarioTheme } from '../../styles/scenarioThemes'
import { simToThree } from './utils/coordinates'
import {
  facadeTexture,
  roofTexture,
  INDOOR_FACADES,
  RURAL_FACADES,
  URBAN_FACADES,
  TILE_H,
  TILE_W,
} from './utils/facades'

interface Props {
  building: BuildingState
  dim: 1 | 2 | 3
  posScale?: number
  scenario?: string
}

const WALL_OPACITY = 0.62
const PARAPET_H = 1.1

/** Stable per-building pick so the same block keeps its look across frames and reloads */
function hash(n: number) {
  let h = (n + 1) * 2654435761
  h ^= h >>> 13
  return Math.abs(h)
}

/**
 * A translucent building: textured facades sized to real floors and window bays,
 * a gravel roof with a parapet, and a crisp outline. Walls don't write
 * depth, so nodes and links behind or inside stay visible, but they still cast shadows.
 * `building.z` is the base in sim Z — usually 0. In 2D mode it's a flat footprint.
 */
export function BuildingObject({ building, dim, posScale = 1, scenario = '' }: Props) {
  const { id, x, y, z, width, depth, height } = building
  const theme = getScenarioTheme(scenario)
  const palette =
    theme.site === 'rural'
      ? RURAL_FACADES
      : theme.site === 'indoor'
        ? INDOOR_FACADES
        : URBAN_FACADES
  const style = palette[hash(id) % palette.length]
  const flat = dim === 2
  // scale height with the footprint so compact mode keeps true proportions (node altitudes scale too)
  const threeHeight = flat ? 0.5 : height * posScale
  const w = width * posScale
  const d = depth * posScale

  const baseZ = flat ? 0 : z
  const [cx, groundY, cz] = simToThree(x, y, baseZ, dim, posScale)
  const centreY = groundY + threeHeight / 2

  const geometry = useMemo(() => new THREE.BoxGeometry(w, threeHeight, d), [w, threeHeight, d])
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry])

  // Box face order: +x, -x, +y, -y, +z, -z
  const materials = useMemo(() => {
    const wall = (span: number) => {
      const map = facadeTexture(style.kind).clone()
      map.repeat.set(span / TILE_W, height / TILE_H)
      // anchor the pattern at ground level so floors start at the base
      map.offset.set(0, 0)
      map.needsUpdate = true
      return new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        opacity: WALL_OPACITY,
        depthWrite: false,
        roughness: style.kind === 'glass' ? 0.25 : 0.8,
        metalness: style.kind === 'glass' ? 0.5 : 0.05,
        envMapIntensity: style.kind === 'glass' ? 1.4 : 0.6,
        side: THREE.DoubleSide,
      })
    }
    const roofMap = roofTexture(style.roof).clone()
    roofMap.repeat.set(width / 16, depth / 16)
    roofMap.needsUpdate = true
    const roof = new THREE.MeshStandardMaterial({
      map: roofMap,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      roughness: 0.95,
    })
    if (flat) {
      const top = new THREE.MeshStandardMaterial({
        color: style.parapet,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      })
      return [top, top, top, top, top, top]
    }
    const sideX = wall(depth)
    const sideZ = wall(width)
    return [sideX, sideX, roof, roof, sideZ, sideZ]
  }, [style, width, depth, height, flat])

  useEffect(
    () => () => {
      geometry.dispose()
      edges.dispose()
    },
    [geometry, edges]
  )
  useEffect(
    () => () => {
      for (const m of new Set(materials)) {
        m.map?.dispose()
        m.dispose()
      }
    },
    [materials]
  )

  const top = threeHeight / 2
  const parapetH = PARAPET_H * posScale
  const t = 0.3 * posScale
  return (
    <group position={[cx, centreY, cz]}>
      <mesh geometry={geometry} material={materials} renderOrder={1} castShadow />
      <lineSegments geometry={edges} renderOrder={2}>
        <lineBasicMaterial color={style.edge} transparent opacity={0.7} />
      </lineSegments>

      {!flat && (
        <>
          {/* parapet: four low walls around the roof edge */}
          {(
            [
              [0, d / 2 - t / 2, w, t],
              [0, -d / 2 + t / 2, w, t],
              [w / 2 - t / 2, 0, t, d],
              [-w / 2 + t / 2, 0, t, d],
            ] as const
          ).map(([px, pz, pw, pd], i) => (
            <mesh key={i} position={[px, top + parapetH / 2, pz]} castShadow>
              <boxGeometry args={[pw, parapetH, pd]} />
              <meshStandardMaterial
                color={style.parapet}
                transparent
                opacity={0.8}
                depthWrite={false}
                roughness={0.8}
              />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}
