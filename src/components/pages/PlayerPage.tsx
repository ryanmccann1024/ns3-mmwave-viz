import { MOTION } from '../../styles/motion'
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
import { Button, SECONDARY_BUTTON } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { StatItem } from '../ui/StatItem'
import {
  BaselineProvenance,
  BaselineSetupLine,
  PlanPreview,
  baselineIdentityLabel,
} from './BaselineInfo'

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
function useBaselinePlan(catalog: ResultCatalog | null, planPath: string | null): PlanState {
  const [plan, setPlan] = useState<PlanState>('loading')
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

type View = 'canvas' | 'charts' | 'decisions'
type Tab = 'overview' | 'nodes' | 'episode' | 'log'

const PANEL_KEY = 'player.panelOpen'

/** Whether the side panel is open, remembered per browser (falls back to open) */
function usePanelOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(PANEL_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const set = useCallback((next: boolean) => {
    setOpen(next)
    try {
      window.localStorage.setItem(PANEL_KEY, String(next))
    } catch {
      // storage unavailable: the choice lasts for this page only
    }
  }, [])
  return [open, set]
}

/** A window with a side column; the column is filled while the panel is open */
function PanelIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="3.5"
        width="15"
        height="13"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M12.5 3.5v13" stroke="currentColor" strokeWidth="1.6" />
      <rect
        x="13.3"
        y="4.3"
        width="3.4"
        height="11.4"
        rx="1.2"
        fill="currentColor"
        className={`${MOTION.fade} ${open ? 'opacity-100' : 'opacity-0'}`}
      />
    </svg>
  )
}

/** Full screen for one element, tracking Esc and other ways the browser leaves it */
function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [active, setActive] = useState(false)
  const supported = typeof document !== 'undefined' && !!document.fullscreenEnabled
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = useCallback(() => {
    // Either call can be refused (no user gesture, a policy); the page just stays as it is
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else ref.current?.requestFullscreen().catch(() => {})
  }, [])
  return { ref, active, supported, toggle }
}

