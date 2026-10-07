import { useState, type ReactNode } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { shortNumber } from '../../lib/format'
import type { DecisionBandPoint, RollingPoint } from '../../lib/rlStats'
import type { EvalCheckpoint } from '../../lib/trainingRun'
import { actionColor, componentColor, trailColor } from '../../styles/tokens'
import { policyLabel } from '../../lib/rlLabels'

import { AXIS, AXIS_LABEL, GRID } from './chartStyle'

/** delivery_ratio -> Delivery ratio, for legends */
const words = (key: string) => {
  const s = key
    .replace(/_+/g, ' ')
    .trim()
    .replace(/\b(sinr|snr|los|nlos|mcs)\b/gi, (w) => w.toUpperCase())
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Round ticks across [min, max] (1, 2 or 5 times a power of ten), always including 0 */
function niceTicks(min: number, max: number): number[] {
  const raw = (max - min || 1) / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
  const ticks: number[] = []
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    ticks.push(Number(t.toPrecision(12)))
  }
  return ticks
}

/** Axis ticks: at most two decimals, no trailing zeros, thousands separated */
const tickNumber = (v: number) =>
  Number.isFinite(v) ? Number(v.toFixed(Math.abs(v) >= 100 ? 0 : 2)).toLocaleString() : ''

export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  height = 'h-64',
}: {
  title: string
  /** one plain sentence on what the chart shows */
  subtitle?: ReactNode
  legend?: { label: string; color: string; dashed?: boolean; band?: boolean }[]
  children: ReactNode
  height?: string
}) {
  return (
    <section className="glass p-6 flex flex-col gap-4 min-w-0">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xl font-semibold tracking-tight text-ink-title">{title}</h3>
        {subtitle && <p className="text-base text-ink-2 leading-relaxed">{subtitle}</p>}
      </div>
      {legend && legend.length > 0 && <Legend items={legend} />}
      <div className={height}>{children}</div>
    </section>
  )
}

export function Legend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean; band?: boolean }[]
}) {
  return (
    <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
      {items.map((l) => (
        <span key={l.label} className="flex items-center gap-2 text-base text-ink-2">
          {l.band ? (
            <span
              className="w-4 h-3 rounded-sm"
              style={{ backgroundColor: l.color, opacity: 0.25 }}
            />
          ) : l.dashed ? (
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: l.color }} />
          ) : (
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
          )}
          {l.label}
        </span>
      ))}
    </div>
  )
}

function TooltipBox({ children }: { children: ReactNode }) {
  return <div className="glass-chip px-3 py-2 text-sm flex flex-col gap-1">{children}</div>
}

