import type { ReactNode } from 'react'
import type {
  BaselineManifest,
  BaselinePlan,
  BaselinePlanNode,
  BaselineStatus,
  IdentityCheck,
  ScenarioIdentity,
} from '../../lib/baselineManifest'
import type { EvalBaselineInfo } from '../../lib/experimentIndex'
import { baselineStatusLabel, objectiveLabel, policyLabel } from '../../lib/rlLabels'
import { Disclosure } from '../ui/Disclosure'
import { Row } from '../ui/Row'
import { Tag } from './shared'

// Baseline identity, measured setup numbers and provenance. Every manifest string is rendered
// as a plain text node; errors and paths never go into title attributes (they may hold local
// host paths). Missing numbers read "unknown" or are omitted, never 0.

type Check = 'match' | 'mismatch' | 'unknown'

const IDENTITY_KEYS: (keyof ScenarioIdentity)[] = [
  'runIniSha256',
  'nodesJsonSha256',
  'buildingsJsonSha256',
  'jammersJsonSha256',
]

export const IDENTITY_LABELS: Record<keyof ScenarioIdentity, string> = {
  runIniSha256: 'run.ini',
  nodesJsonSha256: 'nodes.json',
  buildingsJsonSha256: 'buildings.json',
  jammersJsonSha256: 'jammers.json',
}

/** Source-scenario inputs whose hashes differ; effective (prepared-layout) hashes never count */
export function sourceMismatchKeys(check: Partial<Record<string, Check>> | null | undefined) {
  if (!check) return []
  return IDENTITY_KEYS.filter((key) => check[key] === 'mismatch').map((key) => IDENTITY_LABELS[key])
}

const methodLabel = (method: string | null) => (method === null ? 'unknown' : policyLabel(method))

/** "Baseline · Geometric · Coverage" */
export function baselineIdentityLabel(method: string | null, objective: string | null) {
  return `Baseline · ${methodLabel(method)} · ${objectiveLabel(objective)}`
}

