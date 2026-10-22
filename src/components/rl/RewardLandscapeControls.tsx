import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type {
  ComponentScale,
  LandscapeView,
  RewardLandscape,
  SliceChoice,
} from '../../lib/rewardLandscape'
import { heatColor } from '../../lib/colorScale'
import { componentLabel } from '../../lib/rlLabels'
import { MOTION } from '../../styles/motion'
import { Segmented } from '../ui/Segmented'

interface Props {
  landscape: RewardLandscape | null
  error: string | null
  choice: SliceChoice | null
  view: LandscapeView | null
  shown: boolean
  onShown: (shown: boolean) => void
  fields: string[]
  field: string
  onField: (field: string) => void
  scale: ComponentScale
  onScale: (scale: ComponentScale) => void
  /** CSV id of the node selected in the scene, if any */
  selectedNode: number | null
  /** the decision the landscape was asked for (playhead or chosen), if known */
  wantedDecision: number | null
}

const LEGEND_STEPS = 7

const ABOUT =
  'The reward the selected node would have earned parked at each point, every other node held still. Discs are its five reachable moves; the white ring is the best.'

const fmt = (v: number) =>
  Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)

const fieldLabel = (f: string) => (f === 'total' ? 'Total reward' : componentLabel(f))

/** Where the numbers came from, in words */
function sourceLabel(landscape: RewardLandscape): string {
  const { method, seeds } = landscape.source
  if (method === 'synthetic') return 'Synthetic demo data'
  const seedText =
    seeds.length === 0
      ? ''
      : seeds.length === 1
        ? ` (seed ${seeds[0]})`
        : ` (mean of ${seeds.length} seeds)`
  if (method === 'channel_query') return `Simulator channel snapshot${seedText}`
  return `${method}${seedText}`
}

function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="7" cy="14" r="2" />
    </svg>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-base text-ink-2">{label}</span>
      <span className="text-base font-medium text-ink text-right">{children}</span>
    </div>
  )
}

/**
 * The reward map's place in the canvas toolbar: a toggle joined to a settings button whose
 * menu holds the field picker, colour scale and the shown slice's facts
 */
