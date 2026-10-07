import { actionColor } from '../../styles/tokens'

interface Props {
  /** action index inside contract.action_meanings */
  index: number
  /** the recorded meaning; null when the index is outside the contract */
  meaning: string | null
  /** the simulator re-checked this slot: ring plus an "R" badge, never color alone */
  revalidated?: boolean
  /** dim the glyph when the mask forbade this action */
  allowed?: boolean
  size?: 'sm' | 'md'
  label?: string
}

/** One compact action mark: color via actionColor, the meaning in `title` and for assistive tech. */
export function ActionGlyph({
  index,
  meaning,
  revalidated = false,
  allowed = true,
  size = 'md',
  label,
}: Props) {
  const name = meaning ?? `action ${index}`
  const letter = (meaning ?? '?').trim().charAt(0).toUpperCase() || '?'
  const box = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
  const text = `${label ? `${label}: ` : ''}${name}${revalidated ? ' (revalidated)' : ''}${
    allowed ? '' : ' (masked out)'
  }`
  return (
    <span
      className="relative inline-flex items-center justify-center flex-shrink-0"
      title={text}
      aria-label={text}
      role="img"
    >
      <span
        className={`${box} inline-flex items-center justify-center rounded-md font-semibold text-white ${
          revalidated ? 'ring-2 ring-offset-1 ring-ink' : ''
        }`}
        style={{ backgroundColor: actionColor(name, index), opacity: allowed ? 1 : 0.3 }}
      >
        {letter}
      </span>
      {revalidated && (
        <span className="absolute -top-1 -right-1 rounded-full bg-ink text-white text-[10px] leading-3 px-1 font-bold">
          R
        </span>
      )}
    </span>
  )
}
