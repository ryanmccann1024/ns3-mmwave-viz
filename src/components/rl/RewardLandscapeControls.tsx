import type {
  ComponentScale,
  LandscapeView,
  RewardLandscape,
  SliceChoice,
} from '../../lib/rewardLandscape'
import { heatColor } from '../../lib/colorScale'
import { componentLabel } from '../../lib/rlLabels'
import { MOTION } from '../../styles/motion'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'

interface Props {
  landscape: RewardLandscape | null
  error: string | null
  choice: SliceChoice | null
  view: LandscapeView | null
  shown: boolean
  onShown: (shown: boolean) => void
  fields: string[]
  field: string
  onField: (field: string) => void
  scale: ComponentScale
  onScale: (scale: ComponentScale) => void
  /** CSV id of the node selected in the scene, if any */
  selectedNode: number | null
  /** the decision the landscape was asked for (playhead or chosen), if known */
  wantedDecision: number | null
}

const LEGEND_STEPS = 7

const fmt = (v: number) =>
  Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)

/** Where the numbers came from, in words */
function sourceLabel(landscape: RewardLandscape): string {
  const { method, seeds } = landscape.source
  if (method === 'synthetic') return 'synthetic demo data'
  const seedText =
    seeds.length === 0
      ? ''
      : seeds.length === 1
        ? ` (seed ${seeds[0]})`
        : ` (mean of ${seeds.length} seeds)`
  if (method === 'channel_query') return `snapshot from simulator channel${seedText}`
  return `${method}${seedText}`
}

/** The overlay card over the 3D scene: show/hide, field picker, stepped legend and caption */
export function RewardLandscapeControls({
  landscape,
  error,
  choice,
  view,
  shown,
  onShown,
  fields,
  field,
  onField,
  scale,
  onScale,
  selectedNode,
  wantedDecision,
}: Props) {
  const toggle = (
    <Button
      variant="ghost"
      active={shown}
      aria-pressed={shown}
      onClick={() => onShown(!shown)}
      title="The reward the selected node would have earned parked at each point, at this decision"
    >
      Reward landscape
    </Button>
  )

  if (!shown || (!landscape && !error)) {
    return <div className="glass-chip p-1.5 inline-flex">{toggle}</div>
  }

  const slice = choice?.slice ?? null
  const domain = view?.domain ?? null
  const swatches = domain
    ? Array.from({ length: LEGEND_STEPS }, (_, i) => {
        const a = domain.lo + ((domain.hi - domain.lo) * i) / LEGEND_STEPS
        const b = domain.lo + ((domain.hi - domain.lo) * (i + 1)) / LEGEND_STEPS
        return { color: heatColor((a + b) / 2, domain), title: `${fmt(a)} to ${fmt(b)}` }
      })
    : []
  const best = view && view.best !== null ? (slice?.moves[view.best] ?? null) : null
  const bestValue = view && view.best !== null ? view.moveValues[view.best] : null

  return (
    <div className={`glass-chip p-3 w-[21rem] max-w-full flex flex-col gap-3 ${MOTION.enterFade}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {toggle}
        {fields.length > 1 && (
          <select
            aria-label="Reward landscape field"
            value={field}
            onChange={(e) => onField(e.target.value)}
            className={`h-7 min-w-0 flex-1 rounded-lg border border-hairline bg-white px-2 text-xs font-medium text-ink ${MOTION.colors} hover:border-accent/40`}
          >
            {fields.map((f) => (
              <option key={f} value={f}>
                {f === 'total' ? 'Total reward' : componentLabel(f)}
              </option>
            ))}
          </select>
        )}
      </div>

      {error ? (
        <div className="text-xs text-ink-2">Reward landscape unavailable: {error}</div>
      ) : (
        <>
          {field !== 'total' && (
            <Segmented
              size="sm"
              options={[
                { value: 'weighted' as const, label: 'As weighted in total' },
                { value: 'raw' as const, label: 'Raw' },
              ]}
              value={scale}
              onChange={onScale}
            />
          )}

          {domain ? (
            <div className="flex flex-col gap-1">
              <div
                className="flex h-2.5 rounded overflow-hidden border border-hairline"
                role="img"
                aria-label={`Colour scale from ${fmt(domain.lo)} to ${fmt(domain.hi)}`}
              >
                {swatches.map((s, i) => (
                  <span
                    key={i}
                    className="flex-1"
                    style={{ background: s.color }}
                    title={s.title}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted">
                <span className="font-mono tabular-nums">{fmt(domain.lo)}</span>
                <span>
                  {domain.hi === domain.lo
                    ? 'same value everywhere'
                    : domain.diverging
                      ? 'red costs · blue earns'
                      : 'darker is higher'}
                </span>
                <span className="font-mono tabular-nums">{fmt(domain.hi)}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-ink-2">No values for this field at this decision.</div>
          )}

          {slice && landscape && (
            <div className="flex flex-col gap-1 text-xs text-ink-2 leading-relaxed">
              {choice?.nodeFallback && selectedNode !== null && (
                <div className="text-ink">
                  Node <span className="font-mono">{selectedNode}</span> is not a controlled node in
                  this file; showing <span className="font-mono">{slice.nodeId}</span>.
                </div>
              )}
              <div>
                Node <span className="font-mono">{slice.nodeId}</span> · decision{' '}
                <span className="font-mono tabular-nums">#{slice.decision}</span>
                {wantedDecision !== null && wantedDecision !== slice.decision && (
                  <>
                    {' '}
                    (playhead at <span className="font-mono tabular-nums">#{wantedDecision}</span>)
                  </>
                )}{' '}
                · {sourceLabel(landscape)}
              </div>
              <div>
                Each point: the reward if this node were parked there, every other node held still.
                Discs: the five reachable moves
                {best && bestValue !== null && (
                  <>
                    , best <span className="font-medium text-ink">{best.label}</span> at{' '}
                    <span className="font-mono tabular-nums">{fmt(bestValue)}</span> (white ring)
                  </>
                )}
                .
                {field === 'total' && slice.recorded?.total != null && (
                  <>
                    {' '}
                    Recorded reward{' '}
                    <span className="font-mono tabular-nums">{fmt(slice.recorded.total)}</span>.
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
