import { useMemo } from 'react'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { SimFrame, BuildingState, JammerState } from '../../types'
import type { SceneBounds } from '../../hooks/useSimData'
import { linkKey } from './utils/linkColors'
import { NodeObject } from './NodeObject'
import { MissionTargetLayer } from './MissionTargetLayer'
import type { InvestigationTarget } from '../../lib/missionTarget'
import { LinkObject } from './LinkObject'
import { BuildingObject } from './BuildingObject'
import { SceneEnvironment } from './SceneEnvironment'
import { RainEffect } from './RainEffect'
import { TrafficLayer } from './TrafficLayer'
import { TrajectoryLayer } from './TrajectoryLayer'
import { nodeTrailColor } from '../../styles/tokens'
import { JammerObject } from './JammerObject'
import { JammerFieldLayer } from './JammerFieldLayer'
import { JammerVolumeLayer } from './JammerVolumeLayer'
import type { JammerMap } from './JammerFieldLayer'
import type { Trail } from './TrajectoryLayer'
import type { BaselinePlan } from '../../lib/baselineManifest'
import { PlacementLayer } from './PlacementLayer'
import { RewardLandscapeLayer } from './RewardLandscapeLayer'
import type { LandscapeView } from '../../lib/rewardLandscape'

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
  jammers: JammerState[]
  carrierHz: number
  sceneBounds: SceneBounds
  compact?: boolean
  rainRate: number
  scenario: string
  trails?: Trail[]
  replayPolicy?: string
  placementPlan?: BaselinePlan | null
  rewardLandscape?: LandscapeView | null
  mission?: { target: InvestigationTarget; investigatorCsvId: number | null } | null
  /** the jamming map, when it is switched on */
  jammerMap?: JammerMap | null
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
  jammers,
  carrierHz,
  sceneBounds,
  compact = false,
  rainRate,
  scenario,
  trails,
  replayPolicy,
  placementPlan,
  rewardLandscape,
  mission,
  jammerMap,
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
  // Models drawn a little larger than life on big sites so they read; fixed per scene, never per zoom
  const modelScale = Math.min(2.5, Math.max(1, gs / 300))
  // live replay path colour per node, matched through the nodes.json id
  const replayTrailColors = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of trails ?? []) {
      if (t.policy === replayPolicy && t.nodeId && t.points.length >= 2) {
        m.set(t.nodeId, nodeTrailColor(t.nodeIndex))
      }
    }
    return m
  }, [trails, replayPolicy])
  const camNear = Math.max(0.1, scale * 0.5)
  const camFar = Math.max(5000, gs * 4)

  // Frame what the nodes use, not the whole ground plane
  const view = Math.min(gs, sceneBounds.viewSpan * compactFactor)
  const camPos: [number, number, number] =
    dimensions === 2
      ? [sceneCX, view * 1.1, sceneCY]
      : dimensions === 1
        ? [sceneCX, 80 * (view / 500), view * 1.1]
        : [sceneCX - view * 0.35, view * 0.45, sceneCY + view * 0.75]

  return (
    <>
      {/* Camera and controls remount together, so the controls never hold a disposed camera */}
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
          key={`controls-${dimensions}`}
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
          key={`controls-${dimensions}`}
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
          key={`controls-${dimensions}`}
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
        extent={sceneBounds.extent}
        buildings={buildings}
        posScale={compactFactor}
        dim={dimensions}
      />

      {/* On the ground, under everything else */}
      {rewardLandscape && (
        <RewardLandscapeLayer
          view={rewardLandscape}
          dimensions={dimensions}
          posScale={compactFactor}
        />
      )}

      {/* Buildings */}
      {buildings.map((b) => (
        <BuildingObject
          key={b.id}
          building={b}
          dim={dimensions}
          posScale={compactFactor}
          scenario={scenario}
        />
      ))}

      {jammerMap && jammerMap.mode === 'volume' && dimensions === 3 && (
        <JammerVolumeLayer
          jammers={jammers}
          channel={jammerMap.channel}
          buildings={buildings}
          carrierHz={carrierHz}
          volume={jammerMap.volume}
          timeS={frame.time}
          nextTimeS={nextFrame?.time ?? null}
          alphaRef={alphaRef}
          posScale={compactFactor}
        />
      )}
      {jammerMap && dimensions !== 1 && (jammerMap.mode === 'slice' || dimensions === 2) && (
        <JammerFieldLayer
          jammers={jammers}
          channel={jammerMap.channel}
          buildings={buildings}
          carrierHz={carrierHz}
          grid={jammerMap.grid}
          heightM={jammerMap.heightM}
          timeS={frame.time}
          nextTimeS={nextFrame?.time ?? null}
          alphaRef={alphaRef}
          dim={dimensions}
          posScale={compactFactor}
        />
      )}

      {/* Jammer emitters are not mesh nodes or action slots. */}
      {jammers.map((jammer) => (
        <JammerObject
          key={jammer.id}
          jammer={jammer}
          timeS={frame.time}
          nextTimeS={nextFrame?.time ?? null}
          alphaRef={alphaRef}
          carrierHz={carrierHz}
          dim={dimensions}
          posScale={compactFactor}
        />
      ))}

      {/* Links (rendered before nodes so nodes draw on top) */}
      {links.map((l) => {
        const nA = nodeById.get(l.nodeA),
          nB = nodeById.get(l.nodeB)
        // An offline node has no radio: its rows stay in links.csv but are not links
        if (!nA || !nB || !nA.active || !nB.active) return null
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

      {trails && trails.length > 0 && (
        <TrajectoryLayer
          trails={trails}
          replayPolicy={replayPolicy}
          dim={dimensions}
          posScale={compactFactor}
          time={frame.time}
        />
      )}

      {placementPlan && (
        <PlacementLayer plan={placementPlan} dimensions={dimensions} posScale={compactFactor} />
      )}

      {mission && (
        <MissionTargetLayer
          target={mission.target}
          investigator={
            mission.investigatorCsvId === null ? undefined : nodeById.get(mission.investigatorCsvId)
          }
          nextInvestigator={
            mission.investigatorCsvId === null
              ? undefined
              : nextNodeById.get(mission.investigatorCsvId)
          }
          alphaRef={alphaRef}
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
            role={mission?.investigatorCsvId === n.id ? 'INVESTIGATOR' : undefined}
            trailTint={n.name !== undefined ? replayTrailColors.get(n.name) : undefined}
            modelScale={modelScale}
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
