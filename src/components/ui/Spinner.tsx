const SIZES = {
  sm: 'w-5 h-5 border-2',
  md: 'w-7 h-7 border-[3px]',
  lg: 'w-10 h-10 border-[3px]',
} as const

type Size = keyof typeof SIZES

/** Spinning ring; decorative, so pair it with a label or wrap it in `Loading` */
export function Spinner({ size = 'md', className }: { size?: Size; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex-shrink-0 rounded-full border-accent/20 border-t-accent animate-spin ${SIZES[size]} ${className ?? ''}`}
    />
  )
}

/** Spinner beside (or above, when `stacked`) a short label, announced as a status */
export function Loading({
  label,
  size = 'md',
  stacked = false,
  className,
}: {
  label: string
  size?: Size
  stacked?: boolean
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center ${stacked ? 'flex-col gap-4 text-center' : 'gap-3'} ${className ?? ''}`}
    >
      <Spinner size={size} />
      <span className={`${size === 'lg' ? 'text-lg' : 'text-base'} font-medium text-ink-2`}>
        {label}
      </span>
    </div>
  )
}
