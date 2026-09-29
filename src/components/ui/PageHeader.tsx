import type { ReactNode } from 'react'
import type { Crumb } from './Breadcrumbs'

interface Props {
  title: string
  subtitle?: ReactNode
  /** levels above this page, each one a way back */
  parents?: Crumb[]
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, parents, actions }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        {parents && parents.length > 0 && (
          <div className="flex items-center gap-1.5 text-[13px] mb-1">
            {parents.map((c) => (
              <span key={c.label} className="flex items-center gap-1.5">
                <button
                  onClick={c.onClick}
                  className="text-muted hover:text-accent-ink font-medium transition-colors"
                >
                  {c.label}
                </button>
                <span className="text-faint">/</span>
              </span>
            ))}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-title truncate">{title}</h1>
        {subtitle && <div className="text-sm text-muted mt-0.5">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
