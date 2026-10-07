export interface Crumb {
  label: string
  onClick?: () => void
}

/** Where you are, and a click back to any level above it */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-[13px] min-w-0">
      {items.map((c, i) => {
        const last = i === items.length - 1
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
            {c.onClick && !last ? (
              <button
                onClick={c.onClick}
                className="text-muted hover:text-accent-ink font-medium whitespace-nowrap transition-colors"
              >
                {c.label}
              </button>
            ) : (
              <span className="text-ink-title font-semibold truncate">{c.label}</span>
            )}
            {!last && <span className="text-faint">/</span>}
          </span>
        )
      })}
    </nav>
  )
}
