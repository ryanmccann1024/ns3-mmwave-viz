import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ResultCatalog } from '../lib/resultCatalog'
import { readJson, readText } from '../lib/resultCatalog'
import type { Episode, Evaluation } from '../lib/experimentIndex'
import { formatNumber } from '../lib/comparisonView'
import type { ParseStepsResult, StepRecord, TelemetryContract } from '../lib/episodeTelemetry'
import {
  decisionAt,
  decisionWindow,
  maskBySlot,
  parseSteps,
  rewardComponents,
  slotActions,
} from '../lib/episodeTelemetry'
import { controlledNodeIndices } from '../lib/trajectory'
import { trailColor } from '../styles/tokens'
import { shortNumber } from '../lib/format'
import { policyLabel } from '../lib/rlLabels'
import type { OverlayOption } from '../hooks/useExperimentSession'
import { Row } from './ui/Row'
import { Disclosure } from './ui/Disclosure'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const show = (v: unknown) =>
  typeof v === 'number' ? formatNumber(v) : typeof v === 'string' ? v : JSON.stringify(v)

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile px-4 py-3 min-w-0">
      <div className="text-base font-semibold tabular-nums text-ink truncate">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 break-words">
      {children}
    </div>
  )
}

type Loaded<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'error'; message: string }

function useSmallJson(catalog: ResultCatalog, path: string | null): Loaded<unknown> | null {
  const [result, setResult] = useState<Loaded<unknown> | null>(null)
  useEffect(() => {
    if (!path) {
      setResult(null)
      return
    }
    let cancelled = false
    setResult({ state: 'loading' })
    readJson(catalog, path)
      .then((value) => !cancelled && setResult({ state: 'ready', value }))
      .catch(
        (err) => !cancelled && setResult({ state: 'error', message: `${path}: ${String(err)}` })
      )
    return () => {
      cancelled = true
    }
  }, [catalog, path])
  return result
}

function Identity({ episode, evaluation }: { episode: Episode; evaluation: Evaluation }) {
  return (
    <div>
      <Row label="Row" value={episode.label} />
      <Row label="Model training seed" value={episode.trainingSeed ?? 'none (baselines only)'} />
      <Row label="Replayed policy" value={policyLabel(episode.policy)} />
      <Row label="Evaluation seed" value={episode.seed} />
      <Row label="Status" value={episode.status ?? 'not recorded'} />
      <Row label="Exit code" value={formatNumber(episode.exitCode)} />
      <Row label="Model selection" value={evaluation.modelSelection ?? 'not recorded'} />
      <Row label="Decisions" value={formatNumber(episode.decisions)} />
      {episode.error && <Warn>error: {episode.error}</Warn>}
      <div className="text-[11px] text-muted break-all mt-1">{episode.dir}</div>
    </div>
  )
}

function ContractView({ evaluation }: { evaluation: Evaluation }) {
  const contract = evaluation.contract
  if (!contract) return <Warn>The eval manifest records no contract for this evaluation.</Warn>
  const mapping = controlledNodeIndices(contract)
  return (
    <div>
      {mapping.nodes.map((n) => (
        <Row key={n.slot} label={`Slot ${n.slot}`} value={`${n.nodeId} · CSV node ${n.index}`} />
      ))}
      {mapping.nodes.length === 0 && <div className="text-xs text-muted">none</div>}
      {mapping.missing.length > 0 && (
        <Warn>
          Controlled ids not found in the contract&apos;s node list: {mapping.missing.join(', ')}
        </Warn>
      )}
      <div className="text-xs text-muted mt-2">
        <span className="text-muted">actions </span>
        {contract.action_meanings.map((a, i) => `${i}=${a}`).join('  ')}
      </div>
    </div>
  )
}

function Outcome({ episode }: { episode: Episode }) {
  return (
    <div>
      <Row label="Return" value={formatNumber(episode.return)} />
      {Object.entries(episode.rewardComponentsSum ?? {}).map(([k, v]) => (
        <Row key={k} label={`Σ ${k}`} value={formatNumber(v)} />
      ))}
      {Object.entries(episode.metrics ?? {}).map(([k, v]) => (
        <Row key={k} label={k} value={formatNumber(v)} />
      ))}
      <Row label="Mask violations" value={formatNumber(episode.maskViolations)} />
      <Row label="Revalidated slots" value={formatNumber(episode.revalidatedSlotsTotal)} />
      <div className="text-[11px] text-muted mt-1">
        Revalidated means the simulator re-checked the action against the current state; it does not
        mean the node moved.
      </div>
    </div>
  )
}

