import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import {
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { ComparisonRow, MetricColumn } from '../../lib/missionComparison'
import type { Evaluation } from '../../lib/experimentIndex'
import { BASELINE_MARK_COLOR, phaseColor } from '../../styles/tokens'
import { MOTION } from '../../styles/motion'
import { useEntered, useFlip, useTween } from '../../hooks/useListMotion'
import { AXIS, AXIS_LABEL, GRID } from '../charts/chartStyle'
import { PhasePill } from '../ui/PhasePill'

interface ViewProps {
  rows: ComparisonRow[]
  columns: MetricColumn[]
  /** the metric rows are ranked by */
  metric: MetricColumn
  onMetric: (key: string) => void
  onSelect: (e: Evaluation) => void
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function modeLabel(row: ComparisonRow): string {
  if (row.policy !== 'model') return 'Baseline'
  if (row.mode !== 'Sampling schedule') return row.mode
  return /Sample 60/.test(row.evaluation.label) ? 'Sample 60' : 'Sample on stall'
}

export function formatMetric(v: number | null, c: MetricColumn, precise = false): string {
  if (v == null) return '—'
  if (c.unit === '%') return `${(v * 100).toFixed(precise ? 1 : 0)}%`
  if (c.unit === 'm') return v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${v.toFixed(0)} m`
  return `${v.toFixed(0)} s`
}

const score = (v: number | null, c: MetricColumn) => (v == null ? -Infinity : c.higher ? v : -v)

function ranked(rows: ComparisonRow[], c: MetricColumn): ComparisonRow[] {
  return [...rows].sort((a, b) => score(b.values[c.key], c) - score(a.values[c.key], c))
}

function bestValue(rows: ComparisonRow[], c: MetricColumn): number | null {
  return ranked(rows, c)[0]?.values[c.key] ?? null
}

function scaleMax(rows: ComparisonRow[], c: MetricColumn): number {
  if (c.unit === '%') return 1
  const xs = rows.map((r) => r.values[c.key]).filter((v): v is number => v != null)
  return Math.max(1, ...xs)
}

/** 0 = worst in the column, 1 = best; null when unmeasured or all equal */
function quality(v: number | null, rows: ComparisonRow[], c: MetricColumn): number | null {
  const xs = rows.map((r) => r.values[c.key]).filter((x): x is number => x != null)
  if (v == null || !xs.length) return null
  const lo = Math.min(...xs),
    hi = Math.max(...xs)
  if (hi === lo) return null
  const q = (v - lo) / (hi - lo)
  return c.higher ? q : 1 - q
}

/** Model rows of one reward (phase, reward and base PPO settings), every execution mode */
function rewardGroups(rows: ComparisonRow[], c: MetricColumn): ComparisonRow[][] {
  const groups = new Map<string, ComparisonRow[]>()
  for (const row of rows.filter((r) => r.policy === 'model')) {
    const ppo = (row.evaluation.missionPpoLabel ?? '').split(' · ')[0]
    const key = `${row.phase}:${row.title}:${ppo}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const best = (rs: ComparisonRow[]) => Math.max(...rs.map((r) => score(r.values[c.key], c)))
  return [...groups.values()].sort((a, b) => best(b) - best(a))
}

const selectable = (row: ComparisonRow) => row.policy === 'model' && !row.evaluation.historyOnly
const markColor = (row: ComparisonRow) =>
  row.policy === 'model' ? phaseColor(row.phase) : BASELINE_MARK_COLOR

function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null)
  return {
    show: (event: MouseEvent, body: ReactNode) =>
      setTip({ x: event.clientX, y: event.clientY, body }),
    hide: () => setTip(null),
    node: tip && (
      <div
        className={`glass-chip fixed z-50 pointer-events-none px-3 py-2 text-sm flex flex-col gap-1 max-w-xs ${MOTION.enterFade}`}
        style={{ left: tip.x + 14, top: tip.y + 14 }}
      >
        {tip.body}
      </div>
    ),
  }
}

function TipBody({ row, columns }: { row: ComparisonRow; columns: MetricColumn[] }) {
  return (
    <>
      <span className="font-semibold text-ink">{row.title}</span>
      <span className="text-ink-2">
        {modeLabel(row)}
        {row.policy === 'model' && row.evaluation.missionPpoLabel
          ? ` · ${row.evaluation.missionPpoLabel}`
          : ''}
      </span>
      {columns.map((c) => (
        <span key={c.key} className="flex justify-between gap-4 text-ink-2">
          {c.label}
          <span className="font-mono tabular-nums text-ink">
            {formatMetric(row.values[c.key], c, true)}
          </span>
        </span>
      ))}
      <span className="text-ink-2">Seeds {row.seeds.join(', ')}</span>
    </>
  )
}

