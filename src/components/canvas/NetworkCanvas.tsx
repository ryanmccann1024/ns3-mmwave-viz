import { Canvas } from '@react-three/fiber'
import type { SimFrame, BuildingState, SimMeta, JammerState } from '../../types'
import type { SceneBounds } from '../../hooks/useSimData'
import { Scene } from './Scene'
import type { JammerMap } from './JammerFieldLayer'
import type { Trail } from './TrajectoryLayer'
import type { BaselinePlan } from '../../lib/baselineManifest'
import type { InvestigationTarget } from '../../lib/missionTarget'
import type { RadioChannel } from '../../lib/runIni'
import { getScenarioTheme } from '../../styles/scenarioThemes'
import type { LandscapeView } from '../../lib/rewardLandscape'

interface Props {
  frame: SimFrame
  nextFrame: SimFrame | null
  /** Shared mutable ref — updated every RAF tick, read inside useFrame */
  frameAlphaRef: React.MutableRefObject<number>
  buildings: BuildingState[]
  jammers: JammerState[]
  sceneBounds: SceneBounds
  meta: SimMeta | null
  /** run.ini channel settings; its 3GPP scenario picks the scene's look */
  channel?: RadioChannel | null
  compact?: boolean
  selectedNode: number | null
  selectedLink: string | null
  selectedFlow: { src: number; dst: number } | null
  onSelectNode: (id: number | null) => void
  onSelectLink: (key: string | null) => void
  dimensions?: 1 | 2 | 3
  trails?: Trail[]
  replayPolicy?: string
  placementPlan?: BaselinePlan | null
  /** reward landscape drawn on the ground for the chosen node and decision */
  rewardLandscape?: LandscapeView | null
  /** an investigation's goal, and the CSV id of its investigator when known */
  mission?: { target: InvestigationTarget; investigatorCsvId: number | null } | null
  jammerMap?: JammerMap | null
}

export function NetworkCanvas({
  frame,
  nextFrame,
  frameAlphaRef,
  buildings,
  jammers,
  sceneBounds,
  meta,
  channel,
  compact = false,
  selectedNode,
  selectedLink,
  selectedFlow,
  onSelectNode,
  onSelectLink,
  dimensions = 3,
  trails,
  replayPolicy,
  placementPlan,
  rewardLandscape,
  mission,
  jammerMap,
}: Props) {
  // The 3GPP model from run.ini decides the look; the scenario label is often a run name
  const declared = channel?.scenario || (meta?.scenario !== 'Unknown' ? meta?.scenario : '') || ''
  // An unrecognised run with buildings is a street scene; give it the urban look
  const scenario = getScenarioTheme(declared).site || buildings.length === 0 ? declared : 'UMi'
  const theme = getScenarioTheme(scenario)

  return (
    <Canvas
      style={{ background: theme.canvasBackground }}
      frameloop="always"
      shadows
      // log depth keeps ground, roads and footprints from z-fighting at city scale
      gl={{ logarithmicDepthBuffer: true }}
      onPointerMissed={() => {
        onSelectNode(null)
        onSelectLink(null)
      }}
    >
      <Scene
        frame={frame}
        nextFrame={nextFrame}
        alphaRef={frameAlphaRef}
        buildings={buildings}
        jammers={jammers}
        carrierHz={meta?.frequency ?? 0}
        sceneBounds={sceneBounds}
        compact={compact}
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        selectedFlow={selectedFlow}
        onSelectNode={onSelectNode}
        onSelectLink={onSelectLink}
        dimensions={dimensions}
        rainRate={meta?.rainRate ?? 0}
        scenario={scenario}
        trails={trails}
        replayPolicy={replayPolicy}
        placementPlan={placementPlan}
        rewardLandscape={rewardLandscape}
        mission={mission}
        jammerMap={jammerMap}
      />
    </Canvas>
  )
}
