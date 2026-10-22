import { phaseBadgeClass } from '../../styles/tokens'

/** A mission campaign phase as a coloured pill, one hue per phase */
export function PhasePill({ phase, size = 'md' }: { phase: number | null; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'text-xs px-2 py-px' : 'text-sm px-3 py-0.5'
  return (
    <span
      className={`inline-flex items-center font-semibold border rounded-full whitespace-nowrap ${pad} ${phaseBadgeClass(phase)}`}
    >
      Phase {phase ?? '?'}
    </span>
  )
}
