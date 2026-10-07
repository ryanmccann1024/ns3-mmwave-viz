import { MOTION } from '../../styles/motion'

export interface Crumb {
  label: string
  onClick?: () => void
}

/**
 * Where you are, as one joined bar like the seed buttons: each level above is a large
 * target back to it, and the last segment marks the current page
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="self-start max-w-full min-w-0 flex rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-x divide-hairline"
    >
      {items.map((c, i) => {
        const last = i === items.length - 1
        return c.onClick && !last ? (
          <button
            key={`${c.label}-${i}`}
            type="button"
            onClick={c.onClick}
            title={c.label}
            className={`h-10 px-4 min-w-0 max-w-[16rem] truncate text-base font-medium text-ink-2 hover:bg-accent-wash hover:text-accent-ink ${MOTION.colors}`}
          >
            {c.label}
          </button>
        ) : (
          <span
            key={`${c.label}-${i}`}
            aria-current={last ? 'page' : undefined}
            title={c.label}
            className={`h-10 leading-10 px-4 min-w-0 truncate text-base ${last ? 'max-w-[24rem] font-semibold text-ink bg-hairline/40' : 'max-w-[16rem] font-medium text-ink-2'}`}
          >
            {c.label}
          </span>
        )
      })}
    </nav>
  )
}
