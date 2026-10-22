import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeType } from '../../types'
import { NODE_SIZES } from '../../styles/tokens'

interface Props {
  nodeType: NodeType
  color: string
  emissive: string
  emissiveIntensity: number
  /** stable per-node number, varies trousers and hair */
  seed?: number
}

const CARBON = '#22262b'
const GLASS = '#1c2833'
const TYRE = '#141518'
const STEEL = '#a7adb3'
/** jacket, trousers, hair */
const OUTFITS: [string, string, string][] = [
  ['#2f4a6d', '#2b2f36', '#2a1d15'],
  ['#8a3b2e', '#3a3f4a', '#5a3a22'],
  ['#3d5a40', '#1f2329', '#141010'],
  ['#c9c2b5', '#334155', '#6b4a2b'],
  ['#1f2933', '#4b5563', '#a07a4a'],
]

/**
 * Detailed low-poly models per node type. The status colour is the body paint (car),
 * the shell (drone), the radio panels (mast) or the jacket (pedestrian), so state stays
 * readable at a glance. Models face +Z (the heading yaw in NodeObject) and cast shadows.
 */
export function NodeShape({ nodeType, color, emissive, emissiveIntensity, seed = 0 }: Props) {
  const size = NODE_SIZES[nodeType]
  const root = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    root.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
  })
  const body = (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      roughness={0.3}
      metalness={0.35}
    />
  )
  let model: JSX.Element
  if (nodeType === 'air') model = <Drone size={size} body={body} status={color} />
  else if (nodeType === 'vehicle')
    model = (
      <Car
        size={size}
        body={body}
        status={color}
        paint={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
    )
  else if (nodeType === 'bs') model = <Mast size={size} body={body} />
  else if (nodeType === 'ground')
    model = (
      <Person
        size={size}
        body={body}
        status={color}
        outfit={OUTFITS[seed % OUTFITS.length]}
        tint={color}
      />
    )
  else if (nodeType === 'gateway')
    model = (
      <mesh>
        <icosahedronGeometry args={[size * 1.1, 0]} />
        {body}
      </mesh>
    )
  else
    model = (
      <mesh>
        <octahedronGeometry args={[size, 0]} />
        {body}
      </mesh>
    )
  return <group ref={root}>{model}</group>
}

type PartProps = { size: number; body: JSX.Element }

const mat = (c: string, roughness = 0.6, metalness = 0.3) => (
  <meshStandardMaterial color={c} roughness={roughness} metalness={metalness} />
)

/** Quadcopter: streamlined shell, carbon X-frame, motor bells, two-blade props, gimbal camera */
function Drone({ size: s, body, status }: PartProps & { status: string }) {
  const props = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    props.current?.children.forEach((p, i) => (p.rotation.y += dt * (i % 2 ? 45 : -45)))
  })
  const reach = s * 1.15
  const tips: [number, number][] = [
    [reach, reach],
    [-reach, reach],
    [reach, -reach],
    [-reach, -reach],
  ]
  return (
    <group>
      {/* shell: a flattened capsule lying along +Z */}
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]}>
        <capsuleGeometry args={[s * 0.38, s * 0.7, 6, 16]} />
        {body}
      </mesh>
      {/* top battery pack */}
      <mesh position={[0, s * 0.24, -s * 0.1]}>
        <boxGeometry args={[s * 0.42, s * 0.14, s * 0.7]} />
        {mat(CARBON, 0.5)}
      </mesh>
      {tips.map(([x, z]) => {
        const len = Math.hypot(x, z)
        return (
          <group key={`a${x}${z}`}>
            <mesh position={[x / 2, 0, z / 2]} rotation={[Math.PI / 2, 0, -Math.atan2(x, z)]}>
              <cylinderGeometry args={[s * 0.06, s * 0.08, len, 8]} />
              {mat(CARBON, 0.4, 0.5)}
            </mesh>
            {/* motor bell */}
            <mesh position={[x, s * 0.1, z]}>
              <cylinderGeometry args={[s * 0.13, s * 0.15, s * 0.2, 14]} />
              {mat(STEEL, 0.3, 0.8)}
            </mesh>
            {/* arm-tip nav LED: green right, red left */}
            <mesh position={[x, -s * 0.06, z]}>
              <sphereGeometry args={[s * 0.06, 8, 6]} />
              <meshBasicMaterial color={x > 0 ? '#22c55e' : '#ef4444'} />
            </mesh>
          </group>
        )
      })}
      <group ref={props}>
        {tips.map(([x, z]) => (
          <group key={`p${x}${z}`} position={[x, s * 0.23, z]}>
            {[0, Math.PI].map((a) => (
              <mesh key={a} rotation={[0.18, a, 0]} position={[Math.sin(a) * s * 0.3, 0, 0]}>
                <boxGeometry args={[s * 0.62, s * 0.015, s * 0.1]} />
                {mat('#e7e9ec', 0.4, 0.1)}
              </mesh>
            ))}
            {/* motion-blur disc */}
            <mesh>
              <cylinderGeometry args={[s * 0.62, s * 0.62, s * 0.005, 24]} />
              <meshBasicMaterial color="#e5e7eb" transparent opacity={0.12} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
      {/* gimbal + camera under the nose */}
      <group position={[0, -s * 0.28, s * 0.42]}>
        <mesh>
          <boxGeometry args={[s * 0.08, s * 0.16, s * 0.08]} />
          {mat(CARBON)}
        </mesh>
        <mesh position={[0, -s * 0.12, 0]}>
          <sphereGeometry args={[s * 0.15, 14, 10]} />
          {mat(CARBON, 0.3, 0.5)}
        </mesh>
        <mesh position={[0, -s * 0.12, s * 0.12]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[s * 0.07, s * 0.07, s * 0.06, 14]} />
          <meshStandardMaterial color="#0b1220" roughness={0.05} metalness={0.9} />
        </mesh>
      </group>
      {/* landing legs */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * s * 0.3, -s * 0.3, 0]} rotation={[0, 0, side * 0.35]}>
            <cylinderGeometry args={[s * 0.03, s * 0.03, s * 0.4, 6]} />
            {mat(CARBON)}
          </mesh>
          <mesh position={[side * s * 0.37, -s * 0.48, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[s * 0.035, s * 0.035, s * 0.9, 6]} />
            {mat(CARBON)}
          </mesh>
        </group>
      ))}
      {/* status beacon on top */}
      <mesh position={[0, s * 0.34, -s * 0.1]}>
        <sphereGeometry args={[s * 0.07, 10, 8]} />
        <meshBasicMaterial color={status} />
      </mesh>
    </group>
  )
}

