import type { ReactNode } from 'react'

interface Props {
  className?: string
  children: ReactNode
}

export function Panel({ className, children }: Props) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl ${className ?? ''}`}>
      {children}
    </div>
  )
}
