interface Props {
  label: string
  value: string
  accentClass?: string
}

/** KPI tile: one big number over a short label */
export function StatItem({ label, value, accentClass }: Props) {
  return (
    <div className="tile px-3 py-1.5 min-w-[5.5rem]">
      <div
        className={`text-lg leading-6 font-semibold tabular-nums tracking-tight ${accentClass ?? 'text-ink'}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted whitespace-nowrap">{label}</div>
    </div>
  )
}