/** Sedan side profile (length along +Z, height up), extruded across the car's width */
function sedanShape(L: number, H: number) {
  const p = new THREE.Shape()
  const z = (f: number) => (f - 0.5) * L
  const y = (f: number) => f * H
  p.moveTo(z(0), y(0.18))
  p.lineTo(z(0), y(0.45))
  p.quadraticCurveTo(z(0.01), y(0.52), z(0.06), y(0.53)) // tail
  p.lineTo(z(0.2), y(0.56))
  p.lineTo(z(0.3), y(0.92)) // rear window
  p.quadraticCurveTo(z(0.33), y(1), z(0.4), y(1))
  p.lineTo(z(0.6), y(1)) // roof
  p.quadraticCurveTo(z(0.64), y(0.99), z(0.68), y(0.9))
  p.lineTo(z(0.78), y(0.6)) // windscreen
  p.lineTo(z(0.95), y(0.54)) // bonnet
  p.quadraticCurveTo(z(1), y(0.52), z(1), y(0.4))
  p.lineTo(z(1), y(0.18))
  p.lineTo(z(0), y(0.18))
  return p
}

/** Glass-house profile: the cabin above the beltline, inset slightly */
function cabinShape(L: number, H: number) {
  const p = new THREE.Shape()
  const z = (f: number) => (f - 0.5) * L
  const y = (f: number) => f * H
  p.moveTo(z(0.215), y(0.58))
  p.lineTo(z(0.305), y(0.9))
  p.quadraticCurveTo(z(0.335), y(0.97), z(0.4), y(0.97))
  p.lineTo(z(0.6), y(0.97))
  p.quadraticCurveTo(z(0.635), y(0.96), z(0.67), y(0.89))
  p.lineTo(z(0.765), y(0.6))
  p.lineTo(z(0.215), y(0.58))
  return p
}

