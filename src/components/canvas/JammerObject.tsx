import { Html } from '@react-three/drei'
import type { JammerState } from '../../types'
import { jammerActivity, jammerPositionAt } from '../../lib/jammers'
import { simToThree } from './utils/coordinates'

interface Props {
  jammer: JammerState
  timeS: number
  carrierHz: number
  dim: 1 | 2 | 3
  posScale: number
}

/** A transmitter marker, deliberately not a coverage boundary. */
export function JammerObject({ jammer, timeS, carrierHz, dim, posScale }: Props) {
  const position = jammerPositionAt(jammer, timeS)
  const activity = jammerActivity(jammer, timeS, carrierHz)
  const on = activity !== 'off'
  const color = on ? '#e11d48' : '#94a3b8'
  const [x, y, z] = simToThree(position.x, position.y, position.z, dim, posScale)

  return (
    <Html position={[x, y, z]} center style={{ pointerEvents: 'none' }}>
      <svg
        width="38"
        height="38"
        viewBox="0 0 44 44"
        role="img"
        aria-label={jammer.id}
        style={{ filter: 'drop-shadow(0 2px 3px rgba(10, 19, 36, 0.45))' }}
      >
        <path d="M22 2 42 22 22 42 2 22Z" fill={color} stroke="white" strokeWidth="2" />
        <path d="m26 9-12 15h8l-4 11 13-17h-8l3-9Z" fill="white" />
      </svg>
    </Html>
  )
}