export function RewardLandscapeControls({
  landscape,
  error,
  choice,
  view,
  shown,
  onShown,
  fields,
  field,
  onField,
  scale,
  onScale,
  selectedNode,
  wantedDecision,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !ref.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  // The canvas clips its overlays, so the menu scrolls within the room left below it
  const [room, setRoom] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const el = ref.current
      if (!el) return
      let clip = el.parentElement
      while (clip && getComputedStyle(clip).overflow === 'visible') clip = clip.parentElement
      const bottom = clip ? clip.getBoundingClientRect().bottom : window.innerHeight
      // 12 px gap under the toolbar (mt-3) and 12 px above the canvas edge
      setRoom(Math.max(160, bottom - el.getBoundingClientRect().bottom - 24))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open])

  const slice = choice?.slice ?? null
  const domain = view?.domain ?? null
  const swatches = domain
    ? Array.from({ length: LEGEND_STEPS }, (_, i) => {
        const a = domain.lo + ((domain.hi - domain.lo) * i) / LEGEND_STEPS
        const b = domain.lo + ((domain.hi - domain.lo) * (i + 1)) / LEGEND_STEPS
        return { color: heatColor((a + b) / 2, domain), title: `${fmt(a)} to ${fmt(b)}` }
      })
    : []
  const best = view && view.best !== null ? (slice?.moves[view.best] ?? null) : null
  const bestValue = view && view.best !== null ? view.moveValues[view.best] : null
  const unavailable = error ? `Reward map unavailable: ${error}` : null

  const half = `inline-flex items-center justify-center h-11 text-base font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${MOTION.colors}`
  // solid tint, not the see-through wash: the scene would show through over the canvas
  const idle = 'bg-white text-ink hover:bg-accent-tint hover:text-accent-ink'
  const pressed = 'bg-accent-tint text-accent-ink'

  return (
    <div ref={ref} className="relative">
      <div className="inline-flex rounded-xl border border-hairline shadow-control overflow-hidden">
        <button
          type="button"
          onClick={() => onShown(!shown)}
          disabled={unavailable !== null}
          aria-pressed={shown}
          title={unavailable ?? ABOUT}
          className={`${half} px-4 ${shown ? pressed : idle}`}
        >
          Reward map
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={unavailable !== null || !landscape}
          aria-expanded={open}
          aria-label="Reward map settings"
          title="Reward map settings"
          className={`${half} w-11 border-l border-hairline ${open ? pressed : idle}`}
        >
          <SettingsIcon />
        </button>
      </div>

      {open && landscape && (
        <div
          role="dialog"
          aria-label="Reward map settings"
          style={room !== null ? { maxHeight: room } : undefined}
          className={`absolute right-0 top-full mt-3 z-20 w-[min(22rem,calc(100vw-2rem))] flex flex-col overflow-y-auto rounded-2xl border border-hairline bg-white shadow-glass ${MOTION.enter}`}
        >
          <div className="px-4 py-4 flex flex-col gap-4">
            {fields.length > 1 && (
              <div role="radiogroup" aria-label="Field" className="grid grid-cols-2 gap-1">
                {fields.map((f) => {
                  const active = f === field
                  return (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onField(f)}
                      className={`h-9 px-3 rounded-lg text-left text-base truncate ${MOTION.colors} ${
                        active
                          ? 'bg-accent-tint text-accent-ink font-medium'
                          : 'text-ink hover:bg-accent-wash'
                      }`}
                    >
                      {fieldLabel(f)}
                    </button>
                  )
                })}
              </div>
            )}

            {field !== 'total' && (
              <Segmented
                stretch
                options={[
                  { value: 'weighted' as const, label: 'Weighted' },
                  { value: 'raw' as const, label: 'Raw' },
                ]}
                value={scale}
                onChange={onScale}
              />
            )}

            {domain ? (
              <div className="flex flex-col gap-1.5">
                <div
                  className="flex h-3 rounded overflow-hidden"
                  role="img"
                  aria-label={`Colour scale from ${fmt(domain.lo)} to ${fmt(domain.hi)}`}
                >
                  {swatches.map((s, i) => (
                    <span
                      key={i}
                      className="flex-1"
                      style={{ background: s.color }}
                      title={s.title}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-sm text-ink tabular-nums">
                  <span className="font-mono">{fmt(domain.lo)}</span>
                  {domain.hi === domain.lo && <span>Same everywhere</span>}
                  <span className="font-mono">{fmt(domain.hi)}</span>
                </div>
              </div>
            ) : (
              <div className="text-base text-ink">No values at this decision.</div>
            )}
          </div>

          {slice && (
            <div className="px-4 pt-3 pb-4 border-t border-hairline flex flex-col gap-1.5">
              {choice?.nodeFallback && selectedNode !== null && (
                <div className="text-base text-ink">
                  Node <span className="font-mono">{selectedNode}</span> is not controlled; showing{' '}
                  <span className="font-mono">{slice.nodeId}</span>.
                </div>
              )}
              <Fact label="Node">
                <span className="font-mono">{slice.nodeId}</span>
              </Fact>
              <Fact label="Decision">
                <span className="font-mono tabular-nums">#{slice.decision}</span>
                {wantedDecision !== null && wantedDecision !== slice.decision && (
                  <span className="text-ink-2">
                    {' '}
                    (playhead <span className="font-mono tabular-nums">#{wantedDecision}</span>)
                  </span>
                )}
              </Fact>
              {best && bestValue !== null && (
                <Fact label="Best move">
                  {best.label} · <span className="font-mono tabular-nums">{fmt(bestValue)}</span>
                </Fact>
              )}
              {field === 'total' && slice.recorded?.total != null && (
                <Fact label="Recorded">
                  <span className="font-mono tabular-nums">{fmt(slice.recorded.total)}</span>
                </Fact>
              )}
              <Fact label="Data">{sourceLabel(landscape)}</Fact>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
