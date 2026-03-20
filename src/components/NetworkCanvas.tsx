import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import {
  OrbitControls,
  Text,
  Line,
  Grid,
  Sphere,
  Box,
  Cone,
  Cylinder,
  PerspectiveCamera,
} from '@react-three/drei'
import * as THREE from 'three'
import type { SimFrame, NodeState, LinkState, NodeType } from '../types'

// -------------------------------------------------------------------------
// Coordinate mapping — dimension-aware
// THREE.js is Y-up.
//   3D: THREE.x = sim.x,  THREE.y = sim.z (altitude),  THREE.z = sim.y
//   2D: THREE.x = sim.x,  THREE.y = 0,                  THREE.z = sim.y   (top-down)
//   1D: THREE.x = sim.x,  THREE.y = sim.z (altitude),   THREE.z = 0       (side profile)
// -------------------------------------------------------------------------
function simToThree(x: number, y: number, z: number, dim: 1 | 2 | 3 = 3): [number, number, number] {
  if (dim === 2) return [x, 0, y]
  if (dim === 1) return [x, z, 0]
  return [x, z, y]
}

function interpPos(
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

function headingRotation(cur: NodeState, next: NodeState | undefined, dim: 1 | 2 | 3): THREE.Euler {
  if (!next) return new THREE.Euler(0, 0, 0)
  const dx = next.x - cur.x
  const dy = next.z - cur.z // altitude delta → THREE y
  const dz = next.y - cur.y // sim-y delta → THREE z
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 0.001) return new THREE.Euler(0, 0, 0)
  if (dim === 2) {
    // Only rotate around Y axis (horizontal)
    return new THREE.Euler(0, Math.atan2(dx, dz), 0)
  }
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len)
  const up = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir)
  return new THREE.Euler().setFromQuaternion(q)
}

// -------------------------------------------------------------------------
// Colors
// -------------------------------------------------------------------------
const NODE_BASE: Record<NodeType, string> = {
  ground: '#7dd3fc',
  air: '#fbbf24',
  bs: '#c084fc',
  vehicle: '#34d399',
}
const NODE_SELECTED = '#ffffff'
const NODE_DIMMED = '#1e3a4a'

const LINK_LOS_CONN = '#22c55e'
const LINK_NLOS_CONN = '#f97316'
const LINK_DISCONN = '#ef4444'

function lc(l: LinkState) {
  if (!l.connected) return LINK_DISCONN
  return l.condition === 'LOS' ? LINK_LOS_CONN : LINK_NLOS_CONN
}
function linkKey(l: LinkState) {
  return `${l.nodeA}-${l.nodeB}`
}

