import type { ReactNode } from 'react'

interface Props {
  title?: ReactNode
  /** count or status shown beside the title */
  meta?: ReactNode
  /** controls on the right of the header */
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** classes for the body wrapper (padding, scrolling) */
  bodyClassName?: string
}

/** Frosted dashboard card with an optional header row */
export function Panel({ title, meta, actions, children, className, bodyClassName }: Props) {
  return (
    <section className={`glass flex flex-col min-h-0 ${className ?? ''}`}>
      {(title || actions) && (
        <header className="flex items-center gap-3 px-5 pt-4 pb-3 flex-shrink-0">
          {title && <h2 className="text-base font-semibold text-ink-title">{title}</h2>}
          {meta !== undefined && (
            <span className="text-[11px] font-medium text-muted bg-white/70 border border-hairline rounded-full px-2 leading-5 tabular-nums">
              {meta}
            </span>
          )}
          {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? 'px-5 pb-5'}>{children}</div>
    </section>
  )
}
