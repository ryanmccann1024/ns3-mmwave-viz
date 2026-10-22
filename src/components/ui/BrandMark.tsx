/** Mesh signal blue on the ink tile: lighter than the accent so it holds up on the dark */
const MESH = '#5b9dff'

/**
 * Ink tile with a targeting frame around a three-node mesh. public/favicon.svg draws the
 * same mark for the browser tab; change both together.
 */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="bg-ink flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, borderRadius: size * 0.26 }}
    >
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 32 32" fill="none">
        {/* Corner brackets of a sight */}
        <path
          d="M4 9V4h5M23 4h5v5M28 23v5h-5M9 28H4v-5"
          stroke="white"
          strokeWidth="2.25"
          strokeLinecap="square"
        />
        {/* Mesh links, then the nodes over them */}
        <path d="M16 8 9 21h14Z" stroke={MESH} strokeWidth="2" strokeLinejoin="round" />
        <path d="M16 4.5 19.5 8 16 11.5 12.5 8Z" fill="white" />
        <circle cx="9" cy="21" r="2.75" fill="white" />
        <circle cx="23" cy="21" r="2.75" fill="white" />
      </svg>
    </div>
  )
}