// -------------------------------------------------------------------------
// NLOS blockage marker — semi-transparent plane perpendicular to link
// -------------------------------------------------------------------------
function NlosBlocker({
  posA,
  posB,
  dimmed,
}: {
  posA: [number, number, number]
  posB: [number, number, number]
  dimmed: boolean
}) {
  const mid: [number, number, number] = [
    (posA[0] + posB[0]) / 2,
    (posA[1] + posB[1]) / 2,
    (posA[2] + posB[2]) / 2,
  ]
  // Horizontal direction of the link in XZ plane → rotate plane normal to align
  const dx = posB[0] - posA[0]
  const dz = posB[2] - posA[2]
  const angle = Math.atan2(dx, dz) // rotation around Y so plane normal faces link direction

  return (
    <mesh position={mid} rotation={[0, angle, 0]}>
      <planeGeometry args={[14, 18]} />
      <meshBasicMaterial
        color="#f97316"
        transparent
        opacity={dimmed ? 0.03 : 0.16}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// -------------------------------------------------------------------------
// Node shape
// -------------------------------------------------------------------------
function NodeShape({
  nodeType,
  size,
  color,
  emissive,
  emissiveIntensity,
}: {
  nodeType: NodeType
  size: number
  color: string
  emissive: string
  emissiveIntensity: number
}) {
  const mat = (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      roughness={0.3}
      metalness={0.4}
    />
  )
  if (nodeType === 'air') {
    return <Cone args={[size, size * 2.5, 8]}>{mat}</Cone>
  }
  if (nodeType === 'bs') {
    return <Cylinder args={[size * 0.4, size * 0.6, size * 3, 8]}>{mat}</Cylinder>
  }
  if (nodeType === 'vehicle') {
    return <Box args={[size * 2.2, size * 0.7, size * 1.0]}>{mat}</Box>
  }
  return <Sphere args={[size, 16, 12]}>{mat}</Sphere>
}

// -------------------------------------------------------------------------
// NodeObject
// -------------------------------------------------------------------------
interface NodeObjectProps {
  node: NodeState
  nextNode: NodeState | undefined
  alpha: number
  selected: boolean
  highlighted: boolean
  dimmed: boolean
  dim: 1 | 2 | 3
  onClick: () => void
}

function NodeObject({
  node,
  nextNode: _nextNode,
  alpha: _alpha,
  selected,
  highlighted,
  dimmed,
  dim,
  onClick,
}: NodeObjectProps) {
  const pos = interpPos(node, undefined, 0, dim)
  const inactive = !node.active

  const color = inactive
    ? '#334155'
    : selected
      ? NODE_SELECTED
      : dimmed
        ? NODE_DIMMED
        : NODE_BASE[node.nodeType]
  const emissive = inactive
    ? '#000000'
    : selected
      ? '#60a5fa'
      : highlighted
        ? NODE_BASE[node.nodeType]
        : '#000000'
  const emissiveIntensity = inactive ? 0 : selected ? 0.8 : highlighted ? 0.4 : dimmed ? 0 : 0.2
  const size = node.nodeType === 'air' ? 4 : node.nodeType === 'bs' ? 3 : 3.5

  const rotation =
    node.nodeType === 'air' || node.nodeType === 'vehicle'
      ? headingRotation(node, _nextNode, dim)
      : new THREE.Euler(0, 0, 0)

  const label =
    node.nodeType === 'air'
      ? 'UAV'
      : node.nodeType === 'bs'
        ? 'BS'
        : node.nodeType === 'vehicle'
          ? 'VEH'
          : 'GND'

  return (
    <group
      position={pos}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {selected && !inactive && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size + 3, 0.6, 8, 32]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.6} />
        </mesh>
      )}

      <group rotation={rotation}>
        <NodeShape
          nodeType={node.nodeType}
          size={size}
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
        />
        {inactive && (
          <mesh>
            <sphereGeometry args={[size * 1.3, 8, 8]} />
            <meshBasicMaterial color="#334155" transparent opacity={0.18} depthWrite={false} />
          </mesh>
        )}
      </group>

      <Text
        position={[0, size + 5, 0]}
        fontSize={5}
        color={inactive ? '#475569' : dimmed ? '#334155' : '#f1f5f9'}
        anchorX="center"
        anchorY="middle"
        renderOrder={1}
        depthOffset={-1}
        raycast={() => null}
      >
        {String(node.id)}
      </Text>
      <Text
        position={[0, size + 10, 0]}
        fontSize={3}
        color={inactive ? '#475569' : dimmed ? '#1e293b' : NODE_BASE[node.nodeType]}
        anchorX="center"
        anchorY="middle"
        renderOrder={1}
        depthOffset={-1}
        raycast={() => null}
      >
        {inactive ? 'OFFLINE' : label}
      </Text>

      {/* Altitude drop-line — only in 3D and 1D (not 2D where z is projected to 0) */}
      {node.nodeType === 'air' && node.z > 2 && !inactive && dim !== 2 && (
        <Line
          points={[
            [0, 0, 0],
            [0, -node.z, 0],
          ]}
          color="#fbbf24"
          lineWidth={1}
          dashed
          dashSize={4}
          gapSize={3}
          transparent
          opacity={0.35}
        />
      )}
    </group>
  )
}