function Car({
  size: s,
  status,
  paint,
  emissive,
  emissiveIntensity,
}: PartProps & { status: string; paint: string; emissive: string; emissiveIntensity: number }) {
  // clear-coated metallic paint; state highlight still shows through the emissive
  const body = (
    <meshPhysicalMaterial
      color={paint}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={0.55}
      roughness={0.35}
      clearcoat={1}
      clearcoatRoughness={0.08}
    />
  )
  const L = s * 2.6
  const W = s * 1.1
  const H = s * 0.95
  const wheelR = s * 0.22
  const { shell, cabin } = useMemo(() => {
    const bevel = {
      bevelEnabled: true,
      bevelThickness: s * 0.06,
      bevelSize: s * 0.05,
      bevelSegments: 2,
    }
    const shellGeo = new THREE.ExtrudeGeometry(sedanShape(L, H), { depth: W - s * 0.12, ...bevel })
    const cabinGeo = new THREE.ExtrudeGeometry(cabinShape(L, H), {
      depth: W - s * 0.06,
      bevelEnabled: false,
    })
    // shapes are drawn in the (z, y) plane of the shape's XY; turn so X→+Z and centre the extrusion
    for (const [g, depth] of [
      [shellGeo, W - s * 0.12],
      [cabinGeo, W - s * 0.06],
    ] as const) {
      g.translate(0, 0, -depth / 2)
      g.rotateY(-Math.PI / 2)
    }
    return { shell: shellGeo, cabin: cabinGeo }
  }, [L, W, H, s])
  useLayoutEffect(
    () => () => {
      shell.dispose()
      cabin.dispose()
    },
    [shell, cabin]
  )
  const wheelZ = L * 0.32
  return (
    <group position={[0, -s * 0.35, 0]}>
      <mesh geometry={shell}>{body}</mesh>
      <mesh geometry={cabin}>
        <meshStandardMaterial
          color={GLASS}
          roughness={0.05}
          metalness={0.8}
          envMapIntensity={1.5}
        />
      </mesh>
      {/* bumpers and sills */}
      {[1, -1].map((end) => (
        <mesh key={end} position={[0, H * 0.24, end * (L / 2 + s * 0.02)]}>
          <boxGeometry args={[W * 0.96, H * 0.14, s * 0.1]} />
          {mat(CARBON, 0.7, 0.1)}
        </mesh>
      ))}
      {/* head and tail lamps */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * W * 0.33, H * 0.44, L / 2 + s * 0.04]}>
            <boxGeometry args={[W * 0.24, H * 0.07, s * 0.04]} />
            <meshStandardMaterial color="#fffbe6" emissive="#fff7cc" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[side * W * 0.33, H * 0.46, -L / 2 - s * 0.04]}>
            <boxGeometry args={[W * 0.26, H * 0.07, s * 0.04]} />
            <meshStandardMaterial color="#b91c1c" emissive="#dc2626" emissiveIntensity={0.5} />
          </mesh>
          {/* wing mirror */}
          <mesh position={[side * (W / 2 + s * 0.05), H * 0.62, L * 0.2]}>
            <boxGeometry args={[s * 0.1, s * 0.08, s * 0.12]} />
            {body}
          </mesh>
        </group>
      ))}
      {/* status light on the roof, the node-type colour */}
      <mesh position={[0, H * 1.0 + s * 0.04, -L * 0.02]}>
        <boxGeometry args={[W * 0.3, s * 0.07, s * 0.14]} />
        <meshBasicMaterial color={status} />
      </mesh>
      {/* dark wheel-arch liners */}
      {[-1, 1].map((sz) => (
        <mesh key={`arch${sz}`} position={[0, wheelR, sz * L * 0.32]}>
          <boxGeometry args={[W * 1.0, wheelR * 1.6, wheelR * 2.3]} />
          {mat('#0d0f12', 0.9, 0)}
        </mesh>
      ))}
      {/* wheels: tyre + alloy rim */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <group
            key={`${sx}${sz}`}
            position={[sx * (W / 2 - s * 0.04), wheelR, sz * wheelZ]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <mesh>
              <cylinderGeometry args={[wheelR, wheelR, s * 0.2, 20]} />
              {mat(TYRE, 0.9, 0)}
            </mesh>
            <mesh position={[0, sx * s * 0.101, 0]}>
              <cylinderGeometry args={[wheelR * 0.62, wheelR * 0.62, s * 0.01, 16]} />
              {mat(STEEL, 0.25, 0.9)}
            </mesh>
          </group>
        ))
      )}
    </group>
  )
}

