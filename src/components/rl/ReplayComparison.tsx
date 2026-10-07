import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import type { Episode, Evaluation } from '../../lib/experimentIndex'
import type { ResultCatalog } from '../../lib/resultCatalog'
import type { SimFrame, SimMeta, BuildingState, JammerState } from '../../types'
import type { SceneBounds } from '../../hooks/useSimData'
import { readTrails } from '../../hooks/useExperimentSession'
import { parseFiles, parseMeta, parseBuildings } from '../../lib/parseSimFiles'
import { parseJammers } from '../../lib/jammers'
import { frameIndexAtTime } from '../../lib/frameSeek'
import { replayChoices, type ReplayChoice } from '../../lib/replayComparison'
import { NetworkCanvas } from '../canvas/NetworkCanvas'
import type { Trail } from '../canvas/TrajectoryLayer'
import { Button } from '../ui/Button'
import { trailColor } from '../../styles/tokens'
import { policyLabel } from '../../lib/rlLabels'
import { MOTION } from '../../styles/motion'

type ReplayData = {
  frames: SimFrame[]
  meta: SimMeta
  buildings: BuildingState[]
  jammers: JammerState[]
  trails: Trail[]
}

const percent = (value: number) => `${(100 * value).toFixed(1)}%`

function Dot({ policy }: { policy: string }) {
  return (
    <span
      aria-hidden="true"
      className="w-3 h-3 rounded-full flex-shrink-0"
      style={{ backgroundColor: trailColor(policy) }}
    />
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-shrink-0 text-right">
      <div className="text-2xl xl:text-3xl font-semibold tabular-nums tracking-tight text-ink-title truncate">
        {value}
      </div>
      <div className="text-sm font-medium text-ink-2">{label}</div>
    </div>
  )
}

