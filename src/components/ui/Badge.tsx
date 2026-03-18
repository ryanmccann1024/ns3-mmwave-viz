interface Props {
  label: string
  colorClass: string
}

export function Badge({ label, colorClass }: Props) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}>
      {label}
    </span>
  )
}
