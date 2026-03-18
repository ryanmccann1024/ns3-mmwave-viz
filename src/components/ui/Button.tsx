import type { ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'icon-round'

interface Props {
  variant?: Variant
  active?: boolean
  onClick?: () => void
  title?: string
  children: ReactNode
  className?: string
}

const BASE: Record<Variant, string> = {
  primary:
    'px-6 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-sky-100 text-sm font-medium transition-colors',
  ghost:
    'px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors bg-slate-700 text-slate-400 hover:text-slate-200',
  'icon-round':
    'w-9 h-9 flex items-center justify-center rounded-full bg-sky-600 hover:bg-sky-500 transition-colors text-white flex-shrink-0',
}

const ACTIVE: Record<Variant, string> = {
  primary: '',
  ghost: 'bg-sky-700 text-sky-100',
  'icon-round': '',
}

export function Button({
  variant = 'ghost',
  active = false,
  onClick,
  title,
  children,
  className,
}: Props) {
  const base = BASE[variant]
  const activeClass = active ? ACTIVE[variant] : ''
  return (
    <button onClick={onClick} title={title} className={`${base} ${activeClass} ${className ?? ''}`}>
      {children}
    </button>
  )
}
