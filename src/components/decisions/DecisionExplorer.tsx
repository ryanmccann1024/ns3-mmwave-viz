import { useMemo } from 'react'
import type { Episode } from '../../lib/experimentIndex'
import type { DecisionIndex, EpisodeTelemetry } from '../../lib/decisionExplorer'
import { joinDecision, stepDecision } from '../../lib/decisionExplorer'
import type { NodeMapping } from '../../lib/nodeIdentity'
import type { TelemetryState } from '../../hooks/useEpisodeTelemetry'
import type { SimFrame } from '../../types'
import { policyLabel } from '../../lib/rlLabels'
import { NODE_COLORS } from '../../styles/tokens'
import { MOTION } from '../../styles/motion'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { Note } from '../ExperimentStatus'
import { SlotChips } from './SlotChips'
import { DecisionStrip } from './DecisionStrip'
import { DecisionDetail } from './DecisionDetail'
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
          <div key={i} className="h-7 w-16 rounded-full bg-muted/15 animate-pulse-soft" />
        ))}
      </div>
      <div className="h-[72px] rounded-lg bg-muted/15 animate-pulse-soft" />
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

  const contract = telemetry.header.contract
  const prev =
    selectedDecision !== null ? stepDecision(index, selectedDecision, -1, navRange) : null
  const next = selectedDecision !== null ? stepDecision(index, selectedDecision, 1, navRange) : null
  const resetOnly = index.maxDecision === 0

  return (
    <div className={`flex flex-col gap-3 min-w-0 ${MOTION.enterFade}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          label={policyLabel(episode.policy)}
          colorClass="bg-gray-100 text-ink-2 border border-gray-300"
        />
        <span className="text-xs text-muted">
          {telemetry.steps.length} saved record{telemetry.steps.length === 1 ? '' : 's'}
          {index.coverageKnown ? ` of ${index.expected + 1}` : ' · declared count unavailable'}
          {index.gaps.length > 0
            ? ` · ${index.gaps.length} hole${index.gaps.length === 1 ? '' : 's'}`
            : ''}
        </span>
      </div>

      <SlotChips
        slotNodeIds={contract.slot_node_ids}
        focusSlot={focusSlot}
        onFocusSlot={onFocusSlot}
        mapping={mapping}
        colorBySlot={colorBySlot}
      />
      {mapping.status === 'unavailable' && (
        <Note>Scene linkage unavailable: {mapping.reason}. Chips still filter the records.</Note>
      )}

      <DecisionStrip
        index={index}
        domain={fullDomain}
        selectedDecision={selectedDecision}
        brush={decisionRange}
        onSelect={onSelectDecision}
        onBrush={onDecisionRange}
        navRange={navRange}
        label="Decision timeline"
        coverageKnown={index.coverageKnown}
      />
      {decisionRange && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>
              Focused range {decisionRange[0]}–{decisionRange[1]}
            </span>
            <Button variant="ghost" onClick={() => onDecisionRange(null)}>
              Show all
            </Button>
          </div>
          <DecisionStrip
            index={index}
            domain={decisionRange}
            selectedDecision={selectedDecision}
            onSelect={onSelectDecision}
            onBrush={onDecisionRange}
            navRange={decisionRange}
            label="Focused decision range"
            heightClass="h-14"
            coverageKnown
          />
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 min-[1600px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {join ? (
          <DecisionDetail
            telemetry={telemetry}
            join={join}
            focusSlot={focusSlot}
            mapping={mapping}
            frame={frame}
            onPrev={() => prev !== null && onSelectDecision(prev)}
            onNext={() => next !== null && onSelectDecision(next)}
            canPrev={prev !== null}
            canNext={next !== null}
            seekNotice={seekNotice}
          />
        ) : (
          <Note>
            {resetOnly
              ? 'Only the reset was saved.'
              : 'Pick a decision on the timeline or in the list.'}
          </Note>
        )}
        <DecisionList
          telemetry={telemetry}
          index={index}
          range={navRange}
          selectedDecision={selectedDecision}
          focusSlot={focusSlot}
          onSelect={onSelectDecision}
        />
      </div>
    </div>
  )
}
