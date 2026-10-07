interface Props {
  label: string
  value: string | number
}

/** One label/value line in a divided list */
export function Row({ label, value }: Props) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2.5 border-b border-hairline last:border-0">
      <span className="text-base text-ink-2">{label}</span>
      <span className="text-base font-medium text-ink tabular-nums text-right break-all">
        {value}
      </span>
    </div>
  )
}
