import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { DecisionJoin, EpisodeTelemetry } from '../../lib/decisionExplorer'
import { isUnavailable } from '../../lib/decisionExplorer'
import type { NodeMapping } from '../../lib/nodeIdentity'
import type { SimFrame } from '../../types'
import { actionColor, componentColor } from '../../styles/tokens'
import { MOTION } from '../../styles/motion'
import { Disclosure } from '../ui/Disclosure'
import { ActionGlyph } from './ActionGlyph'
import { Note } from '../ExperimentStatus'

const RAW_CAP = 64 * 1024
const fmt1 = (v: number) => v.toFixed(1)
const fmt3 = (v: number) => v.toFixed(3)

/** delivery_ratio -> Delivery ratio, north -> North */
const words = (key: string) => {
  const t = key
    .replace(/_+/g, ' ')
    .trim()
    .replace(/\b(sinr|snr|los|nlos|mcs)\b/gi, (w) => w.toUpperCase())
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function rawText(join: DecisionJoin): { text: string; truncated: boolean } {
  const full = JSON.stringify(
    {
      [`decision_${join.decision}`]: join.record,
      ...(join.sourceRecord ? { [`decision_${join.decision - 1}`]: join.sourceRecord } : {}),
    },
    null,
    2
  )
  if (full.length <= RAW_CAP) return { text: full, truncated: false }
  return { text: full.slice(0, RAW_CAP), truncated: true }
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-hairline last:border-0 text-base">
      <span className="text-ink-2 flex-shrink-0">{label}</span>
      <span className="text-ink font-medium tabular-nums text-right break-all min-w-0">
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary: the one card to read. What each node did, and what that earned.
// ---------------------------------------------------------------------------

interface SummaryProps {
  telemetry: EpisodeTelemetry
  join: DecisionJoin
  total: number
  focusSlot: number | null
  onFocusSlot: (slot: number | null) => void
  /** scene colour of each slot's node, when known */
  colorBySlot?: (string | null)[]
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}

export function DecisionSummary({
  telemetry,
  join,
  total,
  focusSlot,
  onFocusSlot,
  colorBySlot,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: SummaryProps) {
  const contract = telemetry.header.contract
  const meanings = contract.action_meanings
  const slotName = (s: number) => contract.slot_node_ids[s] ?? `Slot ${s}`
  const { action, outcome } = join
  const reward = outcome?.reward ?? null
  const components = reward?.components ? Object.entries(reward.components) : []
  const magnitude = components.reduce((acc, [, v]) => acc + Math.abs(v), 0) || 1

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-title tabular-nums">
            Decision {join.decision}
            <span className="font-medium text-ink-2"> of {total}</span>
          </h2>
          <div className="text-base text-ink-2 tabular-nums">
            {join.kind === 'reset' ? 'Episode start' : `At ${fmt1(join.record.time_s)} s`}
          </div>
        </div>
        <div className="ml-auto flex rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-x divide-hairline">
          {[
            { label: 'Previous', onClick: onPrev, enabled: canPrev },
            { label: 'Next', onClick: onNext, enabled: canNext },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.onClick}
              disabled={!b.enabled}
              aria-label={`${b.label} decision`}
              className={`h-10 px-4 text-base font-medium ${MOTION.colors} ${
                b.enabled
                  ? 'text-ink hover:bg-accent-wash hover:text-accent-ink'
                  : 'text-ink-2/50 cursor-not-allowed'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </header>

      {/* Keyed on the decision so each step fades in as a whole */}
      <div key={join.decision} className={`flex flex-col gap-6 ${MOTION.enterFade}`}>
        {join.kind === 'reset' ? (
          <div className="text-base text-ink-2">
            The episode starts here, so no move has been made yet. Press Next to see the first
            decision.
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold tracking-tight text-ink-title">
                What each node did
              </h3>
              {!action || isUnavailable(action) ? (
                <div className="text-base text-ink-2">This move was not recorded.</div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
                  {action.requested.map((req, slot) => {
                    const applied =
                      action.applied.status === 'derived' ? action.applied.values[slot] : undefined
                    const changed = applied !== undefined && applied !== req
                    const move = meanings[changed ? applied : req] ?? `action ${req}`
                    const active = focusSlot === slot
                    const color = colorBySlot?.[slot] ?? null
                    return (
                      <button
                        key={slot}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onFocusSlot(active ? null : slot)}
                        title="Highlight this node"
                        className={`tile p-4 text-left flex flex-col gap-2 ${MOTION.surface} ${
                          active ? 'ring-2 ring-accent bg-accent-wash' : 'hover:bg-white'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-base font-medium text-ink-2">
                          {color && (
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                          )}
                          {slotName(slot)}
                        </span>
                        <span className="flex items-center gap-2.5">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: actionColor(move, req) }}
                          />
                          <span className="text-2xl font-semibold tracking-tight text-ink-title">
                            {words(move)}
                          </span>
                        </span>
                        {changed && (
                          <span className="text-base text-ink-2">
                            Asked for {words(meanings[req] ?? `action ${req}`)}, which was blocked
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <h3 className="text-lg font-semibold tracking-tight text-ink-title">
                  Reward for this step
                </h3>
                {reward && (
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-ink-title">
                    {fmt3(reward.total)}
                  </span>
                )}
              </div>
              {!reward ? (
                <div className="text-base text-ink-2">No reward was recorded for this step.</div>
              ) : (
                components.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    {components.map(([k, v], i) => (
                      <div
                        key={k}
                        className="grid grid-cols-[15rem_1fr_4.5rem] items-center gap-3 text-base"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: componentColor(i) }}
                          />
                          <span className="truncate text-ink">{words(k)}</span>
                        </span>
                        <span className="h-2.5 rounded-full bg-ink/[0.05] overflow-hidden">
                          <span
                            className={`block h-full rounded-full origin-left ${MOTION.lift}`}
                            style={{
                              backgroundColor: componentColor(i),
                              transform: `scaleX(${Math.abs(v) / magnitude})`,
                              opacity: v < 0 ? 0.45 : 1,
                            }}
                          />
                        </span>
                        <span className="text-right font-medium tabular-nums text-ink">
                          {fmt3(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// More: the technical record behind a decision, for anyone who wants it
// ---------------------------------------------------------------------------

interface MoreProps {
  telemetry: EpisodeTelemetry
  join: DecisionJoin
  focusSlot: number | null
  mapping: NodeMapping
  /** the frame the scene currently shows (for the focused node's links) */
  frame: SimFrame
  /** set when the last selection could not be aligned with a playback frame */
  seekNotice: string | null
}

export function DecisionMore({
  telemetry,
  join,
  focusSlot,
  mapping,
  frame,
  seekNotice,
}: MoreProps) {
  const contract = telemetry.header.contract
  const meanings = contract.action_meanings
  const slotName = (s: number) => contract.slot_node_ids[s] ?? `Slot ${s}`
  const { input, action, outcome } = join
  const raw = useMemo(() => rawText(join), [join])

  const csvId =
    mapping.status === 'mapped' && focusSlot !== null
      ? (mapping.csvIdBySlot[focusSlot] ?? null)
      : null
  const incident = useMemo(() => {
    if (csvId === null) return null
    const links = frame.links.filter((l) => l.nodeA === csvId || l.nodeB === csvId)
    return links.map((l) => {
      const peer = l.nodeA === csvId ? l.nodeB : l.nodeA
      const pair = (a: number, b: number) =>
        (a === l.nodeA && b === l.nodeB) || (a === l.nodeB && b === l.nodeA)
      const mcs = frame.mcs.find((m) => pair(m.nodeA, m.nodeB))
      const rx = frame.rxPower.find((r) => pair(r.nodeA, r.nodeB))
      return { key: `${l.nodeA}-${l.nodeB}`, peer, link: l, mcs: mcs?.mcsIndex, rx: rx?.rxPowerDbm }
    })
  }, [frame, csvId])

  return (
    <div className="flex flex-col gap-6 pt-1">
      {seekNotice && <Note tone="warn">{seekNotice}</Note>}

      {input && input.status !== 'missing_source' && input.maskBySlot && (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold tracking-tight text-ink-title">
            Moves each node was allowed
          </h3>
          <div className="flex flex-col gap-2">
            {input.maskBySlot.map((m) => (
              <div
                key={m.slot}
                className={`flex items-center gap-4 rounded-xl px-3 py-2 ${focusSlot === m.slot ? 'bg-accent-wash' : ''}`}
              >
                <span className="w-32 text-base font-medium text-ink truncate">
                  {slotName(m.slot)}
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {m.actions.map((a) => (
                    <ActionGlyph
                      key={a.actionIndex}
                      size="sm"
                      index={a.actionIndex}
                      meaning={a.actionName}
                      allowed={a.allowed}
                      label={slotName(m.slot)}
                    />
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="text-base text-ink-2">Faded moves were not allowed at this point.</div>
        </section>
      )}

      {action && !isUnavailable(action) && action.revalidatedSlots.length > 0 && (
        <div className="text-base text-ink-2">
          The simulator re-checked the move for{' '}
          {action.revalidatedSlots.map((s) => slotName(s)).join(', ')} before applying it.
        </div>
      )}

      {incident !== null && focusSlot !== null && (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold tracking-tight text-ink-title">
            Links of {slotName(focusSlot)} at {fmt1(frame.time)} s
          </h3>
          {incident.length === 0 ? (
            <div className="text-base text-ink-2">No links at this moment.</div>
          ) : (
            incident.map((e) => (
              <div
                key={e.key}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 border-t border-hairline first:border-0 text-base tabular-nums"
              >
                <span className="font-medium text-ink">Node {e.peer}</span>
                {e.link.sinr !== undefined && (
                  <span className="text-ink-2">SINR {e.link.sinr.toFixed(1)} dB</span>
                )}
                {e.mcs !== undefined && <span className="text-ink-2">MCS {e.mcs}</span>}
                {e.rx !== undefined && <span className="text-ink-2">RX {e.rx.toFixed(1)} dBm</span>}
                {e.link.capacityMbps !== undefined && (
                  <span className="text-ink-2">{e.link.capacityMbps.toFixed(1)} Mbps</span>
                )}
                <span className="text-ink-2">{e.link.connected ? e.link.condition : 'down'}</span>
              </div>
            ))
          )}
        </section>
      )}

      <section className="flex flex-col">
        <h3 className="text-lg font-semibold tracking-tight text-ink-title pb-2">Record</h3>
        <Line label="Decision time" value={`${fmt1(join.record.time_s)} s`} />
        <Line label="Simulator tick" value={join.record.tick} />
        {outcome && outcome.intervalStartS !== null && (
          <Line
            label="Reward measured over"
            value={`${fmt1(outcome.intervalStartS)} s to ${fmt1(outcome.intervalEndS)} s`}
          />
        )}
        {input && input.status !== 'missing_source' && input.obsSha256 && (
          <Line
            label="Observation hash"
            value={<span title={input.obsSha256}>{input.obsSha256.slice(0, 12)}…</span>}
          />
        )}
        {action && !isUnavailable(action) && (
          <Line
            label="Moves asked for"
            value={action.requested.map((a) => words(meanings[a] ?? `#${a}`)).join(', ')}
          />
        )}
      </section>

      <div className="border-t border-hairline">
        {join.sourceRecord?.facts !== undefined && (
          <Disclosure title="Facts the model saw">
            <pre className="text-sm font-mono text-ink-2 whitespace-pre-wrap break-all max-h-64 overflow-auto tile p-3">
              {JSON.stringify(join.sourceRecord.facts, null, 1).slice(0, 8 * 1024)}
            </pre>
          </Disclosure>
        )}
        <Disclosure title="Raw record">
          <pre className="text-sm font-mono text-ink-2 whitespace-pre-wrap break-all max-h-72 overflow-auto tile p-3">
            {raw.text}
          </pre>
          {raw.truncated && <div className="text-base text-ink-2 mt-2">Truncated at 64 KB</div>}
        </Disclosure>
      </div>
    </div>
  )
}
