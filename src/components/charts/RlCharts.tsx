import type { ReactNode } from 'react'
import {
  Area,
  Bar,
  BarChart,
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

// Shared chart grammar: recessive grid and axes, ink text, series colour only on marks
const AXIS = { fontSize: 12, stroke: '#6a7b96', tickLine: false } as const
const GRID = 'rgba(10,19,36,0.07)'

export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  height = 'h-56',
}: {
  title: string
  subtitle?: ReactNode
  legend?: { label: string; color: string; dashed?: boolean; band?: boolean }[]
  children: ReactNode
  height?: string
}) {
  return (
    <section className="glass p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink-title">{title}</h3>
          {subtitle && (
            <details className="text-sm text-muted mt-1">
              <summary className="cursor-pointer hover:text-ink">What this shows</summary>
              <div className="pt-2 leading-relaxed">{subtitle}</div>
            </details>
          )}
        </div>
        {legend && legend.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-sm text-ink-2">
                {l.band ? (
                  <span
                    className="w-3.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: l.color, opacity: 0.25 }}
                  />
                ) : l.dashed ? (
                  <span className="w-4 border-t-2 border-dashed" style={{ borderColor: l.color }} />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                )}
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className={height}>{children}</div>
    </section>
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
      subtitle={`Dots are single episodes. The line is a ${window}-episode rolling mean; the shading is ±1 standard deviation over that window.`}
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
              fontSize: 11,
              fill: '#6a7b96',
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={shortNumber}
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
      subtitle={`Training pauses at each checkpoint and tests the current policy${evalSeed !== null ? ` on seed ${evalSeed}` : ''}. This seed selects the saved best model; it is not the training seed or a held-out test. Shading spans the tested episodes.`}
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
              fontSize: 11,
              fill: '#6a7b96',
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={shortNumber}
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
      legend={components.map((c, i) => ({ label: c, color: componentColor(i) }))}
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
              fontSize: 11,
              fill: '#6a7b96',
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={shortNumber}
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
      subtitle="Each point is the mean per-tick reward over the preceding simulator window, plotted at the decision that closes that window. Lines average that value across evaluation seeds; shading shows their range."
      legend={series.map((s) => ({ label: s.policy, color: trailColor(s.policy) }))}
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
              fontSize: 11,
              fill: '#6a7b96',
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={shortNumber}
            label={{
              value: 'Mean reward per simulator tick',
              angle: -90,
              position: 'insideLeft',
              fontSize: 11,
              fill: '#6a7b96',
            }}
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
                        label={s.policy}
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
// Horizontal 100%/stacked bars, one per policy
// ---------------------------------------------------------------------------

function StackedPolicyBars({
  rows,
  keys,
  colorOf,
  format,
  percent,
}: {
  rows: Record<string, number | string>[]
  keys: string[]
  colorOf: (key: string, i: number) => string
  format: (v: number) => string
  percent?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        barCategoryGap={10}
      >
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          {...AXIS}
          domain={percent ? [0, 1] : [0, 'auto']}
          tickFormatter={(v: number) => (percent ? `${Math.round(v * 100)}%` : shortNumber(v))}
        />
        <YAxis type="category" dataKey="policy" {...AXIS} axisLine={false} width={96} />
        <Tooltip
          cursor={{ fill: 'rgba(10,19,36,0.04)' }}
          content={({ active, payload }) => {
            const row = active
              ? (payload?.[0]?.payload as Record<string, number | string> | undefined)
              : undefined
            if (!row) return null
            return (
              <TooltipBox>
                <div className="font-medium text-ink">{row.policy}</div>
                {keys.map((k, i) => (
                  <TipRow
                    key={k}
                    color={colorOf(k, i)}
                    label={k}
                    value={format(Number(row[k] ?? 0))}
                  />
                ))}
              </TooltipBox>
            )
          }}
        />
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="s"
            fill={colorOf(k, i)}
            stroke="#ffffff"
            strokeWidth={2}
            isAnimationActive={false}
            radius={i === keys.length - 1 ? [0, 4, 4, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
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
      subtitle="Share of all moves sent to the controlled nodes, across every seed."
      legend={actions.map((a, i) => ({ label: a, color: actionColor(a, i) }))}
      height={rows.length > 3 ? 'h-56' : 'h-44'}
    >
      <StackedPolicyBars
        rows={rows.map((r) => ({ policy: r.policy, ...r.shares }))}
        keys={actions}
        colorOf={actionColor}
        format={(v) => `${(v * 100).toFixed(0)}%`}
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
      subtitle="Mean episode total of each weighted reward component; bars add up to the mean return."
      legend={components.map((c, i) => ({ label: c, color: componentColor(i) }))}
      height={rows.length > 3 ? 'h-56' : 'h-44'}
    >
      <StackedPolicyBars
        rows={rows.map((r) => ({ policy: r.policy, ...r.contributions }))}
        keys={components}
        colorOf={(_, i) => componentColor(i)}
        format={shortNumber}
      />
    </ChartCard>
  )
}