// -------------------------------------------------------------------------
// LinkObject
// -------------------------------------------------------------------------
interface LinkObjectProps {
  link: LinkState
  nodeA: NodeState
  nodeB: NodeState
  nextA: NodeState | undefined
  nextB: NodeState | undefined
  alpha: number
  selected: boolean
  highlighted: boolean
  dimmed: boolean
  dim: 1 | 2 | 3
  onClick: () => void
}

function LinkObject({
  link,
  nodeA,
  nodeB,
  nextA: _nextA,
  nextB: _nextB,
  alpha: _alpha,
  selected,
  highlighted,
  dimmed,
  dim,
  onClick,
}: LinkObjectProps) {
  const posA = interpPos(nodeA, undefined, 0, dim)
  const posB = interpPos(nodeB, undefined, 0, dim)
  const color = lc(link)
  const opacity = dimmed ? 0.06 : 1
  const isLos = link.condition === 'LOS'
  const width = selected ? 4 : highlighted ? 3 : isLos ? 2.5 : 1.5
  const mid: [number, number, number] = [
    (posA[0] + posB[0]) / 2,
    (posA[1] + posB[1]) / 2,
    (posA[2] + posB[2]) / 2,
  ]

  return (
    <group>
      <Line
        points={[posA, posB]}
        color={color}
        lineWidth={width}
        dashed={!isLos}
        dashSize={10}
        gapSize={6}
        transparent
        opacity={opacity}
      />

      {/* NLOS blockage plane — shows "something is obstructing this path" */}
      {!isLos && link.connected && <NlosBlocker posA={posA} posB={posB} dimmed={dimmed} />}

      {(selected || highlighted) && !dimmed && (
        <Text
          position={[mid[0], mid[1] + 6, mid[2]]}
          fontSize={4}
          color={color}
          anchorX="center"
          anchorY="middle"
          renderOrder={2}
          depthOffset={-2}
          raycast={() => null}
        >
          {`${link.condition}${link.sinr !== undefined ? `  ${link.sinr.toFixed(1)} dB` : ''}`}
        </Text>
      )}

      <mesh
        position={mid}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <sphereGeometry args={[7, 6, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

// -------------------------------------------------------------------------
// Scene
// -------------------------------------------------------------------------
interface SceneProps {
  frame: SimFrame
  nextFrame: SimFrame | null
  alpha: number
  selectedNode: number | null
  selectedLink: string | null
  onSelectNode: (id: number | null) => void
  onSelectLink: (key: string | null) => void
  dimensions: 1 | 2 | 3
}

function Scene({
  frame,
  nextFrame,
  alpha,
  selectedNode,
  selectedLink,
  onSelectNode,
  onSelectLink,
  dimensions,
}: SceneProps) {
  const { nodes, links } = frame

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const nextNodeById = useMemo(
    () => new Map((nextFrame?.nodes ?? []).map((n) => [n.id, n])),
    [nextFrame]
  )

  const hasSelection = selectedNode !== null || selectedLink !== null

  const highlightedNodes = useMemo(() => {
    const s = new Set<number>()
    if (selectedNode !== null)
      links.forEach((l) => {
        if (l.nodeA === selectedNode || l.nodeB === selectedNode) {
          s.add(l.nodeA)
          s.add(l.nodeB)
        }
      })
    if (selectedLink) {
      const [a, b] = selectedLink.split('-').map(Number)
      s.add(a)
      s.add(b)
    }
    return s
  }, [selectedNode, selectedLink, links])

  const highlightedLinks = useMemo(() => {
    const s = new Set<string>()
    if (selectedNode !== null)
      links.forEach((l) => {
        if (l.nodeA === selectedNode || l.nodeB === selectedNode) s.add(linkKey(l))
      })
    if (selectedLink) s.add(selectedLink)
    return s
  }, [selectedNode, selectedLink, links])

  const [sceneCX, sceneCY] = useMemo(() => {
    if (!nodes.length) return [75, 75]
    const xs = nodes.map((n) => n.x),
      ys = nodes.map((n) => n.y)
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  }, [nodes])

  // Camera initial position based on dimension mode
  const camPos: [number, number, number] =
    dimensions === 2
      ? [sceneCX, 500, sceneCY]
      : dimensions === 1
        ? [sceneCX, 80, 550]
        : [200, 180, 350]

  return (
    <>
      {/* Re-initialize camera when dimension mode changes */}
      <PerspectiveCamera
        key={`cam-${dimensions}`}
        makeDefault
        position={camPos}
        fov={45}
        near={0.1}
        far={5000}
      />

      {dimensions === 2 ? (
        // Top-down: disable rotation, allow pan + zoom
        <OrbitControls
          target={[sceneCX, 0, sceneCY]}
          makeDefault
          enableRotate={false}
          screenSpacePanning={true}
        />
      ) : dimensions === 1 ? (
        // Side profile: lock to side view
        <OrbitControls
          target={[sceneCX, 0, 0]}
          makeDefault
          minPolarAngle={Math.PI / 2 - 0.15}
          maxPolarAngle={Math.PI / 2 + 0.15}
          screenSpacePanning={true}
        />
      ) : (
        <OrbitControls target={[sceneCX, 0, sceneCY]} makeDefault />
      )}

      <ambientLight intensity={1.0} />
      <directionalLight position={[300, 400, 200]} intensity={1.2} />
      <pointLight position={[sceneCX, 120, sceneCY]} intensity={0.4} color="#ffffff" />

      {/* Ground plane */}
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

      {links.map((l) => {
        const nA = nodeById.get(l.nodeA),
          nB = nodeById.get(l.nodeB)
        if (!nA || !nB) return null
        const key = linkKey(l)
        const sel = key === selectedLink
        const hi = highlightedLinks.has(key)
        return (
          <LinkObject
            key={key}
            link={l}
            nodeA={nA}
            nodeB={nB}
            nextA={nextNodeById.get(l.nodeA)}
            nextB={nextNodeById.get(l.nodeB)}
            alpha={alpha}
            selected={sel}
            highlighted={hi}
            dimmed={hasSelection && !sel && !hi}
            dim={dimensions}
            onClick={() => {
              onSelectLink(sel ? null : key)
              onSelectNode(null)
            }}
          />
        )
      })}

      {nodes.map((n) => {
        const sel = n.id === selectedNode
        const hi = highlightedNodes.has(n.id)
        return (
          <NodeObject
            key={n.id}
            node={n}
            nextNode={nextNodeById.get(n.id)}
            alpha={alpha}
            selected={sel}
            highlighted={hi}
            dimmed={hasSelection && !sel && !hi}
            dim={dimensions}
            onClick={() => {
              onSelectNode(sel ? null : n.id)
              onSelectLink(null)
            }}
          />
        )
      })}
    </>
  )
}

// -------------------------------------------------------------------------
// Exported wrapper
// -------------------------------------------------------------------------
interface Props {
  frame: SimFrame
  nextFrame: SimFrame | null
  alpha: number
  selectedNode: number | null
  selectedLink: string | null
  onSelectNode: (id: number | null) => void
  onSelectLink: (key: string | null) => void
  dimensions?: 1 | 2 | 3
}

export function NetworkCanvas({
  frame,
  nextFrame,
  alpha,
  selectedNode,
  selectedLink,
  onSelectNode,
  onSelectLink,
  dimensions = 3,
}: Props) {
  return (
    <Canvas
      style={{ background: '#ffffff' }}
      onPointerMissed={() => {
        onSelectNode(null)
        onSelectLink(null)
      }}
    >
      <Scene
        frame={frame}
        nextFrame={nextFrame}
        alpha={alpha}
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        onSelectNode={onSelectNode}
        onSelectLink={onSelectLink}
        dimensions={dimensions}
      />
    </Canvas>
  )
}
