import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon-round' | 'link'

interface Props {
  variant?: Variant
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
  children: ReactNode
  className?: string
}

const BASE: Record<Variant, string> = {
  primary:
    'px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-ink text-white text-sm font-semibold shadow-control transition-colors',
  secondary:
    'px-3.5 py-2 rounded-xl text-sm font-medium transition-colors bg-white text-ink border border-hairline shadow-control hover:bg-white/60',
  ghost:
    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors bg-white/70 text-ink-2 hover:bg-white hover:text-ink border border-hairline shadow-control',
  'icon-round':
    'w-10 h-10 flex items-center justify-center rounded-full bg-accent hover:bg-accent-ink transition-colors text-white flex-shrink-0 shadow-control',
  link: 'text-xs text-muted hover:text-ink transition-colors',
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
}: Props) {
  const base = BASE[variant]
  const activeClass = active ? ACTIVE[variant] : ''
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`${base} ${activeClass} ${className ?? ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}
