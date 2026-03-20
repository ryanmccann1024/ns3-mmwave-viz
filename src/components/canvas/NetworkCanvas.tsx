import { Canvas } from '@react-three/fiber'
import type { SimFrame, BuildingState } from '../../types'
import { Scene } from './Scene'

interface Props {
  frame: SimFrame
  nextFrame: SimFrame | null
  /** Shared mutable ref — updated every RAF tick, read inside useFrame */
  frameAlphaRef: React.MutableRefObject<number>
  buildings: BuildingState[]
  selectedNode: number | null
  selectedLink: string | null
  onSelectNode: (id: number | null) => void
  onSelectLink: (key: string | null) => void
  dimensions?: 1 | 2 | 3
}

export function NetworkCanvas({
  frame,
  nextFrame,
  frameAlphaRef,
  buildings,
  selectedNode,
  selectedLink,
  onSelectNode,
  onSelectLink,
  dimensions = 3,
}: Props) {
  return (
    <Canvas
      style={{ background: '#ffffff' }}
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
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        onSelectNode={onSelectNode}
        onSelectLink={onSelectLink}
        dimensions={dimensions}
      />
    </Canvas>
  )
}
