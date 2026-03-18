import { Sphere, Box, Cone, Cylinder } from '@react-three/drei'
import type { NodeType } from '../../types'
import { NODE_SIZES } from '../../styles/tokens'

interface Props {
  nodeType: NodeType
  color: string
  emissive: string
  emissiveIntensity: number
}

export function NodeShape({ nodeType, color, emissive, emissiveIntensity }: Props) {
  const size = NODE_SIZES[nodeType]
  const mat = (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      roughness={0.3}
      metalness={0.4}
    />
  )
  if (nodeType === 'air') return <Cone args={[size, size * 2.5, 8]}>{mat}</Cone>
  if (nodeType === 'bs')
    return <Cylinder args={[size * 0.4, size * 0.6, size * 3, 8]}>{mat}</Cylinder>
  if (nodeType === 'vehicle') return <Box args={[size * 2.2, size * 0.7, size * 1.0]}>{mat}</Box>
  return <Sphere args={[size, 16, 12]}>{mat}</Sphere>
}
