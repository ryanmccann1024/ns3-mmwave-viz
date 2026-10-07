import { useMemo } from 'react'
import type { Episode } from '../../lib/experimentIndex'
import type { DecisionIndex, EpisodeTelemetry } from '../../lib/decisionExplorer'
import { joinDecision, stepDecision } from '../../lib/decisionExplorer'
import type { NodeMapping } from '../../lib/nodeIdentity'
import type { TelemetryState } from '../../hooks/useEpisodeTelemetry'
import type { SimFrame } from '../../types'
import { NODE_COLORS } from '../../styles/tokens'
import { MOTION } from '../../styles/motion'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { Note } from '../ExperimentStatus'
import { DecisionStrip } from './DecisionStrip'
import { DecisionMore, DecisionSummary } from './DecisionDetail'
import { Disclosure } from '../ui/Disclosure'
import { DecisionList } from './DecisionList'

interface Props {
  episode: Episode
  telemetryState: TelemetryState
  onLoadExplicitly: () => void
  index: DecisionIndex | null
  indexError: string | null
  mapping: NodeMapping
  frame: SimFrame
  selectedDecision: number | null
  onSelectDecision: (decision: number) => void
  decisionRange: [number, number] | null
  onDecisionRange: (range: [number, number] | null) => void
  focusSlot: number | null
  onFocusSlot: (slot: number | null) => void
  seekNotice: string | null
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Reading decision telemetry">
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 w-24 rounded-xl bg-ink/[0.06] animate-pulse-soft" />
        ))}
      </div>
      <div className="h-24 rounded-xl bg-ink/[0.06] animate-pulse-soft" />
      <Skeleton lines={3} />
    </div>
  )
}

/** The Decisions tab: chips → timeline → detail → windowed list, with explicit unavailable states. */
export function DecisionExplorer({
  episode,
  telemetryState,
  onLoadExplicitly,
  index,
  indexError,
  mapping,
  frame,
  selectedDecision,
  onSelectDecision,
  decisionRange,
  onDecisionRange,
  focusSlot,
  onFocusSlot,
  seekNotice,
}: Props) {
  const telemetry: EpisodeTelemetry | null =
    telemetryState.status === 'ready' ? telemetryState.telemetry : null

  const fullDomain = useMemo<[number, number]>(
    () => (index ? [index.minDecision, index.expected] : [0, 0]),
    [index]
  )
  const navRange = useMemo<[number, number]>(
    () => decisionRange ?? fullDomain,
    [decisionRange, fullDomain]
  )

  const join = useMemo(
    () =>
      telemetry && index && selectedDecision !== null
        ? joinDecision(telemetry, index, selectedDecision)
        : null,
    [telemetry, index, selectedDecision]
  )

  const colorBySlot = useMemo(() => {
    if (mapping.status !== 'mapped') return undefined
    const byId = new Map(frame.nodes.map((n) => [n.id, NODE_COLORS[n.nodeType]]))
    return mapping.csvIdBySlot.map((id) => (id === null ? null : (byId.get(id) ?? null)))
  }, [mapping, frame.nodes])

  if (!episode.files.steps) {
    return <Note>Decision telemetry was not saved for this episode. Playback is unaffected.</Note>
  }
  if (telemetryState.status === 'idle' || telemetryState.status === 'loading')
    return <LoadingSkeleton />
  if (telemetryState.status === 'needs_explicit_load') {
    return (
      <div className="flex flex-col gap-3">
        <Note tone="warn">
          {telemetryState.reason}. Loading it keeps every saved decision in memory.
        </Note>
        <div>
          <Button variant="primary" onClick={onLoadExplicitly}>
            Load this episode
          </Button>
        </div>
      </div>
    )
  }
  if (telemetryState.status === 'error') {
    return <Note tone="error">Could not read steps.jsonl: {telemetryState.error}</Note>
  }
  if (indexError) return <Note tone="error">Could not index steps.jsonl: {indexError}</Note>
  if (!telemetry || !index) return null
  if (telemetry.steps.length === 0) return <Note>steps.jsonl has no decision records.</Note>

  const prev =
    selectedDecision !== null ? stepDecision(index, selectedDecision, -1, navRange) : null
  const next = selectedDecision !== null ? stepDecision(index, selectedDecision, 1, navRange) : null
  const resetOnly = index.maxDecision === 0

  const total = index.coverageKnown ? index.expected : index.maxDecision

  return (
    <div className={`flex flex-col gap-4 sm:gap-5 min-w-0 ${MOTION.enterFade}`}>
      <section className="glass p-6 min-w-0">
        {join ? (
          <DecisionSummary
            telemetry={telemetry}
            join={join}
            total={total}
            focusSlot={focusSlot}
            onFocusSlot={onFocusSlot}
            colorBySlot={colorBySlot}
            onPrev={() => prev !== null && onSelectDecision(prev)}
            onNext={() => next !== null && onSelectDecision(next)}
            canPrev={prev !== null}
            canNext={next !== null}
          />
        ) : (
          <div className="text-base text-ink-2">
            {resetOnly
              ? 'Only the episode start was saved.'
              : 'Pick a decision on the timeline below.'}
          </div>
        )}
      </section>

      <section className="glass p-6 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-semibold tracking-tight text-ink-title">
            Reward at every decision
          </h2>
          {decisionRange && (
            <Button variant="secondary" onClick={() => onDecisionRange(null)}>
              Show whole episode
            </Button>
          )}
        </div>
        <p className="text-base text-ink-2">
          Higher marks earned more. Click one to jump there; drag across to zoom in.
        </p>
        <DecisionStrip
          index={index}
          domain={decisionRange ?? fullDomain}
          selectedDecision={selectedDecision}
          brush={null}
          onSelect={onSelectDecision}
          onBrush={onDecisionRange}
          navRange={navRange}
          label="Decision timeline"
          coverageKnown={decisionRange ? true : index.coverageKnown}
        />
      </section>

      {join && (
        <div className="glass px-6">
          <Disclosure title="Details for this decision">
            <DecisionMore
              telemetry={telemetry}
              join={join}
              focusSlot={focusSlot}
              mapping={mapping}
              frame={frame}
              seekNotice={seekNotice}
            />
          </Disclosure>
          <Disclosure title="Every decision as a list">
            <DecisionList
              telemetry={telemetry}
              index={index}
              range={navRange}
              selectedDecision={selectedDecision}
              focusSlot={focusSlot}
              onSelect={onSelectDecision}
            />
          </Disclosure>
        </div>
      )}
      {mapping.status === 'unavailable' && (
        <Note>The scene could not be linked to these nodes: {mapping.reason}.</Note>
      )}
    </div>
  )
}
