interface Props {
  label: string
  value: string
  accentClass?: string
}

export function StatItem({ label, value, accentClass }: Props) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 border-r border-gray-200 last:border-0">
      <div className={`text-lg font-bold font-mono ${accentClass ?? 'text-gray-800'}`}>{value}</div>
      <div className="text-xs text-gray-400 whitespace-nowrap">{label}</div>
    </div>
  )
}
