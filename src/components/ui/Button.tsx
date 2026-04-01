import type { ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'icon-round' | 'link'

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
    'px-6 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium transition-colors',
  ghost:
    'px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors bg-gray-100 text-gray-500 hover:text-gray-900 border border-gray-200',
  'icon-round':
    'w-9 h-9 flex items-center justify-center rounded-full bg-sky-500 hover:bg-sky-600 transition-colors text-white flex-shrink-0',
  link: 'text-xs text-gray-400 hover:text-gray-600 transition-colors',
}

const ACTIVE: Record<Variant, string> = {
  primary: '',
  ghost: 'bg-sky-500 text-white border-sky-500',
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