/** Base station: tapered steel lattice tower, sector antenna panels, microwave dish */
function Mast({ size: s, body }: PartProps) {
  const h = s * 3.2
  const lattice = useMemo(() => {
    const pts: number[] = []
    const levels = 6
    const r = (t: number) => s * (0.35 - 0.2 * t)
    const corner = (t: number, k: number): [number, number, number] => {
      const a = Math.PI / 4 + (k * Math.PI) / 2
      return [Math.cos(a) * r(t), -h / 2 + t * h, Math.sin(a) * r(t)]
    }
    for (let i = 0; i < levels; i++) {
      const t0 = i / levels
      const t1 = (i + 1) / levels
      for (let k = 0; k < 4; k++) {
        const a0 = corner(t0, k)
        const a1 = corner(t1, k)
        const b0 = corner(t0, (k + 1) % 4)
        const b1 = corner(t1, (k + 1) % 4)
        pts.push(...a0, ...a1) // leg
        pts.push(...a0, ...b0) // horizontal
        pts.push(...a0, ...b1, ...b0, ...a1) // X brace
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [s, h])
  useLayoutEffect(() => () => lattice.dispose(), [lattice])
  return (
    <group>
      <lineSegments geometry={lattice}>
        <lineBasicMaterial color={STEEL} />
      </lineSegments>
      {/* headframe */}
      <mesh position={[0, h * 0.38, 0]}>
        <cylinderGeometry args={[s * 0.42, s * 0.42, s * 0.05, 3]} />
        {mat(STEEL, 0.4, 0.8)}
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i * 2 * Math.PI) / 3
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * s * 0.38, h * 0.38 + s * 0.35, Math.cos(a) * s * 0.38]}
            rotation={[0, a, 0]}
          >
            <boxGeometry args={[s * 0.26, s * 0.9, s * 0.09]} />
            {body}
          </mesh>
        )
      })}
      {/* point-to-point microwave dish */}
      <mesh position={[s * 0.2, h * 0.15, s * 0.2]} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
        <cylinderGeometry args={[s * 0.22, s * 0.16, s * 0.12, 18]} />
        {mat('#e5e7eb', 0.5, 0.2)}
      </mesh>
      {/* equipment cabinet and pad */}
      <mesh position={[s * 0.55, -h / 2 + s * 0.3, 0]}>
        <boxGeometry args={[s * 0.4, s * 0.6, s * 0.35]} />
        {mat('#9ca3af', 0.6, 0.3)}
      </mesh>
      <mesh position={[0, -h / 2 + s * 0.04, 0]}>
        <boxGeometry args={[s * 1.4, s * 0.08, s * 1]} />
        {mat('#8a8a86', 0.95, 0)}
      </mesh>
    </group>
  )
}

/** Pedestrian: natural proportions (≈7.5 head-heights), jacket in the node colour */
function Person({
  size: s,
  status,
  outfit,
  tint,
}: PartProps & { status: string; outfit: [string, string, string]; tint: string | null }) {
  // the jacket carries the node colour like a hi-vis vest; the rest stays everyday clothing
  const [ownJacket, trousers, hair] = outfit
  const jacket = tint ?? ownJacket
  const cloth = (c: string) => <meshStandardMaterial color={c} roughness={0.9} metalness={0} />
  const skin = mat('#c99872', 0.75, 0)
  // unit: total height ≈ 2.1·s, feet at -0.95·s so the model centre stays near the old sphere's
  const u = s * 0.28
  const foot = -s * 0.95
  return (
    <group>
      {/* legs */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * u * 0.38, foot + u * 1.9, 0]}>
            <capsuleGeometry args={[u * 0.26, u * 3.1, 4, 10]} />
            {cloth(trousers)}
          </mesh>
          <mesh position={[side * u * 0.38, foot + u * 0.12, u * 0.18]}>
            <boxGeometry args={[u * 0.42, u * 0.24, u * 1.0]} />
            {mat('#16181c', 0.7, 0)}
          </mesh>
        </group>
      ))}
      {/* torso: tapered jacket */}
      <mesh position={[0, foot + u * 5.0, 0]} scale={[1, 1, 0.62]}>
        <cylinderGeometry args={[u * 0.82, u * 0.68, u * 2.6, 14]} />
        {cloth(jacket)}
      </mesh>
      <mesh position={[0, foot + u * 6.3, 0]} scale={[1, 0.55, 0.62]}>
        <sphereGeometry args={[u * 0.82, 14, 10]} />
        {cloth(jacket)}
      </mesh>
      {/* arms hanging at the sides, hands */}
      {[-1, 1].map((side) => (
        <group key={`a${side}`}>
          <mesh position={[side * u * 1.0, foot + u * 5.0, 0]} rotation={[0, 0, side * 0.06]}>
            <capsuleGeometry args={[u * 0.2, u * 2.4, 4, 8]} />
            {cloth(jacket)}
          </mesh>
          <mesh position={[side * u * 1.07, foot + u * 3.5, 0]}>
            <sphereGeometry args={[u * 0.2, 10, 8]} />
            {skin}
          </mesh>
        </group>
      ))}
      {/* neck, head, hair */}
      <mesh position={[0, foot + u * 6.7, 0]}>
        <cylinderGeometry args={[u * 0.2, u * 0.22, u * 0.4, 10]} />
        {skin}
      </mesh>
      <mesh position={[0, foot + u * 7.3, 0]} scale={[0.88, 1.05, 0.95]}>
        <sphereGeometry args={[u * 0.5, 18, 14]} />
        {skin}
      </mesh>
      <mesh position={[0, foot + u * 7.45, -u * 0.05]} scale={[0.92, 0.8, 1]}>
        <sphereGeometry args={[u * 0.52, 18, 10, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
        {mat(hair, 0.95, 0)}
      </mesh>
      {/* status badge clipped to the chest (the node-type colour) */}
      <mesh position={[u * 0.35, foot + u * 5.6, u * 0.52]}>
        <boxGeometry args={[u * 0.35, u * 0.35, u * 0.05]} />
        <meshBasicMaterial color={status} />
      </mesh>
    </group>
  )
}
