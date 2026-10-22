import { useState } from 'react'
import type { ReactNode } from 'react'
import { MOTION } from '../../styles/motion'
import { SECONDARY_BUTTON } from './Button'

interface Props {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

/**
 * A titled section that stays folded until asked for. Children mount on first open (a folded
 * section reads none of its data) and then stay mounted, so both opening and closing animate:
 * the height eases via grid rows while the content fades. Content is clipped only while
 * folding or folded; once open it may overflow, so card rings and shadows are not cut off.
 */
export function Disclosure({ title, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [mounted, setMounted] = useState(defaultOpen)
  const [settled, setSettled] = useState(defaultOpen)
  return (
    <div className="border-t border-ink/[0.06] first:border-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setMounted(true)
          setSettled(false)
          setOpen((o) => !o)
        }}
        className="group w-full min-h-16 flex items-center justify-between gap-4 py-3 text-left"
      >
        <span
          className={`text-lg font-semibold text-ink-title group-hover:text-ink ${MOTION.colors}`}
        >
          {title}
        </span>
        <span
          className={`flex-shrink-0 w-[4.5rem] ${SECONDARY_BUTTON} group-hover:bg-accent-wash group-hover:text-accent-ink`}
        >
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-slow ease-standard"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) setSettled(open)
        }}
      >
        <div className={`min-h-0 ${open && settled ? '' : 'overflow-hidden'}`}>
          {mounted && (
            <div
              className={`pb-4 ${MOTION.fade} ${open ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={!open}
              // inert keeps Tab out of a folded section; React 18's types predate the attribute
              {...({ inert: open ? undefined : '' } as Record<string, string | undefined>)}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