function RunRecord({ data }: { data: Loaded<unknown> | null }) {
  if (!data) return <div className="text-xs text-muted">rl_episode.json was not saved.</div>
  if (data.state === 'loading') return <div className="text-xs text-muted">Reading…</div>
  if (data.state === 'error') return <Warn>{data.message}</Warn>
  const d = isRec(data.value) ? data.value : {}
  const keys = ['status', 'exit_code', 'stop_reason', 'control_mode', 'started_at', 'ended_at']
  const contract = isRec(d.contract) ? d.contract : {}
  const contractKeys = ['contract', 'tick_s', 'decision_interval_s', 'num_decisions', 'warmup_s']
  return (
    <>
      {keys
        .filter((k) => k in d)
        .map((k) => (
          <Row key={k} label={k} value={show(d[k])} />
        ))}
      {contractKeys
        .filter((k) => k in contract)
        .map((k) => (
          <Row key={k} label={`contract.${k}`} value={show(contract[k])} />
        ))}
    </>
  )
}

function SummaryView({ data }: { data: Loaded<unknown> | null }) {
  if (!data) return <div className="text-xs text-muted">summary.json was not saved.</div>
  if (data.state === 'loading') return <div className="text-xs text-muted">Reading…</div>
  if (data.state === 'error') return <Warn>{data.message}</Warn>
  const d = isRec(data.value) ? data.value : {}
  const network = isRec(d.network) ? d.network : {}
  return (
    <>
      {['scenario', 'duration_s', 'warmup_s']
        .filter((k) => k in d)
        .map((k) => (
          <Row key={k} label={k} value={show(d[k])} />
        ))}
      {Object.entries(network).map(([k, v]) => (
        <Row key={k} label={k} value={show(v)} />
      ))}
      <div className="text-[11px] text-muted mt-1">
        Whole-run statistics from summary.json. This is a separate source from comparison.json and
        may cover a different time window.
      </div>
    </>
  )
}

