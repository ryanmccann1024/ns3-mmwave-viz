import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
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
  /** lg is a joined bar like the breadcrumbs and seed buttons, for page-level choices */
  size?: 'sm' | 'md' | 'lg'
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
  if (size === 'lg') {
    return (
      <JoinedTabs
        options={options}
        value={value}
        onChange={onChange}
        stretch={stretch}
        className={className}
      />
    )
  }
  return (
    <PillTabs
      options={options}
      value={value}
      onChange={onChange}
      size={size}
      stretch={stretch}
      className={className}
    />
  )
}

/** Where the selected option sits in the bar, kept current as the bar resizes */
function useThumb(bar: RefObject<HTMLDivElement>, index: number, count: number) {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const measure = () => {
      // first child is the highlight itself
      const option = el.children[index + 1] as HTMLElement | undefined
      setBox(option ? { left: option.offsetLeft, width: option.offsetWidth } : null)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [bar, index, count])
  return box
}

/** The pill track: a raised white thumb that glides to the chosen option */
function PillTabs<T extends string | number>({
  options,
  value,
  onChange,
  size,
  stretch,
  className,
}: Props<T>) {
  const barRef = useRef<HTMLDivElement>(null)
  const box = useThumb(
    barRef,
    options.findIndex((o) => o.value === value),
    options.length
  )
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
  return (
    <div
      ref={barRef}
      className={`relative ${stretch ? 'flex' : 'inline-flex'} items-center gap-0.5 p-0.5 rounded-lg bg-ink/[0.05] border border-white/60 ${className ?? ''}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 bottom-0.5 left-0 rounded-md bg-white shadow-control pointer-events-none ${box ? MOTION.slide : ''}`}
        style={
          box
            ? { transform: `translateX(${box.left}px)`, width: box.width }
            : { width: 0, opacity: 0 }
        }
      />
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => !o.disabled && onChange(o.value)}
            disabled={o.disabled}
            className={`relative ${pad} ${stretch ? 'flex-1' : ''} rounded-md font-medium whitespace-nowrap ${MOTION.colors} ${
              active
                ? 'text-ink'
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

/**
 * The large joined bar (like the breadcrumbs and seed buttons). The selected highlight is one
 * element that glides to the chosen option, so switching tabs reads as movement, not a jump.
 */
function JoinedTabs<T extends string | number>({
  options,
  value,
  onChange,
  stretch,
  className,
}: Omit<Props<T>, 'size'>) {
  const barRef = useRef<HTMLDivElement>(null)
  const box = useThumb(
    barRef,
    options.findIndex((o) => o.value === value),
    options.length
  )

  return (
    <div
      ref={barRef}
      className={`relative ${stretch ? 'flex' : 'inline-flex'} max-w-full rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-x divide-hairline [&>button:first-of-type]:!border-l-0 ${className ?? ''}`}
    >
      {/* first child: the gliding highlight (divide-x skips it, it has no border) */}
      <span
        aria-hidden="true"
        className={`absolute top-0 bottom-0 left-0 bg-accent-wash !border-0 pointer-events-none ${box ? MOTION.slide : ''}`}
        style={
          box
            ? { transform: `translateX(${box.left}px)`, width: box.width }
            : { width: 0, opacity: 0 }
        }
      />
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => !o.disabled && onChange(o.value)}
            disabled={o.disabled}
            className={`relative h-11 ${stretch ? 'flex-1 px-2' : 'px-5'} text-base whitespace-nowrap ${MOTION.colors} ${
              active
                ? 'text-accent-ink font-semibold'
                : o.disabled
                  ? 'text-ink-2/50 font-medium cursor-not-allowed'
                  : 'text-ink-2 font-medium hover:text-ink hover:bg-accent-wash/40'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
