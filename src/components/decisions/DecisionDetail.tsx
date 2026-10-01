import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { DecisionJoin, EpisodeTelemetry } from '../../lib/decisionExplorer'
import { isUnavailable } from '../../lib/decisionExplorer'
import type { NodeMapping } from '../../lib/nodeIdentity'
import type { SimFrame } from '../../types'
import { componentColor } from '../../styles/tokens'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Disclosure } from '../ui/Disclosure'
import { ActionGlyph } from './ActionGlyph'

interface Props {
  telemetry: EpisodeTelemetry
  join: DecisionJoin
  focusSlot: number | null
  mapping: NodeMapping
  /** the frame the scene currently shows (for incident links) */
  frame: SimFrame
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  /** set when the last selection could not be aligned with a playback frame */
  seekNotice: string | null
}

const RAW_CAP = 64 * 1024
const fmt3 = (v: number) => v.toFixed(3)

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tile px-3 py-2.5 flex flex-col gap-1.5 min-w-0">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </section>
  )
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-3 text-xs">
      <span className="text-muted flex-shrink-0">{label}</span>
      <span className="text-ink font-mono tabular-nums text-right break-all min-w-0">{value}</span>
    </div>
  )
}

function Unavailable({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted italic">{children}</div>
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

/** Inputs (n−1) / Action (n) / Context (n) / Raw, with explicit unavailable states. */
export function DecisionDetail({
  telemetry,
  join,
  focusSlot,
  mapping,
  frame,
  onPrev,
  onNext,
  canPrev,
  canNext,
  seekNotice,
}: Props) {
  const contract = telemetry.header.contract
  const meanings = contract.action_meanings
  const slotName = (s: number) => contract.slot_node_ids[s] ?? `slot ${s} (empty)`
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

  const slotMarks = (slot: number) => {
    if (!action || isUnavailable(action)) return null
    const req = action.requested[slot]
    if (req === undefined) return <Unavailable>slot {slot} is not in action_sent</Unavailable>
    const reval = action.revalidatedSlots.includes(slot)
    const applied = action.applied.status === 'derived' ? action.applied.values[slot] : undefined
    const allowed =
      input && input.status === 'exact' && input.maskBySlot
        ? (input.maskBySlot[slot]?.actions[req]?.allowed ?? null)
        : null
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="text-muted">requested</span>
          <ActionGlyph
            index={req}
            meaning={meanings[req] ?? null}
            revalidated={reval}
            label={slotName(slot)}
          />
          <span className="font-mono">{meanings[req] ?? `index ${req}`}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted">action valid</span>
          <span className="font-mono">
            {allowed === null
              ? 'unavailable (no pre-action mask)'
              : allowed
                ? 'yes'
                : 'no (masked out)'}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted">applied (derived)</span>
          {applied === undefined ? (
            <span className="font-mono">
              unavailable — {action.applied.status === 'unavailable' ? action.applied.reason : ''}
            </span>
          ) : (
            <>
              <ActionGlyph
                index={applied}
                meaning={meanings[applied] ?? null}
                label={`${slotName(slot)} applied`}
              />
              <span className="font-mono">{meanings[applied] ?? `index ${applied}`}</span>
              {!reval && <span className="text-muted">— no revalidation recorded</span>}
            </>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <header className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-ink-title">Decision {join.decision}</h3>
        <Badge
          label={join.kind}
          colorClass={
            join.kind === 'reset'
              ? 'bg-gray-100 text-ink-2 border border-gray-300'
              : 'bg-accent-wash text-accent-ink border border-accent/20'
          }
        />
        <span className="text-xs text-muted font-mono tabular-nums">
          t = {fmt3(join.record.time_s)} s
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Previous decision"
          >
            Prev
          </Button>
          <Button variant="ghost" onClick={onNext} disabled={!canNext} aria-label="Next decision">
            Next
          </Button>
        </span>
      </header>
      {seekNotice && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          {seekNotice}
        </div>
      )}

      {join.kind === 'reset' ? (
        <Group title="Reset">
          <Unavailable>
            Reset — no action or outcome window. The scene shows the recorded initial state.
          </Unavailable>
          <Line label="tick" value={join.record.tick} />
          <Line label="time_s" value={fmt3(join.record.time_s)} />
          {typeof join.record.obs_sha256 === 'string' && (
            <Line
              label="obs_sha256"
              value={
                <span title={join.record.obs_sha256}>{join.record.obs_sha256.slice(0, 12)}…</span>
              }
            />
          )}
        </Group>
      ) : (
        <div className="grid gap-2 grid-cols-1 2xl:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
          <Group title={`Inputs · from decision ${join.decision - 1}`}>
            {!input || input.status === 'missing_source' ? (
              <Unavailable>
                Pre-action inputs for decision {join.decision} were not recorded (decision{' '}
                {join.decision - 1} is missing from the sampled telemetry).
              </Unavailable>
            ) : (
              <>
                <Line label="source decision" value={input.sourceDecision} />
                <Line label="tick" value={input.tick} />
                <Line label="time_s" value={fmt3(input.timeS)} />
                <Line
                  label="obs_sha256"
                  value={
                    input.obsSha256 ? (
                      <span
                        title={input.obsSha256}
                        aria-label={`observation hash ${input.obsSha256}`}
                      >
                        {input.obsSha256.slice(0, 12)}…
                      </span>
                    ) : (
                      'not recorded'
                    )
                  }
                />
                <div className="text-[11px] text-muted mt-1">
                  Pre-action mask (valid actions per slot)
                </div>
                {input.maskBySlot === null ? (
                  <Unavailable>
                    mask length {input.mask.length} does not fit slots × actions
                  </Unavailable>
                ) : (
                  <div className="flex flex-wrap gap-1.5" role="list" aria-label="Pre-action mask">
                    {input.maskBySlot.map((m) => (
                      <div
                        key={m.slot}
                        role="listitem"
                        className={`flex items-center gap-0.5 rounded px-1 py-0.5 ${
                          focusSlot === m.slot ? 'bg-accent-wash ring-1 ring-accent/40' : ''
                        }`}
                        title={`slot ${m.slot} · ${slotName(m.slot)}`}
                      >
                        <span className="text-[10px] text-muted font-mono w-3">{m.slot}</span>
                        {m.actions.map((a) => (
                          <span
                            key={a.actionIndex}
                            title={`${a.actionName}: ${a.allowed ? 'valid' : 'invalid'}`}
                            aria-label={`${slotName(m.slot)} ${a.actionName} ${a.allowed ? 'valid' : 'invalid'}`}
                            className={`w-2.5 h-2.5 rounded-sm border ${
                              a.allowed
                                ? 'bg-emerald-400/80 border-emerald-500'
                                : 'bg-transparent border-hairline-strong'
                            }`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {join.sourceRecord?.facts !== undefined && (
                  <Disclosure title="Recorded context (facts, as saved)">
                    <pre className="text-[10px] font-mono text-ink-2 whitespace-pre-wrap break-all max-h-48 overflow-auto">
                      {JSON.stringify(join.sourceRecord.facts, null, 1).slice(0, 8 * 1024)}
                    </pre>
                  </Disclosure>
                )}
                <div className="text-[10px] text-muted">
                  Only the evidence saved in steps.jsonl: mask, observation hash and recorded facts.
                  The full observation vector is not in this file.
                </div>
              </>
            )}
          </Group>

          <Group title="Action">
            {!action || isUnavailable(action) ? (
              <Unavailable>
                action: unavailable — {action ? action.reason : 'no record'}
              </Unavailable>
            ) : (
              <>
                {focusSlot !== null ? (
                  <>
                    <div className="text-xs text-ink font-medium font-mono">
                      {slotName(focusSlot)}
                    </div>
                    {slotMarks(focusSlot)}
                  </>
                ) : (
                  <Unavailable>Pick a slot chip to see one node&apos;s marks.</Unavailable>
                )}
                <div className="flex items-center gap-1 flex-wrap mt-1" aria-label="Joint action">
                  <span className="text-[11px] text-muted mr-1">joint</span>
                  {action.requested.map((a, s) => (
                    <ActionGlyph
                      key={s}
                      size="sm"
                      index={a}
                      meaning={meanings[a] ?? null}
                      revalidated={action.revalidatedSlots.includes(s)}
                      label={slotName(s)}
                    />
                  ))}
                </div>
                {action.applied.status === 'unavailable' && (
                  <Unavailable>applied: unavailable — {action.applied.reason}</Unavailable>
                )}
                <Disclosure title="All slots">
                  <div className="flex flex-col gap-2">
                    {action.requested.map((_, s) => (
                      <div key={s} className="flex flex-col gap-0.5">
                        <div className="text-[11px] text-ink-2 font-mono">{slotName(s)}</div>
                        {slotMarks(s)}
                      </div>
                    ))}
                  </div>
                </Disclosure>
              </>
            )}
          </Group>

          <Group title="Context · outcome interval">
            {outcome && (
              <>
                <Line
                  label="interval"
                  value={
                    outcome.intervalStartS === null
                      ? `(unknown, ${fmt3(outcome.intervalEndS)}] s — tick_s unavailable`
                      : `(${fmt3(outcome.intervalStartS)}, ${fmt3(outcome.intervalEndS)}] s`
                  }
                />
                <Line label="ticks_in_step" value={outcome.ticksInStep} />
                <Line label="tick" value={outcome.tick} />
                {outcome.reward ? (
                  <>
                    <Line label="reward total" value={fmt3(outcome.reward.total)} />
                    {outcome.reward.components &&
                      Object.entries(outcome.reward.components).map(([k, v], i) => (
                        <div key={k} className="flex items-center gap-2 text-xs">
                          <span
                            aria-hidden="true"
                            className="w-2 h-2 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: componentColor(i) }}
                          />
                          <span className="text-muted flex-1 truncate">{k}</span>
                          <span className="font-mono tabular-nums">{fmt3(v)}</span>
                        </div>
                      ))}
                    <div className="flex gap-1 flex-wrap">
                      {outcome.reward.source && (
                        <Badge
                          label={`source: ${outcome.reward.source}`}
                          colorClass="bg-gray-100 text-ink-2 border border-gray-300"
                        />
                      )}
                      {outcome.reward.valid && (
                        <Badge
                          label={`valid: ${Object.entries(outcome.reward.valid)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(' ')}`}
                          colorClass="bg-gray-100 text-ink-2 border border-gray-300"
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <Unavailable>reward: not recorded for this decision</Unavailable>
                )}
                {typeof join.record.legacy_reward === 'number' && (
                  <Line label="legacy_reward" value={fmt3(join.record.legacy_reward)} />
                )}
                <div className="text-[10px] text-muted">
                  Reward is network-wide, from steps.jsonl.
                </div>
              </>
            )}
            {incident !== null && (
              <div className="flex flex-col gap-1 mt-1">
                <div className="text-[11px] text-muted">
                  Incident links of {focusSlot !== null ? slotName(focusSlot) : ''} at t ={' '}
                  {fmt3(frame.time)} s (shown frame)
                </div>
                {incident.length === 0 && <Unavailable>no links at this frame</Unavailable>}
                {incident.map((e) => (
                  <div
                    key={e.key}
                    className="flex flex-wrap gap-x-3 text-xs font-mono tabular-nums"
                  >
                    <span className="text-ink-2">↔ node {e.peer}</span>
                    {e.link.sinr !== undefined && <span>SINR {e.link.sinr.toFixed(1)} dB</span>}
                    {e.mcs !== undefined && <span>MCS {e.mcs}</span>}
                    {e.rx !== undefined && <span>RX {e.rx.toFixed(1)} dBm</span>}
                    {e.link.capacityMbps !== undefined && (
                      <span>{e.link.capacityMbps.toFixed(1)} Mbps</span>
                    )}
                    <span className="text-muted">
                      {e.link.connected ? e.link.condition : 'down'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Group>
        </div>
      )}

      <Disclosure title="Raw record">
        <pre className="text-[10px] font-mono text-ink-2 whitespace-pre-wrap break-all max-h-72 overflow-auto rounded-lg bg-white/70 border border-hairline p-2">
          {raw.text}
        </pre>
        {raw.truncated && <div className="text-[11px] text-muted mt-1">truncated at 64 KB</div>}
      </Disclosure>
    </div>
  )
}
