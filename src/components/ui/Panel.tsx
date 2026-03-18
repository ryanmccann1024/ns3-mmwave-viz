import type { ReactNode } from 'react'

interface Props {
  className?: string
  children: ReactNode
}

export function Panel({ className, children }: Props) {
  return (
    <div className={`bg-slate-800/60 border border-slate-700 rounded-xl ${className ?? ''}`}>
      {children}
    </div>
  )
}
