import { useEffect, useMemo, useRef, useState } from 'react'
import type { DecisionIndex, EpisodeTelemetry } from '../../lib/decisionExplorer'
import { makeRowIndex } from '../../lib/decisionExplorer'
import { recordForDecision } from '../../lib/episodeTelemetry'
import { ActionGlyph } from './ActionGlyph'

interface Props {
  telemetry: EpisodeTelemetry
  index: DecisionIndex
  range: [number, number]
  selectedDecision: number | null
  focusSlot: number | null
  onSelect: (decision: number) => void
  /** visible rows (row height is fixed at 40 px) */
  visibleRows?: number
}

const ROW_PX = 40
const OVERSCAN = 8
const JOINT_GLYPHS = 6

/**
 * A windowed list over the decisions in `range`: fixed-height rows, only the
 * visible window is rendered, consecutive holes collapse into one row.
 */
export function DecisionList({
  telemetry,
  index,
  range,
  selectedDecision,
  focusSlot,
  onSelect,
  visibleRows = 12,
}: Props) {
  const rows = useMemo(() => makeRowIndex(index, range), [index, range])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const viewport = visibleRows * ROW_PX
  const meanings = telemetry.header.contract.action_meanings

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_PX) + OVERSCAN)

  // Keep the selected decision in view when it changes from outside the list
  useEffect(() => {
    if (selectedDecision === null || !scrollRef.current) return
    // Binary search the row position: rows are decision-ordered
    let lo = 0
    let hi = rows.length - 1
    let pos = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const row = rows.rowAt(mid)
      if (!row) break
      const key = row.kind === 'decision' ? row.decision : row.gap.afterDecision + 0.5
      if (key === selectedDecision) {
        pos = mid
        break
      }
      if (key < selectedDecision) lo = mid + 1
      else hi = mid - 1
    }
    if (pos < 0) return
    const el = scrollRef.current
    const top = pos * ROW_PX
    if (top < el.scrollTop || top + ROW_PX > el.scrollTop + viewport) {
      el.scrollTop = Math.max(0, top - viewport / 2 + ROW_PX / 2)
    }
  }, [selectedDecision, rows, viewport])

  const items: React.ReactNode[] = []
  for (let i = first; i < last; i++) {
    const row = rows.rowAt(i)
    if (!row) continue
    const top = i * ROW_PX
    if (row.kind === 'gap') {
      const g = row.gap
      const a = g.afterDecision + 1
      const b = g.beforeDecision - 1
      items.push(
        <li
          key={`gap-${a}`}
          role="listitem"
          className="absolute left-0 right-0 flex items-center px-3 text-sm text-ink-2 bg-ink/[0.03] rounded-lg"
          style={{ top, height: ROW_PX }}
        >
          Decision{a === b ? '' : 's'} {a}
          {a === b ? '' : `–${b}`} not recorded
        </li>
      )
      continue
    }
    const d = row.decision
    const rec = recordForDecision(telemetry, d)
    const selected = d === selectedDecision
    const requested = rec?.action_sent ?? null
    const reval = rec?.revalidated_slots ?? []
    const reward = rec?.reward?.total
    items.push(
      <li key={d} className="absolute left-0 right-0" style={{ top, height: ROW_PX }}>
        <button
          type="button"
          aria-pressed={selected}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(d)}
          className={`w-full h-full flex items-center gap-3 px-3 text-left text-base rounded-lg ${
            selected ? 'bg-accent-wash text-accent-ink' : 'hover:bg-white/80'
          }`}
        >
          <span
            className={`tabular-nums w-12 flex-shrink-0 ${selected ? 'font-semibold' : 'font-medium text-ink'}`}
          >
            {d}
          </span>
          <span className="tabular-nums text-ink-2 w-16 flex-shrink-0">
            {rec ? `${rec.time_s.toFixed(1)} s` : '–'}
          </span>
          <span className="flex items-center gap-1 flex-1 min-w-0">
            {d === 0 || requested === null ? (
              <span className="text-ink-2">{d === 0 ? 'Start' : 'No action'}</span>
            ) : focusSlot !== null ? (
              requested[focusSlot] !== undefined ? (
                <ActionGlyph
                  size="sm"
                  index={requested[focusSlot]}
                  meaning={meanings[requested[focusSlot]] ?? null}
                  revalidated={reval.includes(focusSlot)}
                  label={`slot ${focusSlot}`}
                />
              ) : (
                <span className="text-ink-2">Not recorded</span>
              )
            ) : (
              <>
                {requested.slice(0, JOINT_GLYPHS).map((a, s) => (
                  <ActionGlyph
                    key={s}
                    size="sm"
                    index={a}
                    meaning={meanings[a] ?? null}
                    revalidated={reval.includes(s)}
                    label={`slot ${s}`}
                  />
                ))}
                {requested.length > JOINT_GLYPHS && (
                  <span className="text-ink-2">+{requested.length - JOINT_GLYPHS}</span>
                )}
              </>
            )}
          </span>
          {reval.length > 0 && (
            <span
              className="text-sm font-semibold text-violet-700 flex-shrink-0"
              title="revalidated slots"
            >
              R{reval.length}
            </span>
          )}
          <span className="tabular-nums text-ink-2 w-16 text-right flex-shrink-0">
            {typeof reward === 'number' && Number.isFinite(reward) ? reward.toFixed(3) : '–'}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-3 px-3 pb-2 text-sm font-medium text-ink-2 border-b border-hairline">
        <span className="w-12 flex-shrink-0">#</span>
        <span className="w-16 flex-shrink-0">Time</span>
        <span className="flex-1">Action</span>
        <span className="w-16 text-right flex-shrink-0">Reward</span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
        className="relative overflow-y-auto pt-1"
        style={{ height: viewport }}
      >
        <ul
          aria-label={`Decisions ${range[0]} to ${range[1]}`}
          className="relative m-0 p-0 list-none"
          style={{ height: rows.length * ROW_PX }}
        >
          {items}
        </ul>
        {rows.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-base text-ink-2">
            No decisions in this range.
          </div>
        )}
      </div>
    </div>
  )
}