function ReplayPanel({
  catalog,
  evaluation,
  choice,
  time,
  nextTime,
  alpha,
  bounds,
  dimensions,
  action,
}: {
  catalog: ResultCatalog
  evaluation: Evaluation | undefined
  choice: ReplayChoice
  time: number
  nextTime: number | null
  alpha: MutableRefObject<number>
  bounds: SceneBounds
  dimensions: 2 | 3
  /** a control beside the title, such as the button that swaps this replay */
  action?: ReactNode
}) {
  const [loaded, setLoaded] = useState<{ key: string; data?: ReplayData; error?: string } | null>(
    null
  )
  const [node, setNode] = useState<number | null>(null)
  const [link, setLink] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const f = choice.episode.files
    const paths = [f.links, f.positions, f.flows, f.routes, f.nodesJson, f.buildings, f.jammersJson]
    Promise.all([
      Promise.all(
        paths.map(async (path) => {
          if (!path) return null
          const file = await catalog.getFile(path)
          if (!file) throw new Error(`Missing ${path}`)
          return file.text()
        })
      ),
      // A missing path only costs the trail, never the replay
      evaluation ? readTrails(catalog, evaluation, choice.episode) : null,
    ])
      .then(([texts, trailEntry]) => {
        const [
          linksText,
          posText,
          flowsText,
          routesText,
          nodesJsonText,
          buildingsText,
          jammersText,
        ] = texts
        if (!linksText || !posText) throw new Error('Replay positions or links are unavailable')
        const data: ReplayData = {
          frames: parseFiles({
            linksText,
            posText,
            flowsText: flowsText ?? undefined,
            routesText: routesText ?? undefined,
            nodesJsonText: nodesJsonText ?? undefined,
          }),
          meta: parseMeta(posText),
          buildings: buildingsText ? parseBuildings(buildingsText) : [],
          jammers: jammersText ? parseJammers(jammersText) : [],
          trails: trailEntry?.trails ?? [],
        }
        if (!cancelled) setLoaded({ key: choice.key, data })
      })
      .catch((error) => {
        if (!cancelled) setLoaded({ key: choice.key, error: String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [catalog, evaluation, choice.key, choice.episode])
  const data = loaded?.key === choice.key ? loaded.data : undefined
  const times = useMemo(() => data?.frames.map((f) => f.time) ?? [], [data])
  const index = frameIndexAtTime(times, time, 1e-6)
  const frame = index === null ? null : data?.frames[index]
  const nextIndex = nextTime === null ? null : frameIndexAtTime(times, nextTime, 1e-6)
  const next = nextIndex === null ? null : (data?.frames[nextIndex] ?? null)
  const episodeMean = choice.episode.metrics?.delivery_ratio ?? null
  const travel = choice.episode.metrics?.travel_m_total ?? null
  const policy = choice.episode.policy
  return (
    <section
      className={`glass p-1.5 flex flex-col min-h-0 min-w-0 ${MOTION.enter}`}
      aria-label={choice.label}
    >
      <div className="relative z-10 px-4 pt-3 pb-4 flex items-center gap-7">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Dot policy={policy} />
          <h3 className="text-xl font-semibold tracking-tight text-ink-title truncate">
            {choice.label}
          </h3>
          {action}
        </div>
        <Figure value={episodeMean === null ? '–' : percent(episodeMean)} label="Delivery" />
        <Figure
          value={travel === null ? '–' : `${Math.round(travel).toLocaleString()} m`}
          label="Travel"
        />
      </div>
      <div className="relative isolate flex-1 min-h-0 rounded-xl overflow-hidden">
        {frame && data ? (
          <div className={`absolute inset-0 ${MOTION.enterFade}`}>
            <NetworkCanvas
              frame={frame}
              nextFrame={next}
              frameAlphaRef={alpha}
              buildings={data.buildings}
              jammers={data.jammers}
              meta={data.meta}
              sceneBounds={bounds}
              dimensions={dimensions}
              selectedNode={node}
              selectedLink={link}
              selectedFlow={null}
              onSelectNode={setNode}
              onSelectLink={setLink}
              trails={data.trails}
              replayPolicy={policy}
            />
          </div>
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center p-6 text-center bg-ink/[0.03]"
            role="status"
          >
            <span
              className={`text-base font-medium text-ink-2 ${loaded?.error ? '' : 'animate-pulse-soft'}`}
            >
              {loaded?.key === choice.key && loaded.error
                ? loaded.error
                : data
                  ? `No frame at ${time.toFixed(1)} s`
                  : 'Loading'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

/** "Change" beside the title opens a short list of the other replays; picking one swaps it in */
function ChoiceMenu({
  choices,
  value,
  onChange,
}: {
  choices: ReplayChoice[]
  value: string
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !ref.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div ref={ref} className="relative flex-shrink-0 ml-1">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-pressed={open}>
        Change
      </Button>
      {open && (
        <div
          className={`absolute left-0 top-full mt-2 w-64 flex flex-col rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-y divide-hairline ${MOTION.enter}`}
          role="menu"
        >
          {choices.map((choice) => {
            const on = choice.key === value
            return (
              <button
                key={choice.key}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onChange(choice.key)
                  setOpen(false)
                }}
                className={`h-11 px-4 flex items-center gap-2.5 text-left text-base truncate ${MOTION.colors} ${
                  on
                    ? 'bg-accent-wash text-accent-ink font-semibold'
                    : 'text-ink font-medium hover:bg-accent-wash/60'
                }`}
              >
                <Dot policy={choice.episode.policy} />
                {choice.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ReplayComparison({
  catalog,
  evaluations,
  current,
  time,
  nextTime,
  alpha,
  dimensions,
}: {
  catalog: ResultCatalog
  evaluations: Evaluation[]
  current: Episode
  time: number
  nextTime: number | null
  alpha: MutableRefObject<number>
  dimensions: 2 | 3
}) {
  const choices = useMemo(() => replayChoices(evaluations, current), [evaluations, current])
  // The replay being played stays on the left; one other sits beside it
  const mine = choices.find((c) => c.key === current.dir) ?? {
    key: current.dir,
    label: policyLabel(current.policy),
    episode: current,
  }
  const others = choices.filter((c) => c.key !== mine.key)
  const [picked, setPicked] = useState<string | null>(null)
  const other =
    others.find((c) => c.key === picked) ??
    others.find((c) => c.episode.policy === 'model') ??
    others[0]
  const contract = evaluations.find((e) => e.key === current.evaluationKey)?.contract
  const bounds = useMemo<SceneBounds>(() => {
    const b = contract?.bounds
    const xmin = b?.x_min ?? 0,
      xmax = b?.x_max ?? 400,
      ymin = b?.y_min ?? 0,
      ymax = b?.y_max ?? 400
    const span = Math.max(xmax - xmin, ymax - ymin)
    const gridSize = Math.max(500, Math.ceil((span * 1.3) / 50) * 50)
    return {
      cx: (xmin + xmax) / 2,
      cy: (ymin + ymax) / 2,
      gridSize,
      planeSize: gridSize * 1.2,
      viewSpan: span * 1.6,
    }
  }, [contract])
  const panel = (choice: ReplayChoice, action?: ReactNode) => (
    <ReplayPanel
      key={choice.key}
      catalog={catalog}
      evaluation={evaluations.find((e) => e.key === choice.episode.evaluationKey)}
      choice={choice}
      time={time}
      nextTime={nextTime}
      alpha={alpha}
      bounds={bounds}
      dimensions={dimensions}
      action={action}
    />
  )
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex-1 min-h-0 overflow-y-auto p-0.5 grid grid-cols-1 gap-3 auto-rows-[minmax(24rem,1fr)] md:grid-cols-2 md:auto-rows-fr md:overflow-visible">
        {panel(mine)}
        {other ? (
          panel(
            other,
            others.length > 1 && (
              <ChoiceMenu choices={others} value={other.key} onChange={setPicked} />
            )
          )
        ) : (
          <div className="glass flex items-center justify-center">
            <p className="text-lg font-medium text-ink-2">No other replay on this seed</p>
          </div>
        )}
      </div>
    </div>
  )
}
