import { useState } from 'react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

/** A titled section that stays folded until asked for */
export function Disclosure({ title, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-ink/[0.06] first:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        <span className="text-sm font-medium text-ink-title">{title}</span>
        <span className="text-[11px] font-medium text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}
