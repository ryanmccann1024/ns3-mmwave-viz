import type { ReactNode } from 'react'
import { Breadcrumbs, type Crumb } from './Breadcrumbs'

interface Props {
  title: string
  subtitle?: ReactNode
  /** levels above this page, each one a way back */
  parents?: Crumb[]
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, parents, actions }: Props) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex flex-col gap-4">
        {parents && parents.length > 0 && <Breadcrumbs items={[...parents, { label: title }]} />}
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink-title truncate">
          {title}
        </h1>
        {subtitle && <div className="text-base text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