/** Four corners pointing out (enter) or in (exit) */
function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {exit ? (
        <path d="M7.5 3v4.5H3M12.5 3v4.5H17M7.5 17v-4.5H3M12.5 17v-4.5H17" />
      ) : (
        <path d="M3 7.5V3h4.5M17 7.5V3h-4.5M3 12.5V17h4.5M17 12.5V17h-4.5" />
      )}
    </svg>
  )
}

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
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight text-ink-title">{title}</h3>
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
  title,
  rl,
  baseline,
  onClose,
  preferences = EMPTY_PLAYER_PREFERENCES,
  onPreferences,
}: Props) {
  const evalBaseline = rl?.evaluation.baselines[rl.episode.policy] ?? null
  const plan = useBaselinePlan(
    baseline?.catalog ?? rl?.catalog ?? null,
    baseline?.meta.planPath ?? evalBaseline?.planPath ?? null
  )
  const [view, setView] = useState<View>('canvas')
  const [showPlacement, setShowPlacement] = useState(true)
  const tabs: { value: Tab; label: string }[] = [
    ...(rl ? [{ value: 'episode' as const, label: 'Episode' }] : []),
    { value: 'overview', label: 'Overview' },
    { value: 'nodes', label: 'Nodes' },
    { value: 'log', label: 'Log' },
  ]
  const [panelOpen, setPanelOpen] = usePanelOpen()
  const {
    ref: sceneRef,
    active: fullscreen,
    supported: fullscreenSupported,
    toggle: toggleFullscreen,
  } = useFullscreen<HTMLDivElement>()
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
      // Saved frames can be sparser than decisions: fall back to the nearest frame in time
      if (hit === null && sim.frames.length > 0) {
        const target = join.record.time_s
        let best = 0
        for (let i = 1; i < sim.frames.length; i++) {
          if (Math.abs(sim.frames[i].time - target) < Math.abs(sim.frames[best].time - target)) {
            best = i
          }
        }
        sim.seek(best)
      }
      setSeekNotice(null)
    },
    [telemetry, explorer.index, sim]
  )

  // Opening Decisions selects the saved action under the playhead, else the first saved action
  const currentTime = sim.currentFrame?.time ?? null
  useEffect(() => {
    if (view !== 'decisions' || selectedDecision !== null || !telemetry || !explorer.index) return
    if (telemetry.steps.length === 0) return
    const idx = explorer.index
    const atPlayhead = currentTime === null ? null : decisionAtTime(idx, currentTime)
    const firstAction = stepDecision(idx, 0, 1)
    const pick =
      atPlayhead !== null && atPlayhead !== 0 ? atPlayhead : (firstAction ?? idx.minDecision)
    selectDecision(pick)
  }, [view, selectedDecision, telemetry, explorer.index, currentTime, selectDecision])

  const frame = sim.currentFrame
  if (!frame) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-base text-ink-2"
        aria-busy="true"
        role="status"
      >
        Loading simulation…
      </div>
    )
  }

  const placementPlan = typeof plan === 'object' ? plan : null

  const changeTab = (next: Tab) => {
    setTab(next)
    publish({ tab: next })
  }

  // A click in the scene shows what was clicked in the panel, opening it if needed
  const reveal = () => {
    if (view === 'decisions') return
    setTab((t) => (t === 'nodes' ? t : 'overview'))
    if (!panelOpen) setPanelOpen(true)
  }
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
    view === 'decisions' && mapped && selectedNode !== null && !mapped.slotByCsvId.has(selectedNode)
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
      <div className="pb-5 mb-5 border-b border-hairline">
        {rl ? (
          <ReplayPicker
            key={rl.episode.dir}
            evaluations={rl.evaluations}
            current={rl.episode}
            onOpen={rl.onOpenEpisode}
            opening={rl.openingEpisode}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight text-ink-title">{title}</h2>
            {baselineManifest !== undefined && (
              <div className="text-base text-ink-2">
                {baselineIdentityLabel(
                  baselineManifest?.method ?? null,
                  baselineManifest?.objective ?? null
                )}
                {baselineManifest === null && ' · manifest unreadable'}
              </div>
            )}
            {sim.meta && (
              <div className="text-base text-ink-2">
                {sim.meta.scenario} · {freqLabel(sim.meta.frequency)} · {nodes.length} nodes
              </div>
            )}
            {baselineManifest && (
              <BaselineSetupLine
                className="text-base text-ink-2"
                initialDisplacementMTotal={baselineManifest.initialDisplacementMTotal}
                plannerWallS={baselineManifest.plannerWallS}
              />
            )}
          </div>
        )}
      </div>
      {tab === 'overview' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3">
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
                <Button variant="secondary" onClick={() => selectNode(null)}>
                  Clear
                </Button>
              )
            }
          >
            {node ? (
              <NodeDetail node={node} links={links} />
            ) : link ? (
              <LinkDetail link={link} />
            ) : (
              <div className="text-base text-ink-2">
                Click a node or link in the scene, or pick one under Nodes.
              </div>
            )}
          </Section>

          <Section title="Links">
            <LinkLegend />
          </Section>

          {(baseline?.meta.planPath || rlBaseline?.planPath) && (
            <Section title="Placement">
              {plan === 'loading' ? (
                <div className="text-base text-ink-2">Loading placement…</div>
              ) : plan === 'unavailable' ? (
                <div className="text-base text-ink-2">Placement plan unavailable.</div>
              ) : (
                <PlanPreview plan={plan} />
              )}
            </Section>
          )}

          {baseline && (
            <BaselineProvenance
              manifest={baseline.meta.manifest}
              manifestError={baseline.meta.manifestError}
              plan={plan}
            />
          )}

          {rlBaseline && (
            <BaselineProvenance
              manifest={rlBaseline.manifest}
              evalInfo={rlBaseline}
              plan={plan}
              title="Baseline details"
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
                      className="tile px-4 py-3 text-base text-ink-2 leading-relaxed"
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
                <p className="text-base text-ink-2">
                  Inspect link SINR and traffic delivery to see the jammer’s measured effect.
                </p>
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === 'nodes' && (
        <div className="flex flex-col gap-6">
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
          overlayOptions={rl.overlayOptions}
          overlayPolicies={rl.overlayPolicies}
          trailErrors={rl.trailErrors}
          onToggleOverlay={rl.onToggleOverlay}
          trailNode={rl.trailNode}
          onTrailNode={rl.onTrailNode}
        />
      )}

      {tab === 'log' && <EventLog logs={logs} onClear={onClearLogs} />}
    </>
  )

  const decisionsView = rl ? (
    <div className="flex flex-col gap-4 sm:gap-5 pb-2">
      {uncontrolledNode !== null && <Note>Node {uncontrolledNode} is not policy-controlled.</Note>}
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
  ) : null

  const tabBar = <Segmented size="lg" stretch options={tabs} value={tab} onChange={changeTab} />

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <header className="flex items-center gap-3 flex-shrink-0">
        <Segmented
          size="lg"
          options={[
            { value: 'canvas', label: '3D' },
            { value: 'charts', label: 'Charts' },
            ...(rl ? [{ value: 'decisions' as const, label: 'Decisions' }] : []),
          ]}
          value={view}
          onChange={setView}
        />
        <div className="ml-auto flex items-center gap-3">
          {isDesktop && (
            <button
              type="button"
              onClick={() => setPanelOpen(!panelOpen)}
              aria-pressed={panelOpen}
              aria-label={panelOpen ? 'Hide side panel' : 'Show side panel'}
              title={panelOpen ? 'Hide side panel' : 'Show side panel'}
              className={`${SECONDARY_BUTTON} !w-10 !px-0 ${panelOpen ? '!bg-accent-wash !text-accent-ink' : ''}`}
            >
              <PanelIcon open={panelOpen} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Full screen takes this whole column, so the controls come along with the scene */}
        <div
          ref={sceneRef}
          className="flex flex-col flex-1 min-w-0 gap-3 [&:fullscreen]:p-3 [&:fullscreen]:bg-[#eef1f6]"
        >
          {view === 'canvas' ? (
            <div className={`glass flex-1 min-h-[16rem] lg:min-h-0 p-1.5 ${MOTION.enterFade}`}>
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
                  replayPolicy={rl?.episode.policy}
                  placementPlan={showPlacement ? placementPlan : null}
                />
                {placementPlan && (
                  <div
                    role="group"
                    aria-label="Baseline placement view"
                    className="absolute top-3 left-3 z-10"
                  >
                    <Segmented
                      size="lg"
                      options={[
                        { value: 'compare', label: 'Before & after' },
                        { value: 'after', label: 'After only' },
                      ]}
                      value={showPlacement ? 'compare' : 'after'}
                      onChange={(value) => setShowPlacement(value === 'compare')}
                    />
                  </div>
                )}
                <div
                  className="absolute top-3 right-3 z-10 flex items-center gap-2"
                  title="Compact view compresses distances for visibility; to-scale view preserves geometry."
                >
                  <Segmented
                    size="lg"
                    options={[
                      { value: 'scale', label: 'To scale' },
                      { value: 'compact', label: 'Compact' },
                    ]}
                    value={sim.compact ? 'compact' : 'scale'}
                    onChange={(value) => sim.setCompact(value === 'compact')}
                  />
                  {fullscreenSupported && (
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      aria-pressed={fullscreen}
                      aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                      title={fullscreen ? 'Exit full screen' : 'Full screen'}
                      className={`${SECONDARY_BUTTON} !w-11 !h-11 !px-0`}
                    >
                      <FullscreenIcon exit={fullscreen} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : view === 'charts' ? (
            <div className={`flex-1 min-h-0 ${MOTION.enterFade}`}>
              <ChartsView
                frames={sim.frames}
                frameIndex={sim.frameIndex}
                selectedLink={selectedLink}
                onSelectLink={selectLink}
                preferredMetric={preferences.metric}
                onMetricChange={onMetricChange}
              />
            </div>
          ) : (
            <div className={`flex-1 min-h-0 overflow-y-auto ${MOTION.enterFade}`}>
              {decisionsView}
            </div>
          )}

          <PlaybackControls
            playing={sim.playing}
            speed={sim.speed}
            frameIndex={sim.frameIndex}
            totalFrames={sim.frames.length}
            currentTime={frame.time}
            duration={sim.frames[sim.frames.length - 1]?.time}
            frameAlphaRef={sim.frameAlphaRef}
            onPlay={sim.play}
            onPause={sim.pause}
            onSeek={onSeek}
            onSetSpeed={onSetSpeed}
          />

          {!isDesktop && (
            <div className="glass flex flex-col min-h-0 max-h-[45dvh] flex-shrink-0">
              <div className="p-3 flex-shrink-0 overflow-x-auto">{tabBar}</div>
              <div
                key={tab}
                className={`flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-2 ${MOTION.enterFade}`}
              >
                {tabContent}
              </div>
            </div>
          )}
        </div>

        {isDesktop && (
          // The panel keeps its width inside a wrapper that slides between 0 and full, so its
          // content never reflows mid-animation; the scene beside it widens smoothly
          <div
            className={`flex-shrink-0 overflow-hidden ${MOTION.panel} ${
              panelOpen ? 'w-[24.75rem] xl:w-[27.75rem] opacity-100' : 'w-0 opacity-0'
            }`}
            aria-hidden={!panelOpen}
            {...({ inert: panelOpen ? undefined : '' } as Record<string, string | undefined>)}
          >
            <aside className="glass ml-3 h-full flex flex-col min-h-0 w-[24rem] xl:w-[27rem]">
              <div className="p-4 flex-shrink-0">{tabBar}</div>
              <div
                key={tab}
                className={`flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-2 ${MOTION.enterFade}`}
              >
                {tabContent}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
