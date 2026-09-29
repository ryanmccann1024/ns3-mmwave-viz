import { Canvas } from '@react-three/fiber'
import type { SimFrame, BuildingState, SimMeta, JammerState } from '../../types'
import type { SceneBounds } from '../../hooks/useSimData'
import { Scene } from './Scene'
import type { Trail } from './TrajectoryLayer'
import { getScenarioTheme } from '../../styles/scenarioThemes'

interface Props {
  frame: SimFrame
  nextFrame: SimFrame | null
  /** Shared mutable ref — updated every RAF tick, read inside useFrame */
  frameAlphaRef: React.MutableRefObject<number>
  buildings: BuildingState[]
  jammers: JammerState[]
  sceneBounds: SceneBounds
  meta: SimMeta | null
  compact?: boolean
  selectedNode: number | null
  selectedLink: string | null
  selectedFlow: { src: number; dst: number } | null
  onSelectNode: (id: number | null) => void
  onSelectLink: (key: string | null) => void
  dimensions?: 1 | 2 | 3
  trails?: Trail[]
}

export function NetworkCanvas({
  frame,
  nextFrame,
  frameAlphaRef,
  buildings,
  jammers,
  sceneBounds,
  meta,
  compact = false,
  selectedNode,
  selectedLink,
  selectedFlow,
  onSelectNode,
  onSelectLink,
  dimensions = 3,
  trails,
}: Props) {
  const scenario = meta?.scenario ?? ''
  const theme = getScenarioTheme(scenario)

  return (
    <Canvas
      style={{ background: theme.canvasBackground }}
      frameloop="always"
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
      />
    </Canvas>
  )
}
