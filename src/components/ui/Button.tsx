import type { ReactNode } from 'react'
import { MOTION } from '../../styles/motion'

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon-round' | 'link'

interface Props {
  variant?: Variant
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
  children: ReactNode
  className?: string
  'aria-label'?: string
  'aria-pressed'?: boolean
}

// Raised variants settle by one pixel on press; colour and lift share the fast duration
const PRESS = `active:translate-y-px ${MOTION.lift}`

/**
 * The site's standard button: white, hairline border, the same height as the breadcrumb bar
 * and seed buttons. Exported so toggles that are not <Button> (Show/Hide) can wear it too.
 */
export const SECONDARY_BUTTON = `inline-flex items-center justify-center h-10 px-4 rounded-xl text-base font-medium whitespace-nowrap bg-white text-ink border border-hairline shadow-control hover:bg-accent-wash hover:text-accent-ink ${MOTION.colors}`

const BASE: Record<Variant, string> = {
  primary: `px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-ink text-white text-sm font-semibold shadow-control ${MOTION.colors} ${PRESS}`,
  secondary: `${SECONDARY_BUTTON} ${PRESS}`,
  ghost: `px-2.5 py-1 rounded-lg text-xs font-medium ${MOTION.colors} ${PRESS} bg-white/70 text-ink-2 hover:bg-white hover:text-ink border border-hairline shadow-control`,
  'icon-round': `w-10 h-10 flex items-center justify-center rounded-full bg-accent hover:bg-accent-ink ${MOTION.colors} text-white flex-shrink-0 shadow-control`,
  link: `text-xs text-muted hover:text-ink ${MOTION.colors}`,
}

const ACTIVE: Record<Variant, string> = {
  primary: '',
  secondary: '',
  ghost: '!bg-ink !text-white !border-ink',
  'icon-round': '',
  link: '',
}

export function Button({
  variant = 'ghost',
  active = false,
  disabled = false,
  onClick,
  title,
  children,
  className,
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
}: Props) {
  const base = BASE[variant]
  const activeClass = active ? ACTIVE[variant] : ''
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`${base} ${activeClass} ${className ?? ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}
