import { MOTION } from '../../styles/motion'

interface Option<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
}

interface Props<T extends string | number> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  /** spread options across the full width */
  stretch?: boolean
  className?: string
}

/** Pill track with a raised thumb on the selected option */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  stretch = false,
  className,
}: Props<T>) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
  return (
    <div
      className={`${stretch ? 'flex' : 'inline-flex'} items-center gap-0.5 p-0.5 rounded-lg bg-ink/[0.05] border border-white/60 ${className ?? ''}`}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => !o.disabled && onChange(o.value)}
            disabled={o.disabled}
            className={`${pad} ${stretch ? 'flex-1' : ''} rounded-md font-medium whitespace-nowrap ${MOTION.colors} ${
              active
                ? 'bg-white text-ink shadow-control'
                : o.disabled
                  ? 'text-faint/60 cursor-not-allowed'
                  : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
