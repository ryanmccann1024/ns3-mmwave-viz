import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ResultCatalog } from '../lib/resultCatalog'
import { readJson } from '../lib/resultCatalog'
import type { Episode, Evaluation } from '../lib/experimentIndex'
import { formatNumber } from '../lib/comparisonView'
import { controlledNodeIndices } from '../lib/trajectory'
import { trailColor } from '../styles/tokens'
import { MOTION } from '../styles/motion'
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
      <div className="text-xl font-semibold tracking-tight text-ink-title truncate">{value}</div>
      <div className="mt-0.5 text-sm font-medium text-ink-2">{label}</div>
    </div>
  )
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="text-base text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 break-words">
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
  // A placement baseline was not trained; the seed only identifies the evaluation group
  const baseline = evaluation.baselines[episode.policy] ?? null
  return (
    <div>
      <Row label="Row" value={episode.label} />
      {baseline ? (
        <Row label="Evaluation group training seed" value={episode.trainingSeed ?? 'none'} />
      ) : (
        <Row label="Model training seed" value={episode.trainingSeed ?? 'none (baselines only)'} />
      )}
      <Row label="Replayed policy" value={policyLabel(episode.policy)} />
      <Row label="Evaluation seed" value={episode.seed} />
      <Row label="Status" value={episode.status ?? 'not recorded'} />
      <Row label="Exit code" value={formatNumber(episode.exitCode)} />
      <Row label="Model selection" value={evaluation.modelSelection ?? 'not recorded'} />
      <Row label="Decisions" value={formatNumber(episode.decisions)} />
      {episode.error && <Warn>error: {episode.error}</Warn>}
      <div className="text-sm text-ink-2 break-all mt-1">{episode.dir}</div>
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
      {mapping.nodes.length === 0 && <div className="text-sm text-ink-2">none</div>}
      {mapping.missing.length > 0 && (
        <Warn>
          Controlled ids not found in the contract&apos;s node list: {mapping.missing.join(', ')}
        </Warn>
      )}
      <div className="text-sm text-ink-2 mt-2">
        <span className="text-ink-2">actions </span>
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
    </div>
  )
}

function RunRecord({ data }: { data: Loaded<unknown> | null }) {
  if (!data) return <div className="text-sm text-ink-2">rl_episode.json was not saved.</div>
  if (data.state === 'loading') return <div className="text-sm text-ink-2">Reading…</div>
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
  if (!data) return <div className="text-sm text-ink-2">summary.json was not saved.</div>
  if (data.state === 'loading') return <div className="text-sm text-ink-2">Reading…</div>
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
    </>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex w-8 h-[18px] rounded-full flex-shrink-0 ${MOTION.colors} ${
        on ? 'bg-accent' : 'bg-ink/15'
      }`}
    >
      <span
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-control transition-transform duration-fast ease-standard ${
          on ? 'left-[2px] translate-x-[14px]' : 'left-[2px] translate-x-0'
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
      type="button"
      aria-pressed={on}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left ${MOTION.colors} ${
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
        <div className="text-base font-medium text-ink truncate">{policyLabel(policy)}</div>
        <div className="text-base text-ink-2">
          {current ? 'This replay' : `Return ${shortNumber(episodeReturn)}`}
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
        <div className="flex flex-col gap-2 mt-3">
          <div className="text-base font-medium text-ink">Show paths for</div>
          <div className="flex flex-col rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-y divide-hairline">
            {[null, ...nodes].map((n) => {
              const active = node === n
              return (
                <button
                  key={n ?? 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onNode(n)}
                  className={`h-11 px-4 text-left text-base truncate ${MOTION.colors} ${
                    active
                      ? 'bg-accent-wash text-accent-ink font-semibold'
                      : 'text-ink-2 font-medium hover:bg-accent-wash/60 hover:text-ink'
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
        <div className="text-base text-ink-2">No other policy paths for this seed.</div>
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
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
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
        <Disclosure title="Other policies' paths">
          <TrailOptions
            episode={episode}
            options={overlayOptions}
            selected={overlayPolicies}
            errors={trailErrors}
            onToggle={onToggleOverlay}
            nodes={(evaluation.contract?.slot_node_ids ?? []).filter(
              (id): id is string => typeof id === 'string'
            )}
            node={trailNode}
            onNode={onTrailNode}
          />
        </Disclosure>
      </div>

      <div>
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
