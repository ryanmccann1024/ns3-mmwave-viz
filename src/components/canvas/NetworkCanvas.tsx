import { Canvas } from '@react-three/fiber'
import type { SimFrame } from '../../types'
import { Scene } from './Scene'

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
      style={{ background: '#020917' }}
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
