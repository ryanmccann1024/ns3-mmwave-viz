import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { NODE_FAILURE_COLOR } from '../../styles/tokens'

/** Seconds of wall-clock time, so the burst reads the same at every playback speed */
const FLASH_S = 1.0
const GLOW_S = 2.4
const RING_S = 2.2
const RING_DELAYS_S = [0, 0.35, 0.7]
const BEACON_PERIOD_S = 1.8

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

/**
 * Marks a node going down: a red flash and shockwave rings the moment it drops (or is
 * scrubbed past), then a slow red beacon ring for as long as it stays down. Animated
 * imperatively in useFrame; React only sees `active` change.
 */
export function NodeFailureEffect({ active, size }: { active: boolean; size: number }) {
  const prevActive = useRef(active)
  const pending = useRef(false)
  const start = useRef<number | null>(null)
  const reduced = useRef(reducedMotion())

  useEffect(() => {
    if (prevActive.current && !active && !reduced.current) pending.current = true
    if (active) {
      pending.current = false
      start.current = null
    }
    prevActive.current = active
  }, [active])

  const flash = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const beacon = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    if (pending.current) {
      start.current = now
      pending.current = false
    }
    const t = start.current === null ? Infinity : now - start.current

    const f = flash.current
    if (f) {
      const p = t / FLASH_S
      f.visible = p < 1
      if (f.visible) {
        f.scale.setScalar(1 + 1.6 * easeOut(p))
        ;(f.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - p) * (1 - p)
      }
    }

    const g = glow.current
    if (g) {
      const p = t / GLOW_S
      g.visible = p < 1
      if (g.visible) {
        g.scale.setScalar(1 + 2 * easeOut(p))
        ;(g.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - p)
      }
    }

    RING_DELAYS_S.forEach((delay, i) => {
      const r = rings.current[i]
      if (!r) return
      const p = (t - delay) / RING_S
      r.visible = p >= 0 && p < 1
      if (r.visible) {
        r.scale.setScalar(1.5 + 13 * easeOut(p))
        ;(r.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - p, 1.2)
      }
    })

    const b = beacon.current
    if (b) {
      b.visible = !active
      if (b.visible) {
        const pulse = reduced.current
          ? 0.5
          : 0.5 + 0.5 * Math.sin((now * 2 * Math.PI) / BEACON_PERIOD_S)
        ;(b.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.45 * pulse
      }
    }
  })

  const material = {
    color: NODE_FAILURE_COLOR,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  } as const

  return (
    <group raycast={() => null}>
      <mesh ref={flash} visible={false} raycast={() => null}>
        <sphereGeometry args={[size * 1.4, 24, 16]} />
        <meshBasicMaterial {...material} opacity={0} />
      </mesh>
      {RING_DELAYS_S.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            rings.current[i] = m
          }}
          rotation={FLAT}
          visible={false}
          raycast={() => null}
        >
          <ringGeometry args={[size * 0.86, size, 64]} />
          <meshBasicMaterial {...material} opacity={0} />
        </mesh>
      ))}
      <mesh ref={glow} rotation={FLAT} visible={false} raycast={() => null}>
        <circleGeometry args={[size * 3, 48]} />
        <meshBasicMaterial {...material} opacity={0} />
      </mesh>
      <mesh ref={beacon} rotation={FLAT} visible={!active} raycast={() => null}>
        <ringGeometry args={[size * 1.8, size * 2.2, 64]} />
        <meshBasicMaterial {...material} opacity={0.6} />
      </mesh>
    </group>
  )
}
