import { useMemo } from 'react'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { SimFrame, BuildingState } from '../../types'
import { linkKey } from './utils/linkColors'
import { NodeObject } from './NodeObject'
import { LinkObject } from './LinkObject'
import { BuildingObject } from './BuildingObject'
import { SceneEnvironment } from './SceneEnvironment'

interface Props {
  frame: SimFrame
  nextFrame: SimFrame | null
  /** Shared mutable ref — updated every RAF tick, never causes React re-renders */
  alphaRef: React.MutableRefObject<number>
  selectedNode: number | null
  selectedLink: string | null
  onSelectNode: (id: number | null) => void
  onSelectLink: (key: string | null) => void
  dimensions: 1 | 2 | 3
  buildings: BuildingState[]
}

export function Scene({
  frame,
  nextFrame,
  alphaRef,
  selectedNode,
  selectedLink,
  onSelectNode,
  onSelectLink,
  dimensions,
  buildings,
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

  const [sceneCX, sceneCY] = useMemo(() => {
    if (!nodes.length) return [75, 75]
    const xs = nodes.map((n) => n.x),
      ys = nodes.map((n) => n.y)
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  }, [nodes])

  const camPos: [number, number, number] =
    dimensions === 2
      ? [sceneCX, 500, sceneCY]
      : dimensions === 1
        ? [sceneCX, 80, 550]
        : [200, 180, 350]

  return (
    <>
      <PerspectiveCamera
        key={`cam-${dimensions}`}
        makeDefault
        position={camPos}
        fov={45}
        near={0.1}
        far={5000}
      />

      {dimensions === 2 ? (
        <OrbitControls
          target={[sceneCX, 0, sceneCY]}
          makeDefault
          enableRotate={false}
          screenSpacePanning={true}
        />
      ) : dimensions === 1 ? (
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

      <SceneEnvironment sceneCX={sceneCX} sceneCY={sceneCY} />

      {/* Buildings */}
      {buildings.map((b) => (
        <BuildingObject key={b.id} building={b} dim={dimensions} />
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
            onClick={() => {
              onSelectLink(sel ? null : key)
              onSelectNode(null)
            }}
          />
        )
      })}

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
