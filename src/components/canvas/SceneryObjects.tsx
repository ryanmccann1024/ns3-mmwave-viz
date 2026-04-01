import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ScenarioTheme } from '../../styles/scenarioThemes'

interface Props {
  sceneCX: number
  sceneCY: number
  gridSize: number
  theme: ScenarioTheme
}

/** Deterministic pseudo-random */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Rural scenery — low-poly trees using InstancedMesh
// ---------------------------------------------------------------------------

function RuralScenery({ sceneCX, sceneCY, gridSize }: Omit<Props, 'theme'>) {
  const count = 60
  const rand = useMemo(() => mulberry32(123), [])
  const margin = gridSize * 0.15
  const extent = gridSize * 0.6

  const { trunkMatrices, foliageMatrices, foliageColors } = useMemo(() => {
    const r = rand
    const tm: THREE.Matrix4[] = []
    const fm: THREE.Matrix4[] = []
    const fc: THREE.Color[] = []

    for (let i = 0; i < count; i++) {
      // Place trees in a ring around the scene edges
      let x: number, z: number
      const side = Math.floor(r() * 4)
      switch (side) {
        case 0: // top edge
          x = sceneCX - extent + r() * extent * 2
          z = sceneCY - extent - margin * r()
          break
        case 1: // bottom edge
          x = sceneCX - extent + r() * extent * 2
          z = sceneCY + extent + margin * r()
          break
        case 2: // left edge
          x = sceneCX - extent - margin * r()
          z = sceneCY - extent + r() * extent * 2
          break
        default: // right edge
          x = sceneCX + extent + margin * r()
          z = sceneCY - extent + r() * extent * 2
          break
      }

      const trunkH = 8 + r() * 12
      const trunkR = 1 + r() * 1.5
      const foliageH = 12 + r() * 18
      const foliageR = 5 + r() * 8

      // Trunk matrix
      const tMat = new THREE.Matrix4()
      tMat.makeTranslation(x, trunkH / 2, z)
      tMat.scale(new THREE.Vector3(trunkR, trunkH, trunkR))
      tm.push(tMat)

      // Foliage matrix (sits on top of trunk)
      const fMat = new THREE.Matrix4()
      fMat.makeTranslation(x, trunkH + foliageH * 0.35, z)
      fMat.scale(new THREE.Vector3(foliageR, foliageH, foliageR))
      fm.push(fMat)

      // Varied greens
      const g = 0.3 + r() * 0.35
      fc.push(new THREE.Color(0.1 + r() * 0.15, g, 0.05 + r() * 0.1))
    }

    return { trunkMatrices: tm, foliageMatrices: fm, foliageColors: fc }
  }, [sceneCX, sceneCY, extent, margin, rand])

  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const foliageRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    if (!trunkRef.current || !foliageRef.current) return
    trunkMatrices.forEach((m, i) => trunkRef.current!.setMatrixAt(i, m))
    foliageMatrices.forEach((m, i) => {
      foliageRef.current!.setMatrixAt(i, m)
      foliageRef.current!.setColorAt(i, foliageColors[i])
    })
    trunkRef.current.instanceMatrix.needsUpdate = true
    foliageRef.current.instanceMatrix.needsUpdate = true
    if (foliageRef.current.instanceColor) foliageRef.current.instanceColor.needsUpdate = true
  }, [trunkMatrices, foliageMatrices, foliageColors])

  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, count]}>
        <cylinderGeometry args={[0.3, 0.5, 1, 6]} />
        <meshStandardMaterial color="#5a3a1a" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={foliageRef} args={[undefined, undefined, count]}>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color="#2d7a28" roughness={0.8} />
      </instancedMesh>
    </>
  )
}

// ---------------------------------------------------------------------------
// Urban scenery — decorative building blocks around perimeter
// ---------------------------------------------------------------------------

function UrbanScenery({
  sceneCX,
  sceneCY,
  gridSize,
  density,
}: Omit<Props, 'theme'> & { density: 'macro' | 'micro' }) {
  const count = density === 'micro' ? 50 : 30
  const rand = useMemo(() => mulberry32(456), [])
  const extent = gridSize * 0.55

  const { matrices, colors } = useMemo(() => {
    const r = rand
    const ms: THREE.Matrix4[] = []
    const cs: THREE.Color[] = []

    for (let i = 0; i < count; i++) {
      let x: number, z: number
      const side = Math.floor(r() * 4)
      const offset = extent + gridSize * 0.05 + r() * gridSize * 0.2
      switch (side) {
        case 0:
          x = sceneCX - extent + r() * extent * 2
          z = sceneCY - offset
          break
        case 1:
          x = sceneCX - extent + r() * extent * 2
          z = sceneCY + offset
          break
        case 2:
          x = sceneCX - offset
          z = sceneCY - extent + r() * extent * 2
          break
        default:
          x = sceneCX + offset
          z = sceneCY - extent + r() * extent * 2
          break
      }

      const h = density === 'micro' ? 15 + r() * 40 : 30 + r() * 80
      const w = 10 + r() * 20
      const d = 10 + r() * 20

      const mat = new THREE.Matrix4()
      mat.makeTranslation(x, h / 2, z)
      mat.scale(new THREE.Vector3(w, h, d))
      ms.push(mat)

      // Varied grays with slight blue/warm tint
      const base = 0.25 + r() * 0.35
      cs.push(new THREE.Color(base - 0.02, base, base + 0.03))
    }

    return { matrices: ms, colors: cs }
  }, [sceneCX, sceneCY, gridSize, extent, count, rand, density])

  const meshRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    if (!meshRef.current) return
    matrices.forEach((m, i) => {
      meshRef.current!.setMatrixAt(i, m)
      meshRef.current!.setColorAt(i, colors[i])
    })
    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  }, [matrices, colors])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} metalness={0.1} />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------------------
// Indoor scenery — ceiling with light panels
// ---------------------------------------------------------------------------

function IndoorScenery({ sceneCX, sceneCY, gridSize }: Omit<Props, 'theme'>) {
  const ceilingHeight = 30
  const planeSize = gridSize * 1.2

  return (
    <group>
      {/* Ceiling */}
      <mesh position={[sceneCX, ceilingHeight, sceneCY]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshStandardMaterial color="#e8e4e0" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* Ceiling light panels */}
      {[
        [-0.25, -0.25],
        [0.25, -0.25],
        [-0.25, 0.25],
        [0.25, 0.25],
        [0, 0],
      ].map(([ox, oz], i) => (
        <mesh
          key={i}
          position={[sceneCX + gridSize * ox, ceilingHeight - 0.5, sceneCY + gridSize * oz]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[gridSize * 0.15, gridSize * 0.15]} />
          <meshBasicMaterial color="#fffef0" transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function SceneryObjects({ sceneCX, sceneCY, gridSize, theme }: Props) {
  switch (theme.sceneryType) {
    case 'rural':
      return <RuralScenery sceneCX={sceneCX} sceneCY={sceneCY} gridSize={gridSize} />
    case 'urban-macro':
      return (
        <UrbanScenery sceneCX={sceneCX} sceneCY={sceneCY} gridSize={gridSize} density="macro" />
      )
    case 'urban-micro':
      return (
        <UrbanScenery sceneCX={sceneCX} sceneCY={sceneCY} gridSize={gridSize} density="micro" />
      )
    case 'indoor':
      return <IndoorScenery sceneCX={sceneCX} sceneCY={sceneCY} gridSize={gridSize} />
    default:
      return null
  }
}