function DecisionView({
  contract,
  step,
  currentTime,
  tickS,
}: {
  contract: TelemetryContract
  step: StepRecord | null
  currentTime: number
  tickS: number | undefined
}) {
  if (!step) {
    return (
      <div className="text-xs text-muted">
        No saved decision covers t={currentTime.toFixed(3)}s. Telemetry may be saved only every few
        decisions.
      </div>
    )
  }
  const actions = slotActions(contract, step)
  const masks = maskBySlot(contract, step)
  const window = decisionWindow(step, tickS)
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Row label="Decision" value={formatNumber(step.decision)} />
        <Row label="Decision time" value={`${formatNumber(step.time_s)} s`} />
        <Row label="Tick" value={formatNumber(step.tick)} />
        {window && (
          <Row
            label="Action applied and reward earned over"
            value={`(${formatNumber(window.start)}, ${formatNumber(window.end)}] s`}
          />
        )}
      </div>

      <div>
        <div className="text-[11px] font-semibold text-muted mb-0.5 mt-1">Action sent</div>
        {actions === null && <div className="text-xs text-muted">none sent yet</div>}
        {actions?.map((a) => (
          <Row
            key={a.slot}
            label={`Slot ${a.slot} · ${a.nodeId ?? 'unknown node'}`}
            value={`${a.actionName ?? 'unknown action'} (index ${a.actionIndex})`}
          />
        ))}
      </div>

      <div>
        <div className="text-[11px] font-semibold text-muted mb-0.5 mt-1">
          Mask observed at decision time
        </div>
        {masks === null && (
          <Warn>Mask length {step.mask.length} does not fit slots × actions.</Warn>
        )}
        {masks?.map((m) => (
          <div key={m.slot} className="flex items-center gap-1 flex-wrap py-0.5">
            <span className="text-xs text-muted mr-1">slot {m.slot}</span>
            {m.actions.map((a) => (
              <span
                key={a.actionIndex}
                title={a.allowed ? 'allowed' : 'masked out'}
                className={`px-1 rounded border text-[10px] ${
                  a.allowed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-gray-100 border-gray-200 text-muted line-through'
                }`}
              >
                {a.actionName}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div>
        <div className="text-[11px] font-semibold text-muted mb-0.5 mt-1">
          Reward earned in this interval
        </div>
        {step.reward ? (
          <>
            {rewardComponents(step).map(([k, v]) => (
              <Row key={k} label={k} value={formatNumber(v)} />
            ))}
            <Row label="Total" value={formatNumber(step.reward.total)} />
            {step.reward.source && <Row label="Source" value={step.reward.source} />}
          </>
        ) : (
          <div className="text-xs text-muted">not yet awarded</div>
        )}
      </div>

      <Row
        label="Revalidated slots"
        value={step.revalidated_slots.length ? step.revalidated_slots.join(', ') : 'none'}
      />
    </div>
  )
}

function Telemetry({
  catalog,
  episode,
  currentTime,
}: {
  catalog: ResultCatalog
  episode: Episode
  currentTime: number
}) {
  const [parsed, setParsed] = useState<ParseStepsResult | null>(null)
  const path = episode.files.steps

  // Mounted only when its section is opened, so steps.jsonl is read on demand
  useEffect(() => {
    if (!path) return
    let cancelled = false
    readText(catalog, path)
      .then((text) => {
        if (cancelled) return
        setParsed(
          text === null ? { ok: false, message: `could not read ${path}` } : parseSteps(text)
        )
      })
      .catch((err) => !cancelled && setParsed({ ok: false, message: String(err) }))
    return () => {
      cancelled = true
    }
  }, [catalog, path])

  const step = useMemo(
    () =>
      parsed?.ok ? decisionAt(parsed.steps, currentTime, parsed.header.contract.tick_s) : null,
    [parsed, currentTime]
  )

  if (!path) {
    return (
      <div className="text-xs text-muted">
        Decision telemetry was not saved for this episode. Playback is unaffected.
      </div>
    )
  }
  if (!parsed) return <div className="text-xs text-muted">Reading steps.jsonl…</div>
  if (!parsed.ok) return <Warn>{parsed.message}</Warn>
  return (
    <div>
      <div className="text-[11px] text-muted mb-1">
        Saved interval containing t={currentTime.toFixed(3)}s ({parsed.steps.length} records).
        Sparse telemetry leaves gaps; actions are never interpolated.
      </div>
      <DecisionView
        contract={parsed.header.contract}
        step={step}
        currentTime={currentTime}
        tickS={parsed.header.contract.tick_s}
      />
    </div>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${
        on ? 'bg-accent' : 'bg-ink/15'
      }`}
    >
      <span
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-control transition-all ${
          on ? 'left-[16px]' : 'left-[2px]'
        }`}
      />
    </span>
  )
}

function PathCard({
  policy,
  episodeReturn,
  on,
  current,
  onToggle,
}: {
  policy: string
  episodeReturn: number | null
  on: boolean
  current?: boolean
  onToggle: () => void
}) {
  const color = trailColor(policy)
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
        on
          ? 'bg-white border-white shadow-control'
          : 'bg-white/40 border-hairline hover:bg-white/70'
      }`}
    >
      <span
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ backgroundColor: color, opacity: on ? 1 : 0.35 }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink truncate">{policyLabel(policy)} path</div>
        <div className="text-sm text-muted">
          {current ? 'Current replay' : 'Overlay only'} · return {shortNumber(episodeReturn)}
        </div>
      </div>
      <Switch on={on} />
    </button>
  )
}

/** The controlled nodes' paths: this episode's, plus other policies on the same seed */
function TrailOptions({
  episode,
  options,
  selected,
  errors,
  onToggle,
  nodes,
  node,
  onNode,
}: {
  episode: Episode
  options: OverlayOption[]
  selected: string[]
  errors: Record<string, string>
  onToggle: (policy: string) => void
  nodes: string[]
  node: string | null
  onNode: (node: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-muted leading-relaxed">
        These switches add or remove colored paths; they do not change the moving replay. Use
        “Choose a replay” above to switch policies. Press Play to see the current node move.
      </div>
      <div className="flex flex-col gap-1.5">
        <PathCard
          policy={episode.policy}
          episodeReturn={episode.return}
          on={selected.includes(episode.policy)}
          current
          onToggle={() => onToggle(episode.policy)}
        />
        {options.map((o) => (
          <PathCard
            key={o.policy}
            policy={o.policy}
            episodeReturn={o.episode.return}
            on={selected.includes(o.policy)}
            onToggle={() => onToggle(o.policy)}
          />
        ))}
      </div>
      {nodes.length > 1 && (
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="text-[11px] font-medium text-muted">Follow one node</div>
          <div className="flex flex-wrap gap-1">
            {[null, ...nodes].map((n) => {
              const active = node === n
              return (
                <button
                  key={n ?? 'all'}
                  onClick={() => onNode(n)}
                  className={`px-2 h-7 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-ink text-white border-ink'
                      : 'bg-white/70 text-ink-2 border-hairline hover:bg-white'
                  }`}
                >
                  {n ?? 'All nodes'}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {options.length === 0 && (
        <div className="text-[11px] text-muted">
          No other policy has saved positions for this seed.
        </div>
      )}
      {Object.entries(errors).map(([policy, message]) => (
        <Warn key={policy}>
          {policy} path unavailable: {message}
        </Warn>
      ))}
    </div>
  )
}

interface Props {
  catalog: ResultCatalog
  evaluation: Evaluation
  episode: Episode
  currentTime: number
  overlayOptions: OverlayOption[]
  overlayPolicies: string[]
  trailErrors: Record<string, string>
  onToggleOverlay: (policy: string) => void
  trailNode: string | null
  onTrailNode: (node: string | null) => void
}

export function EpisodeDetails({
  catalog,
  evaluation,
  episode,
  currentTime,
  overlayOptions,
  overlayPolicies,
  trailErrors,
  onToggleOverlay,
  trailNode,
  onTrailNode,
}: Props) {
  const runRecord = useSmallJson(catalog, episode.files.rlEpisode)
  const summary = useSmallJson(catalog, episode.files.summary)

  const completed = episode.status === 'completed'
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Delivery ratio"
          value={
            episode.metrics?.delivery_ratio == null
              ? 'n/a'
              : `${(episode.metrics.delivery_ratio * 100).toFixed(1)}%`
          }
        />
        <Stat
          label="Travel"
          value={
            episode.metrics?.travel_m_total == null
              ? 'n/a'
              : `${Math.round(episode.metrics.travel_m_total).toLocaleString()} m`
          }
        />
        <Stat label="Return" value={shortNumber(episode.return)} />
        <Stat label="Decisions" value={formatNumber(episode.decisions)} />
        <Stat label="Policy" value={policyLabel(episode.policy)} />
        <Stat label="Evaluation seed" value={String(episode.seed)} />
      </div>
      {!completed && <Warn>Status: {episode.status ?? 'not recorded'}</Warn>}

      <div>
        <Disclosure title="Overlay other policy paths (optional)">
          <TrailOptions
            episode={episode}
            options={overlayOptions}
            selected={overlayPolicies}
            errors={trailErrors}
            onToggle={onToggleOverlay}
            nodes={evaluation.contract?.slot_node_ids ?? []}
            node={trailNode}
            onNode={onTrailNode}
          />
        </Disclosure>
      </div>

      <div>
        <Disclosure title="Decision at this moment">
          <Telemetry
            key={episode.dir}
            catalog={catalog}
            episode={episode}
            currentTime={currentTime}
          />
        </Disclosure>
        <Disclosure title="Outcome">
          <Outcome episode={episode} />
        </Disclosure>
        <Disclosure title="Controlled nodes">
          <ContractView evaluation={evaluation} />
        </Disclosure>
        <Disclosure title="Episode record">
          <Identity episode={episode} evaluation={evaluation} />
        </Disclosure>
        <Disclosure title="Run record (rl_episode.json)">
          <RunRecord data={runRecord} />
        </Disclosure>
        <Disclosure title="Run summary (summary.json)">
          <SummaryView data={summary} />
        </Disclosure>
      </div>
    </div>
  )
}
