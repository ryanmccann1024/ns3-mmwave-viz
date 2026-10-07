const WIDTHS = ['100%', '85%', '70%']

/** Flat placeholder bars that breathe while content loads */
export function Skeleton({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-2 ${className ?? ''}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-muted/15 animate-pulse-soft"
          style={{ width: WIDTHS[i % WIDTHS.length] }}
        />
      ))}
    </div>
  )
}
