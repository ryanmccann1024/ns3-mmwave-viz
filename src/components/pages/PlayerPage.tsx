import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { UseSimDataReturn } from '../../hooks/useSimData'
import { telemetryAutoLoadBytes, useEpisodeTelemetry } from '../../hooks/useEpisodeTelemetry'
import type { MetricId } from '../../hooks/useMetricSeries'
import type { DecisionIndex } from '../../lib/decisionExplorer'
import {
  buildDecisionIndex,
  decisionAtTime,
  joinDecision,
  stepDecision,
} from '../../lib/decisionExplorer'
import type { NodeMapping } from '../../lib/nodeIdentity'
import { buildNodeMapping } from '../../lib/nodeIdentity'
import { DecisionExplorer } from '../decisions/DecisionExplorer'
import { Note } from '../ExperimentStatus'
import type { OverlayOption } from '../../hooks/useExperimentSession'
import type { LogEntry } from '../../types'
import type { ResultCatalog } from '../../lib/resultCatalog'
import type { Episode, Evaluation } from '../../lib/experimentIndex'
import type { BaselineRunMeta } from '../../lib/baselineRuns'
import type { BaselinePlan } from '../../lib/baselineManifest'
import { parseBaselinePlan } from '../../lib/baselineManifest'
import { policyLabel, rewardLabel } from '../../lib/rlLabels'
import { freqLabel } from '../../lib/format'
import { jammerActivity, jammerPositionAt } from '../../lib/jammers'
import type { Trail } from '../canvas/TrajectoryLayer'
import { NetworkCanvas } from '../canvas/NetworkCanvas'
import { ChartsView } from '../charts/ChartsView'
import { PlaybackControls } from '../PlaybackControls'
import { EpisodeDetails } from '../EpisodeDetails'
import { ReplayPicker } from '../rl/ReplayPicker'
import { EventLog } from '../EventLog'
import { FlowList, LinkDetail, LinkLegend, NodeDetail, NodeList } from '../InfoPanel'
import type { Crumb } from '../ui/Breadcrumbs'
import { Breadcrumbs } from '../ui/Breadcrumbs'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { StatItem } from '../ui/StatItem'
import { BaselineProvenance, BaselineSetupLine, baselineIdentityLabel } from './BaselineInfo'

export interface RlContext {
  catalog: ResultCatalog
  evaluation: Evaluation
  evaluations: Evaluation[]
  episode: Episode
  onOpenEpisode: (episode: Episode) => void
  openingEpisode: Episode | null
  trails: Trail[]
  overlayOptions: OverlayOption[]
  overlayPolicies: string[]
  trailErrors: Record<string, string>
  onToggleOverlay: (policy: string) => void
  trailNode: string | null
  onTrailNode: (node: string | null) => void
}

/** Choices that survive an episode switch when the next episode can honour them */
export interface PlayerPreferences {
  /** contract node id (string), resolved through the checked node mapping */
  nodeId: string | null
  tab: Tab | null
  metric: MetricId | null
}

export const EMPTY_PLAYER_PREFERENCES: PlayerPreferences = { nodeId: null, tab: null, metric: null }

interface Props {
  sim: UseSimDataReturn
  logs: LogEntry[]
  onSeek: (index: number) => void
  onSetSpeed: (s: Parameters<UseSimDataReturn['setSpeed']>[0]) => void
  onClearLogs: () => void
  /** where this player was opened from */
  parents: Crumb[]
  title: string
  rl: RlContext | null
  /** a standalone baseline seed: its manifest metadata and the catalog to read its plan from */
  baseline?: BaselineContext | null
  onClose: () => void
  preferences?: PlayerPreferences
  onPreferences?: (next: PlayerPreferences) => void
}

/** Tracks a CSS media query so exactly one tab panel (desktop aside or mobile rail) is mounted */
function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : true)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

type ExplorerData = { index: DecisionIndex; error: null } | { index: null; error: string | null }

export interface BaselineContext {
  meta: BaselineRunMeta
  catalog: ResultCatalog
}

type PlanState = BaselinePlan | 'unavailable' | 'loading'