/** A metric value that counts to each new number */
function Value({ value, metric }: { value: number | null; metric: MetricColumn }) {
  return <>{formatMetric(useTween(value), metric)}</>
}

function RowLabel({
  row,
  showMode = true,
  truncate = true,
}: {
  row: ComparisonRow
  showMode?: boolean
  truncate?: boolean
}) {
  return (
    <span className={`flex items-center gap-x-2 gap-y-1 min-w-0 ${truncate ? '' : 'flex-wrap'}`}>
      <span
        className={`text-base font-medium text-ink ${truncate ? 'truncate' : 'whitespace-nowrap'}`}
      >
        {row.title}
      </span>
      {row.policy === 'model' ? (
        <PhasePill phase={row.phase} size="sm" />
      ) : (
        <span className="text-xs font-semibold text-ink-2 border border-hairline-strong rounded-full px-2 py-px">
          Baseline
        </span>
      )}
      {showMode && row.policy === 'model' && (
        <span className="text-sm text-ink-2 whitespace-nowrap">{modeLabel(row)}</span>
      )}
    </span>
  )
}

/** Column headings that sort the rows; the sorted one is underlined in accent */
function SortHeader({
  columns,
  metric,
  onMetric,
  grid,
}: Pick<ViewProps, 'columns' | 'metric' | 'onMetric'> & { grid: { gridTemplateColumns: string } }) {
  return (
    <div className="grid items-end gap-1.5 px-2 pb-1" style={grid}>
      <span />
      {columns.map((c) => {
        const active = c.key === metric.key
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={active}
            onClick={() => onMetric(c.key)}
            className={`justify-self-center pb-1 border-b-2 text-sm font-semibold ${MOTION.colors} ${active ? 'text-accent-ink border-accent' : 'text-ink-2 border-transparent hover:text-ink'}`}
          >
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A. Ranked bars: one metric, best first
// ---------------------------------------------------------------------------

function BarRow({
  row,
  rank,
  metric,
  max,
  entered,
  columns,
  tip,
  onSelect,
}: {
  row: ComparisonRow
  rank: number
  metric: MetricColumn
  max: number
  entered: boolean
  columns: MetricColumn[]
  tip: ReturnType<typeof useTip>
  onSelect: (e: Evaluation) => void
}) {
  const v = row.values[metric.key]
  const width = !entered || v == null ? 0 : Math.max(1, (v / max) * 100)
  return (
    <li data-flip={row.id}>
      <button
        type="button"
        disabled={!selectable(row)}
        onClick={() => onSelect(row.evaluation)}
        onMouseMove={(e) => tip.show(e, <TipBody row={row} columns={columns} />)}
        onMouseLeave={tip.hide}
        className={`group w-full h-12 grid grid-cols-[1.5rem_minmax(0,24rem)_minmax(0,1fr)_5rem] items-center gap-4 px-2 rounded-lg text-left enabled:hover:bg-white/70 disabled:cursor-default ${MOTION.surface}`}
      >
        <span className="text-sm font-mono tabular-nums text-ink-2 text-right">{rank}</span>
        <RowLabel row={row} />
        <span className="h-3.5 rounded-full bg-ink/[0.05] overflow-hidden">
          <span
            className={`block h-full rounded-full ${MOTION.grow} group-hover:brightness-110`}
            style={{
              width: `${width}%`,
              backgroundColor: markColor(row),
              transitionDelay: entered ? undefined : `${rank * 25}ms`,
            }}
          />
        </span>
        <span className="text-base font-semibold font-mono tabular-nums text-ink text-right">
          <Value value={v} metric={metric} />
        </span>
      </button>
    </li>
  )
}

export function RankedBars({ rows, columns, metric, onSelect }: ViewProps) {
  const tip = useTip()
  const list = useRef<HTMLOListElement>(null)
  useFlip(list)
  const entered = useEntered()
  const max = scaleMax(rows, metric)
  return (
    <ol ref={list} className="relative flex flex-col">
      {ranked(rows, metric).map((row, i) => (
        <BarRow
          key={row.id}
          row={row}
          rank={i + 1}
          metric={metric}
          max={max}
          entered={entered}
          columns={columns}
          tip={tip}
          onSelect={onSelect}
        />
      ))}
      {tip.node}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// B. Scorecard: every metric, darker = better within the column
// ---------------------------------------------------------------------------

const SCORE_STEPS = [
  { bg: '#eef3fd', ink: '#0a1324' },
  { bg: '#c9daf9', ink: '#0a1324' },
  { bg: '#8fb2f2', ink: '#0a1324' },
  { bg: '#4a82e6', ink: '#ffffff' },
  { bg: '#1a4fb8', ink: '#ffffff' },
]
const scoreStep = (q: number) => SCORE_STEPS[Math.min(4, Math.floor(q * 5))]

function ScoreLegend({ steps }: { steps: { bg: string }[] }) {
  return (
    <div className="flex items-center gap-2 self-end px-2 pt-3 text-sm text-ink-2">
      Worse
      {steps.map((s) => (
        <span key={s.bg} className="w-6 h-3 rounded-sm" style={{ backgroundColor: s.bg }} />
      ))}
      Better
    </div>
  )
}

export function Scorecard({ rows, columns, metric, onMetric, onSelect }: ViewProps) {
  const tip = useTip()
  const list = useRef<HTMLDivElement>(null)
  useFlip(list)
  const models = ranked(
      rows.filter((r) => r.policy === 'model'),
      metric
    ),
    baselines = ranked(
      rows.filter((r) => r.policy !== 'model'),
      metric
    )
  const grid = {
    gridTemplateColumns: `minmax(22rem, 1.8fr) repeat(${columns.length}, minmax(6.5rem, 1fr))`,
  }
  const line = (row: ComparisonRow) => (
    <button
      key={row.id}
      data-flip={row.id}
      type="button"
      disabled={!selectable(row)}
      onClick={() => onSelect(row.evaluation)}
      onMouseMove={(e) => tip.show(e, <TipBody row={row} columns={columns} />)}
      onMouseLeave={tip.hide}
      className={`grid items-center gap-1.5 px-2 py-0.5 rounded-lg text-left enabled:hover:bg-white/70 disabled:cursor-default ${MOTION.surface}`}
      style={grid}
    >
      <RowLabel row={row} truncate={false} />
      {columns.map((c) => {
        const v = row.values[c.key],
          q = quality(v, rows, c),
          step = q == null ? null : scoreStep(q)
        return (
          <span
            key={c.key}
            className={`h-10 rounded-md flex items-center justify-center text-base font-mono tabular-nums ${MOTION.colors} ${step ? '' : 'text-ink-2 bg-ink/[0.03]'} ${q === 1 ? 'font-bold' : 'font-medium'}`}
            style={step ? { backgroundColor: step.bg, color: step.ink } : undefined}
          >
            <Value value={v} metric={c} />
          </span>
        )
      })}
    </button>
  )
  return (
    <div className="flex flex-col gap-1 overflow-x-auto">
      <SortHeader columns={columns} metric={metric} onMetric={onMetric} grid={grid} />
      <div ref={list} className="relative flex flex-col gap-1">
        {models.map(line)}
        {baselines.length > 0 && <div className="mx-2 my-2 border-t border-hairline" />}
        {baselines.map(line)}
      </div>
      <ScoreLegend steps={SCORE_STEPS} />
      {tip.node}
    </div>
  )
}

// ---------------------------------------------------------------------------
// C. Dot plot: one row per reward, one marker per execution mode
// ---------------------------------------------------------------------------

const MODE_SHAPES: Record<string, string> = {
  Deterministic: 'circle',
  Sampled: 'diamond',
  Online: 'square',
  'Sample 60': 'triangle',
  'Sample on stall': 'triangle-down',
  Baseline: 'plus',
}
const shapeOf = (row: ComparisonRow) => MODE_SHAPES[modeLabel(row)] ?? 'circle'

/** A mode marker drawn in a size × size box at the origin */
function ShapeMark({ shape, color, size }: { shape: string; color: string; size: number }) {
  const s = size,
    h = s / 2
  const common = { fill: color, stroke: '#ffffff', strokeWidth: 2 }
  return shape === 'diamond' ? (
    <polygon points={`${h},1 ${s - 1},${h} ${h},${s - 1} 1,${h}`} {...common} />
  ) : shape === 'square' ? (
    <rect x={2} y={2} width={s - 4} height={s - 4} rx={2} {...common} />
  ) : shape === 'triangle' ? (
    <polygon points={`${h},1 ${s - 1},${s - 2} 1,${s - 2}`} {...common} />
  ) : shape === 'triangle-down' ? (
    <polygon points={`1,2 ${s - 1},2 ${h},${s - 1}`} {...common} />
  ) : shape === 'plus' ? (
    <g stroke={color} strokeWidth={3} strokeLinecap="round">
      <line x1={2} x2={s - 2} y1={h} y2={h} />
      <line x1={h} x2={h} y1={2} y2={s - 2} />
    </g>
  ) : (
    <circle cx={h} cy={h} r={h - 1.5} {...common} />
  )
}

function Shape({ shape, color, size = 16 }: { shape: string; color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block overflow-visible"
    >
      <ShapeMark shape={shape} color={color} size={size} />
    </svg>
  )
}

function ModeLegend({ rows, baseline }: { rows: ComparisonRow[]; baseline?: ReactNode }) {
  const modes = [...new Set(rows.filter((r) => r.policy === 'model').map(modeLabel))]
  return (
    <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-base text-ink-2">
      {modes.map((m) => (
        <span key={m} className="flex items-center gap-2">
          <Shape shape={MODE_SHAPES[m] ?? 'circle'} color="#37455e" size={14} />
          {m}
        </span>
      ))}
      {baseline}
    </div>
  )
}

const BaselineKey = (
  <span className="flex items-center gap-2">
    <span className="h-4 border-l-2 border-dashed" style={{ borderColor: BASELINE_MARK_COLOR }} />
    Baseline
  </span>
)

/** A marker placed along a track; it glides when its value changes */
function Marker({
  row,
  left,
  size,
  columns,
  tip,
  onSelect,
  label,
}: {
  row: ComparisonRow
  left: string
  size: number
  columns: MetricColumn[]
  tip: ReturnType<typeof useTip>
  onSelect: (e: Evaluation) => void
  label: string
}) {
  return (
    <button
      type="button"
      disabled={!selectable(row)}
      onClick={() => onSelect(row.evaluation)}
      onMouseMove={(e) => tip.show(e, <TipBody row={row} columns={columns} />)}
      onMouseLeave={tip.hide}
      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-1 disabled:cursor-default ${MOTION.glide} hover:z-10`}
      style={{ left }}
      aria-label={label}
    >
      <span className={`block ${MOTION.lift} hover:scale-125`}>
        <Shape shape={shapeOf(row)} color={markColor(row)} size={size} />
      </span>
    </button>
  )
}

export function DotPlot({ rows, columns, metric, onSelect }: ViewProps) {
  const tip = useTip()
  const list = useRef<HTMLDivElement>(null)
  useFlip(list)
  const max = scaleMax(rows, metric)
  const ordered = rewardGroups(rows, metric)
  const baselines = ranked(
    rows.filter((r) => r.policy !== 'model'),
    metric
  )
  const pct = (v: number) => `${(v / max) * 100}%`
  const grid = 'grid grid-cols-[minmax(0,20rem)_minmax(0,1fr)_4rem] gap-x-4'
  return (
    <div className="flex flex-col gap-3">
      <ModeLegend rows={rows} baseline={BaselineKey} />
      <div className={grid}>
        <span />
        <div className="relative h-14">
          {baselines.map((b, i) => {
            const v = b.values[metric.key]
            if (v == null) return null
            return (
              <span
                key={b.id}
                className={`absolute text-sm text-ink-2 whitespace-nowrap -translate-x-1/2 ${MOTION.glide}`}
                style={{ left: pct(v), top: (i % 2) * 24 }}
              >
                {b.title} {formatMetric(v, metric)}
              </span>
            )
          })}
        </div>
        <span />
      </div>
      <div ref={list} className="relative flex flex-col">
        {ordered.map((group) => {
          const head = group[0]
          return (
            <div key={head.id} data-flip={head.id} className={grid}>
              <span className="h-11 flex items-center">
                <RowLabel row={head} showMode={false} />
              </span>
              <div className="relative h-11">
                <span className="absolute inset-x-0 top-1/2 h-px bg-hairline-strong" />
                {baselines.map((b) =>
                  b.values[metric.key] == null ? null : (
                    <span
                      key={b.id}
                      className={`absolute -top-1 -bottom-1 border-l-2 border-dashed ${MOTION.glide}`}
                      style={{ left: pct(b.values[metric.key]!), borderColor: BASELINE_MARK_COLOR }}
                    />
                  )
                )}
                {group.map((row) => {
                  const v = row.values[metric.key]
                  if (v == null) return null
                  return (
                    <Marker
                      key={row.id}
                      row={row}
                      left={pct(v)}
                      size={18}
                      columns={columns}
                      tip={tip}
                      onSelect={onSelect}
                      label={`${row.title} ${modeLabel(row)} ${formatMetric(v, metric)}`}
                    />
                  )
                })}
              </div>
              <span className="h-11 flex items-center justify-end text-base font-semibold font-mono tabular-nums text-ink">
                <Value value={bestValue(group, metric)} metric={metric} />
              </span>
            </div>
          )
        })}
      </div>
      <div className={grid}>
        <span />
        <div className="flex justify-between pt-2 text-sm font-mono tabular-nums text-ink-2">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span key={f}>{formatMetric(f * max, metric)}</span>
          ))}
        </div>
        <span />
      </div>
      {tip.node}
    </div>
  )
}

// ---------------------------------------------------------------------------
// E. Overview: one row per reward, every metric; each cell is shaded by the reward's
// best mode (scorecard), shows that best value, and a mini track with every mode and
// the baselines (dot plot)
// ---------------------------------------------------------------------------

const OVERVIEW_STEPS = [
  { bg: '#f3f6fd' },
  { bg: '#e2eafb' },
  { bg: '#cfdcf8' },
  { bg: '#b9cdf6' },
  { bg: '#a2bdf3' },
]

export function Overview({ rows, columns, metric, onMetric, onSelect }: ViewProps) {
  const tip = useTip()
  const list = useRef<HTMLDivElement>(null)
  useFlip(list)
  const groups = rewardGroups(rows, metric)
  const baselines = ranked(
    rows.filter((r) => r.policy !== 'model'),
    metric
  )
  // shade against every reward's best and every baseline, so cells compare like for like
  const field = (c: MetricColumn) => [...groups.map((g) => ranked(g, c)[0]), ...baselines]
  const grid = {
    gridTemplateColumns: `minmax(15rem, 1.2fr) repeat(${columns.length}, minmax(8rem, 1fr))`,
  }
  const line = (key: string, label: ReactNode, members: ComparisonRow[]) => (
    <div key={key} data-flip={key} className="grid items-center gap-1.5 px-2 py-0.5" style={grid}>
      {label}
      {columns.map((c) => {
        const best = bestValue(members, c),
          q = quality(best, field(c), c),
          step = q == null ? null : OVERVIEW_STEPS[Math.min(4, Math.floor(q * 5))],
          max = scaleMax(rows, c)
        return (
          <div
            key={c.key}
            className={`h-16 rounded-md px-3 py-1.5 flex flex-col justify-center gap-1 ${MOTION.colors} ${step ? '' : 'bg-ink/[0.03]'}`}
            style={step ? { backgroundColor: step.bg } : undefined}
          >
            <span
              className={`text-base font-mono tabular-nums text-ink ${q === 1 ? 'font-bold' : 'font-medium'}`}
            >
              <Value value={best} metric={c} />
            </span>
            <div className="relative h-4">
              <span className="absolute inset-x-0 top-1/2 h-px bg-ink/15" />
              {baselines.map((b) =>
                b.values[c.key] == null || members.includes(b) ? null : (
                  <span
                    key={b.id}
                    className={`absolute top-0 bottom-0 w-px ${MOTION.glide}`}
                    style={{
                      left: `${(b.values[c.key]! / max) * 100}%`,
                      backgroundColor: BASELINE_MARK_COLOR,
                    }}
                  />
                )
              )}
              {members.map((row) =>
                row.values[c.key] == null ? null : (
                  <Marker
                    key={row.id}
                    row={row}
                    left={`${(row.values[c.key]! / max) * 100}%`}
                    size={12}
                    columns={columns}
                    tip={tip}
                    onSelect={onSelect}
                    label={`${row.title} ${modeLabel(row)} ${c.label} ${formatMetric(row.values[c.key], c)}`}
                  />
                )
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <ModeLegend
        rows={rows}
        baseline={
          <span className="flex items-center gap-2">
            <Shape shape="plus" color={BASELINE_MARK_COLOR} size={14} />
            Baseline
          </span>
        }
      />
      <div className="flex flex-col gap-1">
        <SortHeader columns={columns} metric={metric} onMetric={onMetric} grid={grid} />
        <div ref={list} className="relative flex flex-col gap-1">
          {groups.map((g) =>
            line(g[0].id, <RowLabel row={g[0]} showMode={false} truncate={false} />, g)
          )}
          {baselines.length > 0 && <div className="mx-2 my-2 border-t border-hairline" />}
          {baselines.map((b) => line(b.id, <RowLabel row={b} truncate={false} />, [b]))}
        </div>
      </div>
      <ScoreLegend steps={OVERVIEW_STEPS} />
      {tip.node}
    </div>
  )
}

// ---------------------------------------------------------------------------
// D. Trade-off: outcome against travel
// ---------------------------------------------------------------------------

export function TradeOff({ rows, columns, metric, onSelect }: ViewProps) {
  const travel = columns.find((c) => c.key === 'travel_m_total')
  if (!travel) return null
  const points = rows
    .filter((r) => r.values[metric.key] != null && r.values[travel.key] != null)
    .map((r) => ({
      row: r,
      x: r.values[travel.key]! / 1000,
      y: metric.unit === '%' ? r.values[metric.key]! * 100 : r.values[metric.key]!,
      color: r.policy === 'model' ? phaseColor(r.phase) : BASELINE_MARK_COLOR,
      name: r.policy === 'model' ? '' : r.title,
    }))
  const models = points.filter((p) => p.row.policy === 'model'),
    baselines = points.filter((p) => p.row.policy !== 'model')
  return (
    <div className="flex flex-col gap-3">
      <ModeLegend rows={rows} />
      <div className="h-[28rem]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 24, bottom: 28, left: 8 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="x"
              {...AXIS}
              tickFormatter={(v: number) => `${v.toFixed(1)}`}
              label={{
                value: 'Total travel (km), less is cheaper',
                position: 'bottom',
                offset: 8,
                ...AXIS_LABEL,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              {...AXIS}
              domain={metric.unit === '%' ? [0, 100] : ['auto', 'auto']}
              reversed={!metric.higher}
              width={64}
              tickFormatter={(v: number) => (metric.unit === '%' ? `${v}%` : `${v}`)}
              label={{ value: metric.label, angle: -90, position: 'insideLeft', ...AXIS_LABEL }}
            />
            <ZAxis range={[160, 160]} />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const p = active
                  ? (payload?.[0]?.payload as (typeof points)[number] | undefined)
                  : undefined
                if (!p) return null
                return (
                  <div className="glass-chip px-3 py-2 text-sm flex flex-col gap-1">
                    <TipBody row={p.row} columns={columns} />
                  </div>
                )
              }}
            />
            <Scatter
              data={models}
              shape={(props: { cx?: number; cy?: number; payload?: (typeof points)[number] }) => (
                <g
                  transform={`translate(${(props.cx ?? 0) - 9} ${(props.cy ?? 0) - 9})`}
                  style={{
                    cursor: props.payload && selectable(props.payload.row) ? 'pointer' : 'default',
                  }}
                >
                  <ShapeMark
                    shape={
                      props.payload
                        ? (MODE_SHAPES[modeLabel(props.payload.row)] ?? 'circle')
                        : 'circle'
                    }
                    color={props.payload?.color ?? BASELINE_MARK_COLOR}
                    size={18}
                  />
                </g>
              )}
              onClick={(p: { payload?: (typeof points)[number] }) => {
                if (p.payload && selectable(p.payload.row)) onSelect(p.payload.row.evaluation)
              }}
            />
            <Scatter
              data={baselines}
              shape={(props: { cx?: number; cy?: number }) => (
                <g stroke={BASELINE_MARK_COLOR} strokeWidth={3} strokeLinecap="round">
                  <line
                    x1={(props.cx ?? 0) - 7}
                    x2={(props.cx ?? 0) + 7}
                    y1={props.cy}
                    y2={props.cy}
                  />
                  <line
                    x1={props.cx}
                    x2={props.cx}
                    y1={(props.cy ?? 0) - 7}
                    y2={(props.cy ?? 0) + 7}
                  />
                </g>
              )}
            >
              <LabelList
                dataKey="name"
                position="right"
                offset={10}
                style={{ fontSize: 13, fill: '#37455e' }}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
