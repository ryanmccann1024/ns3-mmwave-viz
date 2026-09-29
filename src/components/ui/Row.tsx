interface Props {
  label: string
  value: string | number
}

export function Row({ label, value }: Props) {
  return (
    <div className="flex justify-between items-center gap-4 py-2 border-b border-ink/[0.06] last:border-0">
      <span className="text-muted text-sm">{label}</span>
      <span className="text-ink text-sm font-mono tabular-nums text-right break-all">{value}</span>
    </div>
  )
}
