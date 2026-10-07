interface Props {
  label: string
  colorClass: string
}

export function Badge({ label, colorClass }: Props) {
  return (
    <span
      className={`inline-block px-2 rounded-full text-[10px] leading-[18px] font-semibold tracking-wide ${colorClass}`}
    >
      {label}
    </span>
  )
}
