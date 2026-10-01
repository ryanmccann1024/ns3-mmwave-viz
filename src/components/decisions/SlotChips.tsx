import { useMemo, useState } from 'react'
import type { NodeMapping } from '../../lib/nodeIdentity'
import { MOTION } from '../../styles/motion'

interface Props {
  slotNodeIds: readonly (string | null)[]
  focusSlot: number | null
  onFocusSlot: (slot: number | null) => void
  mapping: NodeMapping
  /** scene color of the node behind each slot, when the mapping is proved */
  colorBySlot?: (string | null)[]
}

const SEARCH_THRESHOLD = 12

/** One pill per policy slot; the label is the recorded node id, empty slots are disabled. */
export function SlotChips({ slotNodeIds, focusSlot, onFocusSlot, mapping, colorBySlot }: Props) {
  const [query, setQuery] = useState('')
  const many = slotNodeIds.length > SEARCH_THRESHOLD
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return slotNodeIds
      .map((id, slot) => ({ id, slot }))
      .filter(({ id, slot }) => !q || slot === focusSlot || (id ?? '').toLowerCase().includes(q))
  }, [slotNodeIds, query, focusSlot])
  const mapped = mapping.status === 'mapped'
  return (
    <div className="flex flex-col gap-2">
      {many && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${slotNodeIds.length} slots`}
          aria-label="Filter slots"
          className="w-full px-3 py-1.5 rounded-lg text-xs bg-white border border-hairline focus-visible:border-accent placeholder:text-faint"
        />
      )}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 -mb-1"
        role="group"
        aria-label="Policy slots"
      >
        <button
          type="button"
          aria-pressed={focusSlot === null}
          onClick={() => onFocusSlot(null)}
          className={`px-2.5 h-7 rounded-full text-xs font-medium border flex-shrink-0 ${MOTION.colors} ${
            focusSlot === null
              ? 'bg-ink text-white border-ink'
              : 'bg-white/70 text-ink-2 border-hairline hover:bg-white'
          }`}
        >
          All slots
        </button>
        {visible.map(({ id, slot }) => {
          const active = focusSlot === slot
          const empty = id === null
          const color = mapped ? (colorBySlot?.[slot] ?? null) : null
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={active}
              aria-disabled={empty || undefined}
              disabled={empty}
              onClick={() => onFocusSlot(active ? null : slot)}
              title={empty ? `slot ${slot} is empty` : `slot ${slot} · ${id}`}
              className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium border flex-shrink-0 ${MOTION.colors} ${
                active
                  ? 'bg-accent text-white border-accent'
                  : empty
                    ? 'bg-white/40 text-faint border-hairline cursor-not-allowed'
                    : 'bg-white/70 text-ink-2 border-hairline hover:bg-white'
              }`}
            >
              {color && (
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full ring-1 ring-white/80 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}
              <span className="font-mono">{id ?? `slot ${slot} (empty)`}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
