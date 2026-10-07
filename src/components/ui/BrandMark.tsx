/** Solid accent tile with a signal glyph */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="rounded-xl bg-accent flex items-center justify-center text-white flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M5 12.5a10 10 0 0 1 14 0" />
        <path d="M8.5 16a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19.5" r="1" fill="currentColor" />
      </svg>
    </div>
  )
}
