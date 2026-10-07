interface Props {
  label: string
  value: string
  accentClass?: string
}

/** KPI tile: one big number over a short label */
export function StatItem({ label, value, accentClass }: Props) {
  return (
    <div className="tile px-4 py-3 min-w-0">
      <div
        className={`text-2xl font-semibold tracking-tight truncate ${accentClass ?? 'text-ink-title'}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-sm font-medium text-ink-2">{label}</div>
    </div>
  )
}