/** Reads baseline-plan.json on demand; any failure leaves playback untouched */
function useBaselinePlan(baseline: BaselineContext | null | undefined): PlanState {
  const [plan, setPlan] = useState<PlanState>('loading')
  const planPath = baseline?.meta.planPath ?? null
  const catalog = baseline?.catalog ?? null
  useEffect(() => {
    if (!planPath || !catalog || !catalog.has(planPath)) {
      setPlan('unavailable')
      return
    }
    let cancelled = false
    setPlan('loading')
    catalog
      .getFile(planPath)
      .then((file) => (file ? file.text() : null))
      .then((text) => {
        if (cancelled) return
        const parsed = text === null ? null : parseBaselinePlan(text)
        setPlan(parsed?.ok ? parsed.value : 'unavailable')
      })
      .catch(() => !cancelled && setPlan('unavailable'))
    return () => {
      cancelled = true
    }
  }, [planPath, catalog])
  return plan
}

/** Only the model policy is a trained model; other policies just share the group's seed */
function trainingSeedText(episode: Episode) {
  if (episode.trainingSeed === null || episode.trainingSeed === undefined) return ''
  return episode.policy === 'model'
    ? ` · model trained with seed ${episode.trainingSeed}`
    : ` · evaluation group training seed ${episode.trainingSeed}`
}

