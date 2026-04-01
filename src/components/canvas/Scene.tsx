import { useMemo } from 'react'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { SimFrame, BuildingState } from '../../types'
import type { SceneBounds } from '../../hooks/useSimData'
import { linkKey } from './utils/linkColors'
import { NodeObject } from './NodeObject'
import { LinkObject } from './LinkObject'
import { BuildingObject } from './BuildingObject'
import { SceneEnvironment } from './SceneEnvironment'
import { RainEffect } from './RainEffect'
import { TrafficLayer } from './TrafficLayer'

interface Props {
  frame: SimFrame
  nextFrame: SimFrame | null
  /** Shared mutable ref — updated every RAF tick, never causes React re-renders */
  alphaRef: React.MutableRefObject<number>
  selectedNode: number | null
  selectedLink: string | null
  selectedFlow: { src: number; dst: number } | null
  onSelectNode: (id: number | null) => void
  onSelectLink: (key: string | null) => void
  dimensions: 1 | 2 | 3
  buildings: BuildingState[]
  sceneBounds: SceneBounds
  compact?: boolean
  rainRate: number
  scenario: string
}

export function Scene({
  frame,
  nextFrame,
  alphaRef,
  selectedNode,
  selectedLink,
  selectedFlow,
  onSelectNode,
  onSelectLink,
  dimensions,
  buildings,
  sceneBounds,
  compact = false,
  rainRate,
  scenario,
}: Props) {
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

  // Compact mode: compress distances between nodes toward the centroid
  // so far-apart nodes appear closer and easier to see
  const COMPACT_TARGET = 250
  const rawGs = sceneBounds.gridSize
  const compactFactor = compact && rawGs > COMPACT_TARGET ? COMPACT_TARGET / rawGs : 1
  const gs = compact ? Math.min(rawGs, COMPACT_TARGET) : rawGs

  const sceneCX = sceneBounds.cx * compactFactor
  const sceneCY = sceneBounds.cy * compactFactor

  // Scale camera distance and controls with scene size
  const scale = gs / 500 // 1.0 for default 500-unit scenes
  const camNear = Math.max(0.1, scale * 0.5)
  const camFar = Math.max(5000, gs * 4)

  const camPos: [number, number, number] =
    dimensions === 2
      ? [sceneCX, Math.max(500, gs * 1.1), sceneCY]
      : dimensions === 1
        ? [sceneCX, 80 * scale, gs * 1.1]
        : [sceneCX - gs * 0.35, gs * 0.35, sceneCY + gs * 0.65]

  return (
    <>
      <PerspectiveCamera
        key={`cam-${dimensions}`}
        makeDefault
        position={camPos}
        fov={45}
        near={camNear}
        far={camFar}
      />

      {dimensions === 2 ? (
        <OrbitControls
          target={[sceneCX, 0, sceneCY]}
          makeDefault
          enableRotate={false}
          screenSpacePanning={true}
          minDistance={10 * scale}
          maxDistance={gs * 3}
          zoomSpeed={Math.max(1, scale * 0.8)}
          panSpeed={Math.max(1, scale * 0.8)}
        />
      ) : dimensions === 1 ? (
        <OrbitControls
          target={[sceneCX, 0, 0]}
          makeDefault
          minPolarAngle={Math.PI / 2 - 0.15}
          maxPolarAngle={Math.PI / 2 + 0.15}
          screenSpacePanning={true}
          minDistance={10 * scale}
          maxDistance={gs * 3}
          zoomSpeed={Math.max(1, scale * 0.8)}
          panSpeed={Math.max(1, scale * 0.8)}
        />
      ) : (
        <OrbitControls
          target={[sceneCX, 0, sceneCY]}
          makeDefault
          minDistance={10 * scale}
          maxDistance={gs * 3}
          zoomSpeed={Math.max(1, scale * 0.8)}
          panSpeed={Math.max(1, scale * 0.8)}
        />
      )}

      <SceneEnvironment
        sceneCX={sceneCX}
        sceneCY={sceneCY}
        gridSize={gs}
        planeSize={sceneBounds.planeSize * compactFactor}
        scenario={scenario}
      />

      {/* Buildings */}
      {buildings.map((b) => (
        <BuildingObject key={b.id} building={b} dim={dimensions} posScale={compactFactor} />
      ))}

      {/* Links (rendered before nodes so nodes draw on top) */}
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
            alphaRef={alphaRef}
            selected={sel}
            highlighted={hi}
            dimmed={hasSelection && !sel && !hi}
            dim={dimensions}
            posScale={compactFactor}
            onClick={() => {
              onSelectLink(sel ? null : key)
              onSelectNode(null)
            }}
          />
        )
      })}

      {/* Traffic flow pulses */}
      {frame.routes.length > 0 && (
        <TrafficLayer
          frame={frame}
          selectedFlow={selectedFlow}
          dim={dimensions}
          posScale={compactFactor}
        />
      )}

      {/* Nodes */}
      {nodes.map((n) => {
        const sel = n.id === selectedNode
        const hi = highlightedNodes.has(n.id)
        return (
          <NodeObject
            key={n.id}
            node={n}
            nextNode={nextNodeById.get(n.id)}
            alphaRef={alphaRef}
            selected={sel}
            highlighted={hi}
            dimmed={hasSelection && !sel && !hi}
            dim={dimensions}
            posScale={compactFactor}
            onClick={() => {
              onSelectNode(sel ? null : n.id)
              onSelectLink(null)
            }}
          />
        )
      })}

      {/* Rain particles */}
      {rainRate > 0 && <RainEffect rainRate={rainRate} sceneBounds={sceneBounds} />}
    </>
  )
}