export function truncateText(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

const statusTone = (status: BaselineStatus | 'unknown') =>
  status === 'complete'
    ? ('good' as const)
    : status === 'failed' || status === 'interrupted'
      ? ('bad' as const)
      : ('neutral' as const)

export function BaselineBadges({
  method,
  objective,
  status,
  manifestError,
  compact,
}: {
  method: string | null
  objective: string | null
  status: BaselineStatus | 'unknown' | null
  manifestError?: string | null
  compact?: boolean
}) {
  return (
    <span className={`inline-flex items-center flex-wrap ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {method !== null && <Tag tone="accent">{policyLabel(method)}</Tag>}
      {objective !== null && <Tag>{objectiveLabel(objective)}</Tag>}
      {status !== null && <Tag tone={statusTone(status)}>{baselineStatusLabel(status)}</Tag>}
      {manifestError && <Tag>manifest unreadable</Tag>}
    </span>
  )
}

/** "initial displacement 12.3 m (setup) · planner 4.2 s (wall)", missing parts omitted */
export function BaselineSetupLine({
  initialDisplacementMTotal,
  plannerWallS,
  className = 'text-[11px] text-muted',
}: {
  initialDisplacementMTotal: number | null
  plannerWallS: number | null
  className?: string
}) {
  const parts: string[] = []
  if (initialDisplacementMTotal !== null && Number.isFinite(initialDisplacementMTotal)) {
    parts.push(`initial displacement ${initialDisplacementMTotal.toFixed(1)} m (setup)`)
  }
  if (plannerWallS !== null && Number.isFinite(plannerWallS)) {
    parts.push(`planner ${plannerWallS.toFixed(1)} s (wall)`)
  }
  if (parts.length === 0) return null
  return <div className={className}>{parts.join(' · ')}</div>
}

const unknown = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? 'unknown' : v

/** Like Row, but a long hash is shortened with the full value available on hover */
function HashRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between items-center gap-4 py-2 border-b border-ink/[0.06] last:border-0">
      <span className="text-muted text-sm">{label}</span>
      {value ? (
        <span className="text-ink text-sm font-mono tabular-nums text-right" title={value}>
          {value.length > 12 ? `${value.slice(0, 12)}…` : value}
        </span>
      ) : (
        <span className="text-ink text-sm font-mono text-right">unknown</span>
      )}
    </div>
  )
}

function SubHead({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold text-muted mt-3 mb-0.5">{children}</div>
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-2 break-words">
      {children}
    </div>
  )
}

const withStatus = (value: number | null, status: string | null) =>
  `${value === null ? 'unknown' : value}${status ? ` (${status})` : ''}`

function planSummary(plan: BaselinePlan | 'unavailable' | 'loading' | undefined) {
  if (plan === 'loading') return 'loading'
  if (plan === undefined || plan === 'unavailable') return 'unavailable'
  const selected = plan.nodes.filter((n) => n.selected).length
  return `${plan.nodes.length} nodes, ${selected} selected`
}

type Pt = { x: number; y: number }
const finitePoint = (p: BaselinePlanNode['original']): Pt | null =>
  p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null

const PREVIEW_W = 240
const PREVIEW_H = 160
const PREVIEW_PAD = 14

/** Selected plan nodes' original and planned XY positions, from baseline-plan.json only */
function PlanPreview({ plan }: { plan: BaselinePlan }) {
  const items = plan.nodes
    .filter((n) => n.selected)
    .map((n) => ({ id: n.id, from: finitePoint(n.original), to: finitePoint(n.planned) }))
    .filter((n): n is { id: string; from: Pt; to: Pt } => n.from !== null && n.to !== null)

  const caption = (
    <div className="text-[11px] text-muted mt-1">
      Pre-run placement setup from baseline-plan.json — not simulated movement
    </div>
  )
  if (items.length === 0) {
    return (
      <div className="mt-2">
        <div className="text-xs text-muted">
          No selected plan node has both an original and a planned position.
        </div>
        {caption}
      </div>
    )
  }

  const xs = items.flatMap((n) => [n.from.x, n.to.x])
  const ys = items.flatMap((n) => [n.from.y, n.to.y])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  // Equal aspect so distances are not distorted; zero span is padded to a 1 m box
  const span = Math.max(maxX - minX, maxY - minY, 1)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const scale = Math.min(PREVIEW_W - 2 * PREVIEW_PAD, PREVIEW_H - 2 * PREVIEW_PAD) / span
  const ox = PREVIEW_W / 2
  const oy = PREVIEW_H / 2
  const px = (x: number) => ox + (x - cx) * scale
  // SVG y grows downward; sim +Y is drawn upward
  const py = (y: number) => oy - (y - cy) * scale

  return (
    <div className="mt-2">
      <svg
        width={PREVIEW_W}
        height={PREVIEW_H}
        viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
        role="img"
        aria-label="Original and planned positions of selected nodes"
        className="rounded-lg border border-hairline bg-white/70"
      >
        {items.map((n) => (
          <g key={n.id}>
            <line
              x1={px(n.from.x)}
              y1={py(n.from.y)}
              x2={px(n.to.x)}
              y2={py(n.to.y)}
              className="stroke-muted"
              strokeWidth={1}
            />
            <circle
              cx={px(n.from.x)}
              cy={py(n.from.y)}
              r={3}
              className="fill-white stroke-muted"
              strokeWidth={1.2}
            />
            <circle cx={px(n.to.x)} cy={py(n.to.y)} r={3.2} className="fill-accent" />
            <text x={px(n.to.x) + 5} y={py(n.to.y) - 4} className="fill-ink-2" fontSize={9}>
              {n.id}
            </text>
          </g>
        ))}
      </svg>
      <div className="text-[11px] text-muted mt-1">Open dot: original · filled dot: planned</div>
      {caption}
    </div>
  )
}

export function BaselineProvenance({
  manifest,
  evalInfo,
  plan,
  sourceIdentityCheck,
  manifestError,
  title = 'Baseline provenance',
}: {
  manifest: BaselineManifest | null
  evalInfo?: EvalBaselineInfo | null
  plan?: BaselinePlan | 'unavailable' | 'loading'
  sourceIdentityCheck?: Record<string, Check> | IdentityCheck | null
  manifestError?: string | null
  title?: string
}) {
  const m = manifest ?? evalInfo?.manifest ?? null
  // The eval block is authoritative when present; the referenced manifest supplements it
  const pick = <T,>(fromEval: T | null | undefined, fromManifest: T | null | undefined) =>
    fromEval ?? fromManifest ?? null
  const diagnostic = manifestError ?? evalInfo?.manifestError ?? null
  const packages = m ? Object.entries(m.packageVersions) : []
  const effective = pick(evalInfo?.effectiveScenarioIdentity, m?.effectiveScenarioIdentity)
  const mismatched = sourceMismatchKeys(sourceIdentityCheck)

  return (
    <Disclosure title={title}>
      <div>
        <Row label="Run ID" value={unknown(m?.runId)} />
        <Row
          label="Requested algorithm"
          value={unknown(pick(evalInfo?.requestedAlgorithm, m?.requestedAlgorithm))}
        />
        <Row label="Method" value={unknown(pick(evalInfo?.method, m?.method))} />
        <Row label="Objective" value={unknown(pick(evalInfo?.objective, m?.objective))} />
        <Row label="Executor" value={unknown(pick(evalInfo?.executor, m?.executor))} />
        <Row
          label="Planner seed"
          value={withStatus(
            pick(evalInfo?.plannerSeed, m?.plannerSeed),
            m?.plannerSeedStatus ?? null
          )}
        />
        <Row
          label="Max iterations"
          value={withStatus(
            pick(evalInfo?.maxIterations, m?.maxIterations),
            m?.maxIterationsStatus ?? null
          )}
        />
        <HashRow label="Fingerprint" value={pick(evalInfo?.fingerprint, m?.fingerprint)} />
        <HashRow label="Mapping SHA-256" value={pick(evalInfo?.mappingSha256, m?.mappingSha256)} />
        <HashRow label="Sim binary SHA-256" value={m?.simBinarySha256} />
        <HashRow
          label="Planner source SHA-256"
          value={pick(evalInfo?.plannerSourceSha256, m?.plannerSourceSha256)}
        />
        <HashRow
          label="RF config SHA-256"
          value={pick(evalInfo?.rfConfigSha256, m?.rfConfigSha256)}
        />

        <SubHead>Source input hashes</SubHead>
        {IDENTITY_KEYS.map((key) => (
          <HashRow
            key={key}
            label={IDENTITY_LABELS[key]}
            value={m?.sourceScenarioIdentity?.[key] ?? null}
          />
        ))}

        <SubHead>Effective input hashes (prepared layout)</SubHead>
        {IDENTITY_KEYS.map((key) => (
          <HashRow key={key} label={IDENTITY_LABELS[key]} value={effective?.[key] ?? null} />
        ))}

        <SubHead>Run</SubHead>
        <Row label="Started" value={unknown(m?.startedAt)} />
        <Row label="Ended" value={unknown(m?.endedAt)} />
        <Row
          label="Package versions"
          value={
            packages.length ? packages.map(([name, v]) => `${name} ${v}`).join(', ') : 'unknown'
          }
        />
        <Row label="Plan" value={planSummary(plan)} />

        {sourceIdentityCheck ? (
          <>
            <SubHead>Source identity check</SubHead>
            {IDENTITY_KEYS.map((key) => (
              <Row
                key={key}
                label={IDENTITY_LABELS[key]}
                value={sourceIdentityCheck[key] ?? 'unknown'}
              />
            ))}
            {mismatched.length > 0 && (
              <Warning>
                Source scenario differs from the baseline&apos;s recorded source:{' '}
                {mismatched.join(', ')}
              </Warning>
            )}
          </>
        ) : (
          evalInfo && <Row label="Source identity check" value="unknown" />
        )}

        {m?.error && (
          <div className="text-xs text-muted mt-2 break-words">
            <span className="font-medium text-ink-2">Recorded error: </span>
            {truncateText(m.error, 300)}
          </div>
        )}
        {diagnostic && (
          <div className="text-xs text-muted mt-2 break-words">
            <span className="font-medium text-ink-2">Manifest diagnostic: </span>
            {truncateText(diagnostic, 200)}
          </div>
        )}

        {plan !== undefined && plan !== 'loading' && plan !== 'unavailable' && (
          <PlanPreview plan={plan} />
        )}
      </div>
    </Disclosure>
  )
}