type View = 'canvas' | 'charts'
type Tab = 'overview' | 'nodes' | 'episode' | 'decisions' | 'log'

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink-title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function PlayerPage({
  sim,
  logs,
  onSeek,
  onSetSpeed,
  onClearLogs,
  parents,
  title,
  rl,
  baseline,
  onClose,
  preferences = EMPTY_PLAYER_PREFERENCES,
  onPreferences,
}: Props) {
  const plan = useBaselinePlan(baseline)
  const [view, setView] = useState<View>('canvas')
  const tabs: { value: Tab; label: string }[] = [
    ...(rl ? [{ value: 'episode' as const, label: 'Episode' }] : []),
    { value: 'overview', label: 'Overview' },
    { value: 'nodes', label: 'Nodes' },
    ...(rl ? [{ value: 'decisions' as const, label: 'Decisions' }] : []),
    { value: 'log', label: 'Log' },
  ]
  const [tab, setTab] = useState<Tab>(() =>
    preferences.tab && tabs.some((t) => t.value === preferences.tab)
      ? preferences.tab
      : rl
        ? 'episode'
        : 'overview'
  )
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [selectedLink, setSelectedLink] = useState<string | null>(null)
  const [selectedFlow, setSelectedFlow] = useState<{ src: number; dst: number } | null>(null)
  // Decision explorer state: episode-relative, so it starts fresh on every player mount
  const [selectedDecision, setSelectedDecision] = useState<number | null>(null)
  const [decisionRange, setDecisionRange] = useState<[number, number] | null>(null)
  const [focusSlot, setFocusSlot] = useState<number | null>(null)
  const [seekNotice, setSeekNotice] = useState<string | null>(null)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // steps.jsonl is read once here and shared by the Episode and Decisions tabs
  const telemetryState = useEpisodeTelemetry(rl?.catalog ?? null, rl?.episode.files.steps ?? null, {
    maxAutoBytes: telemetryAutoLoadBytes(),
    allowLarge: false,
  })
  const telemetry = telemetryState.status === 'ready' ? telemetryState.telemetry : null
  const explorer = useMemo<ExplorerData>(() => {
    if (!telemetry) return { index: null, error: null }
    try {
      return { index: buildDecisionIndex(telemetry), error: null }
    } catch (err) {
      return { index: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [telemetry])

  const firstFrame = sim.frames[0] ?? null
  const declaredNodeIds = sim.declaredNodeIds
  const mapping = useMemo<NodeMapping>(() => {
    if (!telemetry) return { status: 'unavailable', reason: 'decision telemetry is not loaded' }
    if (!firstFrame) return { status: 'unavailable', reason: 'no playback frame is loaded' }
    if (declaredNodeIds.status === 'invalid') {
      return {
        status: 'unavailable',
        reason: `archived nodes.json is invalid: ${declaredNodeIds.reason}`,
      }
    }
    return buildNodeMapping(
      telemetry.header.contract,
      new Set(firstFrame.nodes.map((n) => n.id)),
      declaredNodeIds.status === 'valid' ? declaredNodeIds.ids : undefined
    )
  }, [telemetry, firstFrame, declaredNodeIds])
  const mapped = mapping.status === 'mapped' ? mapping : null

  // Restore the compatible node choice once the mapping for this episode is proved
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current || !mapped) return
    restoredRef.current = true
    if (preferences.nodeId !== null) {
      const csvId = mapped.csvIdByContractId.get(preferences.nodeId)
      if (csvId !== undefined) {
        setSelectedNode(csvId)
        setFocusSlot(mapped.slotByCsvId.get(csvId) ?? null)
      }
    }
  }, [mapped, preferences.nodeId])

  const publish = useCallback(
    (patch: Partial<PlayerPreferences>) => onPreferences?.({ ...preferences, ...patch }),
    [onPreferences, preferences]
  )
  const onMetricChange = useCallback(
    (metric: MetricId) => {
      if (preferences.metric !== metric) publish({ metric })
    },
    [publish, preferences.metric]
  )

  const selectDecision = useCallback(
    (decision: number) => {
      setSelectedDecision(decision)
      if (!telemetry || !explorer.index) return
      const join = joinDecision(telemetry, explorer.index, decision)
      sim.pause()
      if (!join) {
        setSeekNotice('No playback frame at this decision: the record was not saved.')
        return
      }
      let hit: number | null = null
      if (join.kind === 'reset') {
        hit = sim.seekInstant(join.record.time_s)
      } else if (join.outcome && join.outcome.intervalStartS !== null) {
        hit = sim.seekDecisionWindow(join.outcome.intervalStartS, join.outcome.intervalEndS)
      }
      setSeekNotice(
        hit === null
          ? join.kind !== 'reset' && join.outcome?.intervalStartS === null
            ? 'No playback frame at this decision: tick_s is unavailable, so its interval is unknown.'
            : 'No playback frame at this decision: playback has no frame inside its outcome interval.'
          : null
      )
    },
    [telemetry, explorer.index, sim]
  )

  // Opening Decisions selects the saved action under the playhead, else the first saved action
  const currentTime = sim.currentFrame?.time ?? null
  useEffect(() => {
    if (tab !== 'decisions' || selectedDecision !== null || !telemetry || !explorer.index) return
    if (telemetry.steps.length === 0) return
    const idx = explorer.index
    const atPlayhead = currentTime === null ? null : decisionAtTime(idx, currentTime)
    const firstAction = stepDecision(idx, 0, 1)
    const pick =
      atPlayhead !== null && atPlayhead !== 0 ? atPlayhead : (firstAction ?? idx.minDecision)
    selectDecision(pick)
  }, [tab, selectedDecision, telemetry, explorer.index, currentTime, selectDecision])

  const frame = sim.currentFrame
  if (!frame) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm text-muted"
        aria-busy="true"
        role="status"
      >
        Loading simulation…
      </div>
    )
  }

  const changeTab = (next: Tab) => {
    setTab(next)
    publish({ tab: next })
  }

  // A click in the scene should show what was clicked, unless the explorer is open
  const reveal = () => setTab((t) => (t === 'nodes' || t === 'decisions' ? t : 'overview'))
  const rememberNode = (id: number | null) => {
    const contractId = id !== null && mapped ? (mapped.contractIdByCsvId.get(id) ?? null) : null
    if (contractId !== preferences.nodeId) publish({ nodeId: contractId })
  }
  const selectNode = (id: number | null) => {
    setSelectedNode(id)
    setSelectedLink(null)
    rememberNode(id)
    if (mapped) setFocusSlot(id === null ? null : (mapped.slotByCsvId.get(id) ?? null))
    if (id !== null) reveal()
  }
  const selectLink = (key: string | null) => {
    setSelectedLink(key)
    setSelectedNode(null)
    if (key !== null) reveal()
  }
  const focusSlotFromChip = (slot: number | null) => {
    setFocusSlot(slot)
    const slotNodeIds = telemetry?.header.contract.slot_node_ids ?? []
    rl?.onTrailNode(slot === null ? null : (slotNodeIds[slot] ?? null))
    if (!mapped) return
    const csvId = slot === null ? null : (mapped.csvIdBySlot[slot] ?? null)
    if (csvId !== null) {
      setSelectedNode(csvId)
      setSelectedLink(null)
      rememberNode(csvId)
    }
  }
  const uncontrolledNode =
    tab === 'decisions' && mapped && selectedNode !== null && !mapped.slotByCsvId.has(selectedNode)
      ? selectedNode
      : null

  const { nodes, links, flows } = frame
  const node = selectedNode !== null ? (nodes.find((n) => n.id === selectedNode) ?? null) : null
  const link = selectedLink
    ? (links.find((l) => `${l.nodeA}-${l.nodeB}` === selectedLink) ?? null)
    : null
  const sinrLinks = links.filter((l) => l.sinr !== undefined)
  const avgSinr = sinrLinks.length
    ? sinrLinks.reduce((s, l) => s + (l.sinr ?? 0), 0) / sinrLinks.length
    : null
  const rlBaseline = rl ? (rl.evaluation.baselines[rl.episode.policy] ?? null) : null
  /** undefined: not a baseline run; null: baseline run whose manifest could not be read */
  const baselineManifest = baseline ? baseline.meta.manifest : undefined
  const demand = flows.reduce((s, f) => s + f.demandMbps, 0)
  const delivered = flows.reduce((s, f) => s + f.deliveredMbps, 0)

  const tabContent = (
    <>
      {rl && (
        <div className="mb-5">
          <ReplayPicker
            key={rl.episode.dir}
            evaluations={rl.evaluations}
            current={rl.episode}
            onOpen={rl.onOpenEpisode}
            opening={rl.openingEpisode}
            compact
          />
        </div>
      )}
      {tab === 'overview' && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2">
            <StatItem
              label="Nodes active"
              value={`${nodes.filter((n) => n.active).length}/${nodes.length}`}
            />
            <StatItem
              label="Links up"
              value={`${links.filter((l) => l.connected).length}/${links.length}`}
            />
            <StatItem
              label="Avg SINR"
              value={avgSinr === null ? 'n/a' : `${avgSinr.toFixed(1)} dB`}
            />
            {demand > 0 ? (
              <StatItem
                label="Traffic delivered"
                value={`${((delivered / demand) * 100).toFixed(0)}%`}
              />
            ) : (
              <StatItem
                label="Rain"
                value={sim.meta && sim.meta.rainRate > 0 ? `${sim.meta.rainRate} mm/h` : 'None'}
              />
            )}
          </div>

          <Section
            title="Selection"
            aside={
              (node || link) && (
                <button
                  onClick={() => selectNode(null)}
                  className="text-[11px] font-medium text-muted hover:text-ink"
                >
                  Clear
                </button>
              )
            }
          >
            {node ? (
              <NodeDetail node={node} links={links} />
            ) : link ? (
              <LinkDetail link={link} />
            ) : (
              <div className="text-xs text-muted">
                Click a node or link in the scene, or pick one under Nodes, to inspect it.
              </div>
            )}
          </Section>

          <Section title="Links">
            <LinkLegend />
          </Section>

          {baseline && (
            <BaselineProvenance
              manifest={baseline.meta.manifest}
              manifestError={baseline.meta.manifestError}
              plan={plan}
            />
          )}

          {sim.jammers.length > 0 && (
            <Section title={`Jammers (${sim.jammers.length})`}>
              <div className="flex flex-col gap-2">
                {sim.jammers.map((jammer) => {
                  const activity = jammerActivity(jammer, frame.time, sim.meta?.frequency ?? 0)
                  const position = jammerPositionAt(jammer, frame.time)
                  return (
                    <div
                      key={jammer.id}
                      className="rounded-xl border border-hairline bg-white/75 px-3 py-2 text-sm text-ink-2"
                    >
                      <div className="font-semibold text-rose-700">
                        ◆ {jammer.id} ·{' '}
                        {activity === 'on'
                          ? 'on'
                          : activity === 'off'
                            ? 'off'
                            : 'bursty (exact state unavailable)'}
                      </div>
                      <div>
                        Position: ({position.x.toFixed(1)}, {position.y.toFixed(1)},{' '}
                        {position.z.toFixed(1)}) m
                      </div>
                      <div>
                        Power: {jammer.txPowerDbm} dBm · Duty: {(jammer.dutyCycle * 100).toFixed(0)}
                        %
                      </div>
                      <div>
                        {jammer.maxRangeM > 0
                          ? `Configured receiver-distance cutoff: ${jammer.maxRangeM.toLocaleString()} m`
                          : 'No finite range cutoff configured'}
                      </div>
                      <div>
                        Target:{' '}
                        {jammer.targetFreqMhz.length
                          ? `${jammer.targetFreqMhz.join('–')} MHz`
                          : 'all frequencies'}
                      </div>
                    </div>
                  )
                })}
                <p className="text-xs text-muted">
                  Inspect link SINR and traffic delivery to see the jammer’s measured effect.
                </p>
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === 'nodes' && (
        <div className="flex flex-col gap-5">
          <Section title={`Nodes (${nodes.length})`}>
            <NodeList frame={frame} selectedNode={selectedNode} onSelectNode={selectNode} />
          </Section>
          {flows.length > 0 && (
            <Section title={`Flows (${flows.length})`}>
              <FlowList
                frame={frame}
                selectedFlow={selectedFlow}
                onSelectFlow={(flow) => {
                  setSelectedFlow(flow)
                  setSelectedNode(null)
                  setSelectedLink(null)
                }}
              />
            </Section>
          )}
        </div>
      )}

      {tab === 'episode' && rl && (
        <EpisodeDetails
          catalog={rl.catalog}
          evaluation={rl.evaluation}
          episode={rl.episode}
          currentTime={frame.time}
          telemetryState={telemetryState}
          decisionIndex={explorer.index}
          indexError={explorer.error}
          overlayOptions={rl.overlayOptions}
          overlayPolicies={rl.overlayPolicies}
          trailErrors={rl.trailErrors}
          onToggleOverlay={rl.onToggleOverlay}
          trailNode={rl.trailNode}
          onTrailNode={rl.onTrailNode}
        />
      )}

      {tab === 'decisions' && rl && (
        <div className="flex flex-col gap-3">
          {uncontrolledNode !== null && (
            <Note>Node {uncontrolledNode} is not policy-controlled.</Note>
          )}
          <DecisionExplorer
            episode={rl.episode}
            telemetryState={telemetryState}
            onLoadExplicitly={telemetryState.loadExplicitly}
            index={explorer.index}
            indexError={explorer.error}
            mapping={mapping}
            frame={frame}
            selectedDecision={selectedDecision}
            onSelectDecision={selectDecision}
            decisionRange={decisionRange}
            onDecisionRange={setDecisionRange}
            focusSlot={focusSlot}
            onFocusSlot={focusSlotFromChip}
            seekNotice={seekNotice}
          />
        </div>
      )}

      {tab === 'log' && <EventLog logs={logs} onClear={onClearLogs} />}
    </>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <header className="glass flex items-center gap-4 px-4 py-2.5 flex-shrink-0">
        <div className="min-w-0">
          <Breadcrumbs items={[...parents, { label: title }]} />
          {rl ? (
            <div className="text-sm text-ink-2 mt-1">
              <strong className="text-ink">{rewardLabel(rl.evaluation)}</strong> ·{' '}
              {rlBaseline
                ? baselineIdentityLabel(
                    rlBaseline.method ?? rl.episode.policy,
                    rlBaseline.objective
                  )
                : policyLabel(rl.episode.policy)}{' '}
              · evaluation seed {rl.episode.seed}
              {trainingSeedText(rl.episode)}
              {rlBaseline && (
                <BaselineSetupLine
                  initialDisplacementMTotal={rlBaseline.initialDisplacementMTotal}
                  plannerWallS={rlBaseline.plannerWallS}
                />
              )}
            </div>
          ) : (
            <>
              {baselineManifest !== undefined && (
                <div className="text-sm text-ink-2 mt-1">
                  {baselineIdentityLabel(
                    baselineManifest?.method ?? null,
                    baselineManifest?.objective ?? null
                  )}
                  {baselineManifest === null && ' · manifest unreadable'}
                </div>
              )}
              {sim.meta && (
                <div className="text-sm text-muted truncate">
                  {sim.meta.scenario} · {freqLabel(sim.meta.frequency)} · {nodes.length} nodes
                </div>
              )}
              {baselineManifest && (
                <BaselineSetupLine
                  initialDisplacementMTotal={baselineManifest.initialDisplacementMTotal}
                  plannerWallS={baselineManifest.plannerWallS}
                />
              )}
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <Segmented
            options={[
              { value: 'canvas', label: '3D' },
              { value: 'charts', label: 'Charts' },
            ]}
            value={view}
            onChange={setView}
          />
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </header>

      {rl && (
        <div className="lg:hidden">
          <ReplayPicker
            key={rl.episode.dir}
            evaluations={rl.evaluations}
            current={rl.episode}
            onOpen={rl.onOpenEpisode}
            opening={rl.openingEpisode}
            compact
          />
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-3">
        <div className="flex flex-col flex-1 min-w-0 gap-3">
          {view === 'canvas' ? (
            <div className="glass flex-1 min-h-[16rem] lg:min-h-0 p-1.5">
              <div className="relative h-full rounded-xl overflow-hidden">
                <NetworkCanvas
                  frame={frame}
                  nextFrame={sim.nextFrame}
                  frameAlphaRef={sim.frameAlphaRef}
                  buildings={sim.buildings}
                  jammers={sim.jammers}
                  sceneBounds={sim.sceneBounds}
                  meta={sim.meta}
                  compact={sim.compact}
                  selectedNode={selectedNode}
                  selectedLink={selectedLink}
                  selectedFlow={selectedFlow}
                  onSelectNode={selectNode}
                  onSelectLink={selectLink}
                  trails={rl?.trails}
                />
                <div
                  className="absolute top-3 right-3 z-10 rounded-xl bg-white/90 border border-hairline shadow-control p-1"
                  title="Compact view compresses distances for visibility; to-scale view preserves geometry."
                >
                  <Segmented
                    size="sm"
                    options={[
                      { value: 'scale', label: 'To scale' },
                      { value: 'compact', label: 'Compact view' },
                    ]}
                    value={sim.compact ? 'compact' : 'scale'}
                    onChange={(value) => sim.setCompact(value === 'compact')}
                  />
                </div>
                {rl && !sim.playing && sim.frameIndex === 0 && (
                  <div className="absolute bottom-4 left-4 z-10 rounded-xl bg-ink/85 text-white px-4 py-2.5 text-sm shadow-control">
                    Press Play to watch the {policyLabel(rl.episode.policy).toLowerCase()} replay.
                    Colored lines show saved paths.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <ChartsView
                frames={sim.frames}
                frameIndex={sim.frameIndex}
                selectedLink={selectedLink}
                onSelectLink={selectLink}
                preferredMetric={preferences.metric}
                onMetricChange={onMetricChange}
              />
            </div>
          )}

          <PlaybackControls
            playing={sim.playing}
            speed={sim.speed}
            frameIndex={sim.frameIndex}
            totalFrames={sim.frames.length}
            currentTime={frame.time}
            onPlay={sim.play}
            onPause={sim.pause}
            onSeek={onSeek}
            onSetSpeed={onSetSpeed}
          />

          {!isDesktop && (
            <div className="glass flex flex-col min-h-0 max-h-[45dvh] flex-shrink-0">
              <div className="p-2 flex-shrink-0 overflow-x-auto">
                <Segmented stretch size="sm" options={tabs} value={tab} onChange={changeTab} />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-2">{tabContent}</div>
            </div>
          )}
        </div>

        {isDesktop && (
          <aside
            className={`glass flex-shrink-0 flex flex-col min-h-0 ${
              tab === 'decisions' ? 'w-[23rem] xl:w-[min(50vw,44rem)]' : 'w-[23rem] xl:w-[26rem]'
            }`}
          >
            <div className="p-3 flex-shrink-0">
              <Segmented stretch size="sm" options={tabs} value={tab} onChange={changeTab} />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3">{tabContent}</div>
          </aside>
        )}
      </div>
    </div>
  )
}
