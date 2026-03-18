import * as THREE from 'three'
import type { NodeState } from '../../../types'

// THREE.js is Y-up.
//   3D: THREE.x = sim.x,  THREE.y = sim.z (altitude),  THREE.z = sim.y
//   2D: THREE.x = sim.x,  THREE.y = 0,                  THREE.z = sim.y   (top-down)
//   1D: THREE.x = sim.x,  THREE.y = sim.z (altitude),   THREE.z = 0       (side profile)

export function simToThree(
  x: number,
  y: number,
  z: number,
  dim: 1 | 2 | 3 = 3
): [number, number, number] {
  if (dim === 2) return [x, 0, y]
  if (dim === 1) return [x, z, 0]
  return [x, z, y]
}

export function interpPos(
  cur: NodeState,
  next: NodeState | undefined,
  alpha: number,
  dim: 1 | 2 | 3 = 3
): [number, number, number] {
  if (!next || alpha === 0) return simToThree(cur.x, cur.y, cur.z, dim)
  return simToThree(
    cur.x + (next.x - cur.x) * alpha,
    cur.y + (next.y - cur.y) * alpha,
    cur.z + (next.z - cur.z) * alpha,
    dim
  )
}

export function headingRotation(
  cur: NodeState,
  next: NodeState | undefined,
  dim: 1 | 2 | 3
): THREE.Euler {
  if (!next) return new THREE.Euler(0, 0, 0)
  const dx = next.x - cur.x
  const dy = next.z - cur.z // altitude delta → THREE y
  const dz = next.y - cur.y // sim-y delta → THREE z
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 0.001) return new THREE.Euler(0, 0, 0)
  if (dim === 2) {
    return new THREE.Euler(0, Math.atan2(dx, dz), 0)
  }
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len)
  const up = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir)
  return new THREE.Euler().setFromQuaternion(q)
}
