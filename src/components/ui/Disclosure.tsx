import { useState } from 'react'
import type { ReactNode } from 'react'
import { MOTION } from '../../styles/motion'

interface Props {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

/**
 * A titled section that stays folded until asked for. Children mount only while open
 * (some re-read their data on mount), so the grid-rows transition plays on open and the
 * close snaps shut.
 */
export function Disclosure({ title, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-ink/[0.06] first:border-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group w-full flex items-center justify-between py-3 text-left"
      >
        <span
          className={`text-sm font-medium text-ink-title group-hover:text-ink ${MOTION.colors}`}
        >
          {title}
        </span>
        <span
          className={`text-[11px] font-medium text-muted group-hover:text-ink ${MOTION.colors}`}
        >
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-base ease-standard"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          {open && <div className={`pb-4 ${MOTION.fade} ${MOTION.enterFade}`}>{children}</div>}
        </div>
      </div>
    </div>
  )
}
