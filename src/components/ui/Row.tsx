interface Props {
  label: string
  value: string | number
}

export function Row({ label, value }: Props) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className="text-gray-800 text-xs font-mono">{value}</span>
    </div>
  )
}