function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-2">
      {color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
      {label} <span className="ml-auto pl-3 font-mono tabular-nums text-ink">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Learning curve: every training episode's return, a rolling mean, and its spread
// ---------------------------------------------------------------------------

export function LearningCurveChart({ points, window }: { points: RollingPoint[]; window: number }) {
  const color = trailColor('model')
  return (
    <ChartCard
      title="Reward per training episode"
      subtitle={`Each dot is one episode. The line is a ${window}-episode rolling mean, shaded ±1 standard deviation.`}
      legend={[
        { label: 'Episode return', color },
        { label: 'Spread', color, band: true },
      ]}
      height="h-72"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 16, left: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            {...AXIS}
            label={{
              value: 'Training episode',
              position: 'insideBottom',
              offset: -8,
              ...AXIS_LABEL,
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={60}
            domain={['auto', 'auto']}
            tickFormatter={tickNumber}
          />
          <Tooltip
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as RollingPoint | undefined) : undefined
              if (!p) return null
              return (
                <TooltipBox>
                  <div className="font-medium text-ink">Episode {p.x}</div>
                  <TipRow color={color} label="Return" value={shortNumber(p.value)} />
                  <TipRow label="Rolling mean" value={shortNumber(p.mean)} />
                  <TipRow
                    label="±1 SD"
                    value={`${shortNumber(p.band[0])} to ${shortNumber(p.band[1])}`}
                  />
                </TooltipBox>
              )
            }}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill={color}
            fillOpacity={0.14}
            isAnimationActive={false}
          />
          <Scatter dataKey="value" fill={color} fillOpacity={0.35} isAnimationActive={false} />
          <Line
            dataKey="mean"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
// Periodic evaluations during training (evaluations.npz)
// ---------------------------------------------------------------------------

export function CheckpointChart({
  checkpoints,
  evalSeed,
}: {
  checkpoints: EvalCheckpoint[]
  evalSeed: number | null
}) {
  const color = trailColor('model')
  const data = checkpoints.map((c) => {
    const mean = c.returns.reduce((a, b) => a + b, 0) / (c.returns.length || 1)
    return {
      t: c.timesteps,
      mean,
      range: [Math.min(...c.returns), Math.max(...c.returns)] as [number, number],
      n: c.returns.length,
    }
  })
  return (
    <ChartCard
      title="Checkpoint tests on the model-selection seed"
      subtitle={`At each checkpoint the current policy is tested${evalSeed !== null ? ` on seed ${evalSeed}` : ''}; the best one is saved. Shading spans the tested episodes.`}
      legend={[{ label: 'Mean return', color }]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 16, left: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            {...AXIS}
            label={{
              value: 'Timesteps',
              position: 'insideBottom',
              offset: -8,
              ...AXIS_LABEL,
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={60}
            domain={['auto', 'auto']}
            tickFormatter={tickNumber}
          />
          <Tooltip
            content={({ active, payload }) => {
              const p = active
                ? (payload?.[0]?.payload as (typeof data)[number] | undefined)
                : undefined
              if (!p) return null
              return (
                <TooltipBox>
                  <div className="font-medium text-ink">{p.t} timesteps</div>
                  <TipRow color={color} label="Mean return" value={shortNumber(p.mean)} />
                  <TipRow
                    label={`Range (${p.n} episodes)`}
                    value={`${shortNumber(p.range[0])} to ${shortNumber(p.range[1])}`}
                  />
                </TooltipBox>
              )
            }}
          />
          <Area
            dataKey="range"
            stroke="none"
            fill={color}
            fillOpacity={0.14}
            isAnimationActive={false}
          />
          <Line
            dataKey="mean"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
// Reward components over training
// ---------------------------------------------------------------------------

export function ComponentTrendChart({
  data,
  components,
  window,
}: {
  data: Record<string, number>[]
  components: string[]
  window: number
}) {
  return (
    <ChartCard
      title="What the reward was made of, over training"
      subtitle={`Each component's episode total, ${window}-episode rolling mean.`}
      legend={components.map((c, i) => ({ label: words(c), color: componentColor(i) }))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 16, left: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            {...AXIS}
            label={{
              value: 'Training episode',
              position: 'insideBottom',
              offset: -8,
              ...AXIS_LABEL,
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={60}
            domain={['auto', 'auto']}
            tickFormatter={tickNumber}
          />
          <Tooltip
            content={({ active, payload }) => {
              const p = active
                ? (payload?.[0]?.payload as Record<string, number> | undefined)
                : undefined
              if (!p) return null
              return (
                <TooltipBox>
                  <div className="font-medium text-ink">Episode {p.x}</div>
                  {components.map((c, i) => (
                    <TipRow key={c} color={componentColor(i)} label={c} value={shortNumber(p[c])} />
                  ))}
                </TooltipBox>
              )
            }}
          />
          {components.map((c, i) => (
            <Line
              key={c}
              dataKey={c}
              stroke={componentColor(i)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
// Evaluation: reward at each decision, per policy, shaded across seeds
// ---------------------------------------------------------------------------

export function RewardByDecisionChart({
  series,
}: {
  series: { policy: string; points: DecisionBandPoint[] }[]
}) {
  const decisions = [...new Set(series.flatMap((s) => s.points.map((p) => p.decision)))].sort(
    (a, b) => a - b
  )
  const data = decisions.map((d) => {
    const row: Record<string, unknown> = { decision: d }
    for (const s of series) {
      const p = s.points.find((q) => q.decision === d)
      if (p) {
        row[`${s.policy}:mean`] = p.mean
        row[`${s.policy}:range`] = p.range
        row[`${s.policy}:n`] = p.seeds
      }
    }
    return row
  })
  return (
    <ChartCard
      title="Reward through one evaluation episode"
      legend={series.map((s) => ({ label: policyLabel(s.policy), color: trailColor(s.policy) }))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 16, left: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="decision"
            type="number"
            domain={['dataMin', 'dataMax']}
            {...AXIS}
            allowDecimals={false}
            label={{
              value: 'Decision',
              position: 'insideBottom',
              offset: -8,
              ...AXIS_LABEL,
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={60}
            domain={['auto', 'auto']}
            tickFormatter={tickNumber}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as Record<string, unknown>
              return (
                <TooltipBox>
                  <div className="font-medium text-ink">Decision {String(label)}</div>
                  {series.map((s) => {
                    const m = row[`${s.policy}:mean`] as number | undefined
                    const r = row[`${s.policy}:range`] as [number, number] | undefined
                    if (m === undefined || !r) return null
                    return (
                      <TipRow
                        key={s.policy}
                        color={trailColor(s.policy)}
                        label={policyLabel(s.policy)}
                        value={`${shortNumber(m)} (${shortNumber(r[0])} to ${shortNumber(r[1])})`}
                      />
                    )
                  })}
                </TooltipBox>
              )
            }}
          />
          {series.map((s) => (
            <Area
              key={`${s.policy}-band`}
              dataKey={`${s.policy}:range`}
              stroke="none"
              fill={trailColor(s.policy)}
              fillOpacity={0.12}
              isAnimationActive={false}
            />
          ))}
          {series.map((s) => (
            <Line
              key={s.policy}
              dataKey={`${s.policy}:mean`}
              stroke={trailColor(s.policy)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
// Stacked bars, one row per policy, drawn as plain aligned rows
// ---------------------------------------------------------------------------

/**
 * One row per policy: name, a stacked bar on a shared scale, and the row total. Negative
 * parts stack left of a shared zero line and positive parts right of it, so every row reads
 * against the same baseline. Hovering a segment names it and its value.
 */
function StackedRows({
  rows,
  keys,
  colorOf,
  format,
  percent,
  totalLabel,
}: {
  rows: { policy: string; values: Record<string, number> }[]
  keys: string[]
  colorOf: (key: string, i: number) => string
  format: (v: number) => string
  percent?: boolean
  totalLabel?: string
}) {
  const [hover, setHover] = useState<{ policy: string; key: string } | null>(null)
  const sums = rows.map((r) => {
    let neg = 0
    let pos = 0
    for (const k of keys) {
      const v = r.values[k] ?? 0
      if (v < 0) neg += v
      else pos += v
    }
    return { neg, pos }
  })
  const min = percent ? 0 : Math.min(0, ...sums.map((x) => x.neg))
  const max = percent ? 1 : Math.max(0, ...sums.map((x) => x.pos))
  const span = max - min || 1
  const at = (v: number) => ((v - min) / span) * 100
  const hovered = hover ? rows.find((r) => r.policy === hover.policy) : null

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        let negEdge = 0
        let posEdge = 0
        const total = keys.reduce((acc, k) => acc + (row.values[k] ?? 0), 0)
        return (
          <div key={row.policy} className="grid grid-cols-[11rem_1fr_4.5rem] items-center gap-4">
            <span className="flex items-center gap-2 min-w-0 text-base font-medium text-ink">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: trailColor(row.policy) }}
              />
              <span className="truncate">{policyLabel(row.policy)}</span>
            </span>
            <div className="relative h-6 rounded-md bg-ink/[0.04]">
              {!percent && min < 0 && (
                <div
                  className="absolute -top-1 -bottom-1 w-px bg-ink/25"
                  style={{ left: `${at(0)}%` }}
                />
              )}
              {keys.map((k, i) => {
                const v = row.values[k] ?? 0
                if (v === 0) return null
                const from = v < 0 ? negEdge + v : posEdge
                if (v < 0) negEdge += v
                else posEdge += v
                const left = at(from)
                const width = at(from + Math.abs(v)) - left
                const active = hover?.policy === row.policy && hover.key === k
                return (
                  <div
                    key={k}
                    onMouseEnter={() => setHover({ policy: row.policy, key: k })}
                    onMouseLeave={() => setHover(null)}
                    className="absolute top-0 bottom-0 border-x border-white"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: colorOf(k, i),
                      opacity: hover && !active ? 0.55 : 1,
                    }}
                  />
                )
              })}
            </div>
            <span className="text-right text-base font-medium text-ink tabular-nums">
              {percent ? '' : format(total)}
            </span>
          </div>
        )
      })}
      <div className="grid grid-cols-[11rem_1fr_4.5rem] gap-4 text-sm text-ink-2 tabular-nums">
        <span />
        <div className="relative h-5">
          {(percent ? [0, 0.25, 0.5, 0.75, 1] : niceTicks(min, max)).map((t, i, all) => (
            <span
              key={`${t}-${i}`}
              className={`absolute ${i === 0 ? '' : i === all.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${at(t)}%` }}
            >
              {percent ? format(t) : tickNumber(t)}
            </span>
          ))}
        </div>
        <span className="text-right">{totalLabel ?? ''}</span>
      </div>
      <div className="min-h-6 text-base text-ink-2" aria-live="polite">
        {hover && hovered
          ? `${policyLabel(hovered.policy)} · ${words(hover.key)}: ${format(hovered.values[hover.key] ?? 0)}`
          : '\u00a0'}
      </div>
    </div>
  )
}

export function ActionShareChart({
  rows,
  actions,
}: {
  rows: { policy: string; shares: Record<string, number> }[]
  actions: string[]
}) {
  return (
    <ChartCard
      title="What each policy chose"
      legend={actions.map((a, i) => ({ label: words(a), color: actionColor(a, i) }))}
      height=""
    >
      <StackedRows
        rows={rows.map((r) => ({ policy: r.policy, values: r.shares }))}
        keys={actions}
        colorOf={actionColor}
        format={(v) => `${Math.round(v * 100)}%`}
        percent
      />
    </ChartCard>
  )
}

export function RewardSourceChart({
  rows,
  components,
}: {
  rows: { policy: string; contributions: Record<string, number> }[]
  components: string[]
}) {
  return (
    <ChartCard
      title="Where the reward came from"
      legend={components.map((c, i) => ({ label: words(c), color: componentColor(i) }))}
      height=""
    >
      <StackedRows
        rows={rows.map((r) => ({ policy: r.policy, values: r.contributions }))}
        keys={components}
        colorOf={(_, i) => componentColor(i)}
        format={(v) => (Math.abs(v) >= 10 ? Math.round(v).toLocaleString() : shortNumber(v))}
        totalLabel="Return"
      />
    </ChartCard>
  )
}
