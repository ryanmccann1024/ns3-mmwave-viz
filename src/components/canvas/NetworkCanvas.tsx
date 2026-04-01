import { Canvas } from '@react-three/fiber'
import type { SimFrame, BuildingState, SimMeta } from '../../types'
import type { SceneBounds } from '../../hooks/useSimData'
import { Scene } from './Scene'
import { getScenarioTheme } from '../../styles/scenarioThemes'

interface Props {
  frame: SimFrame
  nextFrame: SimFrame | null
  /** Shared mutable ref — updated every RAF tick, read inside useFrame */
  frameAlphaRef: React.MutableRefObject<number>
  buildings: BuildingState[]
  sceneBounds: SceneBounds
  meta: SimMeta | null
  selectedNode: number | null
  selectedLink: string | null
  selectedFlow: { src: number; dst: number } | null
  onSelectNode: (id: number | null) => void
  onSelectLink: (key: string | null) => void
  dimensions?: 1 | 2 | 3
}

export function NetworkCanvas({
  frame,
  nextFrame,
  frameAlphaRef,
  buildings,
  sceneBounds,
  meta,
  selectedNode,
  selectedLink,
  selectedFlow,
  onSelectNode,
  onSelectLink,
  dimensions = 3,
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
        sceneBounds={sceneBounds}
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        selectedFlow={selectedFlow}
        onSelectNode={onSelectNode}
        onSelectLink={onSelectLink}
        dimensions={dimensions}
        rainRate={meta?.rainRate ?? 0}
        scenario={scenario}
      />
    </Canvas>
  )
}
