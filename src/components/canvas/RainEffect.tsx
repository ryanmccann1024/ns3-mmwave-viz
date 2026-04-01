import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { SceneBounds } from '../../hooks/useSimData'

interface Props {
  rainRate: number
  sceneBounds: SceneBounds
}

export function RainEffect({ rainRate, sceneBounds }: Props) {
  const pointsRef = useRef<THREE.Points>(null)
  const count = Math.min(Math.round(rainRate * 80), 6000)
  const halfSize = sceneBounds.planeSize / 2
  const maxY = 200 // rain spawns from this height
  const speed = 0.3 + rainRate * 0.02 // fall speed per frame

  // Lazy init — only runs once
  const [positions] = useState(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * sceneBounds.planeSize + sceneBounds.cx
      arr[i * 3 + 1] = Math.random() * maxY
      arr[i * 3 + 2] = (Math.random() - 0.5) * sceneBounds.planeSize + sceneBounds.cy
    }
    return arr
  })

  useFrame(() => {
    const pts = pointsRef.current
    if (!pts) return
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array

    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= speed // fall down
      if (arr[i * 3 + 1] < 0) {
        // Reset to top at random X/Z
        arr[i * 3] = (Math.random() - 0.5) * halfSize * 2 + sceneBounds.cx
        arr[i * 3 + 1] = maxY + Math.random() * 20
        arr[i * 3 + 2] = (Math.random() - 0.5) * halfSize * 2 + sceneBounds.cy
      }
    }
    pos.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#93c5fd"
        size={1.2}
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
