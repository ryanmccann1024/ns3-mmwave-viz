import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ReferenceArea,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { Evaluation } from '../../lib/experimentIndex'
import { shortNumber } from '../../lib/format'
import { trailColor } from '../../styles/tokens'
import { AXIS, GRID } from './chartStyle'
import { Legend } from './RlCharts'
import { policyLabel } from '../../lib/rlLabels'
import { Segmented } from '../ui/Segmented'

interface Point {
  x: number
  y: number
  seed: number
  policy: string
  episode: string
}

interface Props {
  evaluation: Evaluation
  metricKeys: string[]
  label: (key: string) => string
}

/** 1, 2 or 5 times a power of ten: the steps people read axes in */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

// Policies sit side by side inside each seed's slot, so dots never stack
const SLOT_WIDTH = 0.5

/** One dot per policy per seed: shows whether a policy wins consistently or on one seed */
export function PerSeedChart({ evaluation, metricKeys, label }: Props) {
  const [metric, setMetric] = useState<string>(
    metricKeys.includes('delivery_ratio') ? 'delivery_ratio' : 'return'
  )
  const seeds = useMemo(
    () => [...new Set(evaluation.episodes.map((e) => e.seed))].sort((a, b) => a - b),
    [evaluation]
  )
  const policies = evaluation.policies

  const series = useMemo(
    () =>
      policies.map((policy, pi) => {
        const offset = policies.length > 1 ? (pi / (policies.length - 1) - 0.5) * SLOT_WIDTH : 0
        const points: Point[] = []
        for (const e of evaluation.episodes) {
          if (e.policy !== policy || e.status !== 'completed') continue
          const y = metric === 'return' ? e.return : (e.metrics?.[metric] ?? null)
          if (typeof y !== 'number' || !Number.isFinite(y)) continue
          points.push({
            x: seeds.indexOf(e.seed) + offset,
            y,
            seed: e.seed,
            policy,
            episode: e.name,
          })
        }
        return { policy, points }
      }),
    [evaluation, policies, seeds, metric]
  )

  // A flat metric is still informative (for example, a policy that always fails).
  const chartable = useMemo(
    () =>
      metricKeys.filter((k) => {
        const vals = evaluation.episodes
          .map((e) => e.metrics?.[k])
          .filter((v): v is number => typeof v === 'number')
        return vals.length > 0
      }),
    [evaluation, metricKeys]
  )

  // Round the value range out to even steps, with room so edge dots are not clipped
  const ys = series.flatMap((s) => s.points.map((p) => p.y))
  const lo = ys.length ? Math.min(...ys) : 0
  const hi = ys.length ? Math.max(...ys) : 1
  const step = niceStep((hi - lo || Math.abs(hi) || 1) / 4)
  const yMin = Math.floor((lo - step * 0.25) / step) * step
  const yMax = Math.ceil((hi + step * 0.25) / step) * step
  const yTicks: number[] = []
  for (let t = yMin; t <= yMax + step / 2; t += step) yTicks.push(Number(t.toPrecision(12)))

  // Ratios read as percentages; returns stay as numbers
  const ratio = metric !== 'return' && lo >= 0 && hi <= 1
  const formatY = (v: number) => (ratio ? `${Math.round(v * 100)}%` : shortNumber(v))

  if (seeds.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Segmented
          size="lg"
          options={[
            { value: 'return', label: 'Return' },
            ...chartable.map((k) => ({ value: k, label: label(k) })),
          ]}
          value={metric}
          onChange={setMetric}
        />
      </div>
      <Legend items={policies.map((p) => ({ label: policyLabel(p), color: trailColor(p) }))} />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            {/* alternate seed bands, so each seed's dots read as one group */}
            {seeds.map((seed, i) =>
              i % 2 === 0 ? (
                <ReferenceArea
                  key={seed}
                  x1={i - 0.5}
                  x2={i + 0.5}
                  fill="#0a1324"
                  fillOpacity={0.03}
                  stroke="none"
                  ifOverflow="visible"
                />
              ) : null
            )}
            <CartesianGrid vertical={false} stroke={GRID} />
            <ZAxis range={[110, 110]} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[-0.5, seeds.length - 0.5]}
              ticks={seeds.map((_, i) => i)}
              tickFormatter={(i: number) => `Seed ${seeds[i]}`}
              {...AXIS}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={ratio ? [Math.max(yMin, -0.04), Math.min(yMax, 1.04)] : [yMin, yMax]}
              ticks={ratio ? yTicks.filter((t) => t >= 0 && t <= 1) : yTicks}
              tickFormatter={formatY}
              {...AXIS}
              axisLine={false}
              width={60}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined
                if (!p) return null
                return (
                  <div className="glass-chip px-3 py-2 text-sm">
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: trailColor(p.policy) }}
                      />
                      {policyLabel(p.policy)} · seed {p.seed}
                    </div>
                    <div className="text-ink-2 mt-0.5">
                      {metric === 'return' ? 'Return' : label(metric)}{' '}
                      <span className="tabular-nums font-medium text-ink">{formatY(p.y)}</span>
                    </div>
                  </div>
                )
              }}
            />
            {series.map((s) => (
              <Scatter
                key={s.policy}
                name={s.policy}
                data={s.points}
                fill={trailColor(s.policy)}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
                shape="circle"
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {evaluation.policies.includes('model') && metricKeys.includes('delivery_ratio') && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pt-4 border-t border-hairline">
          {['hold', 'random_valid']
            .filter((baseline) => evaluation.policies.includes(baseline))
            .map((baseline) => (
              <div key={baseline} className="tile p-5">
                <div className="text-lg font-semibold text-ink-title mb-4">
                  Delivered: model vs {policyLabel(baseline).toLowerCase()}
                </div>
                {seeds.map((seed) => {
                  const model = evaluation.episodes.find(
                    (e) => e.seed === seed && e.policy === 'model'
                  )?.metrics?.delivery_ratio
                  const base = evaluation.episodes.find(
                    (e) => e.seed === seed && e.policy === baseline
                  )?.metrics?.delivery_ratio
                  const delta =
                    typeof model === 'number' && typeof base === 'number' ? model - base : null
                  const width = delta === null ? 0 : Math.min(50, Math.abs(delta) * 50)
                  return (
                    <div key={seed} className="flex items-center gap-3 text-base mb-2.5">
                      <span className="w-20 text-ink-2">Seed {seed}</span>
                      <div className="relative h-3 flex-1 rounded bg-white/70">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-ink/30" />
                        {delta !== null && (
                          <div
                            className="absolute top-0.5 bottom-0.5 rounded-sm"
                            style={{
                              left: `${delta >= 0 ? 50 : 50 - width}%`,
                              width: `${width}%`,
                              backgroundColor: delta >= 0 ? '#22846c' : '#bd654f',
                            }}
                          />
                        )}
                      </div>
                      <span
                        className={`w-20 text-right font-medium tabular-nums ${delta !== null && delta < 0 ? 'text-rose-700' : 'text-emerald-800'}`}
                      >
                        {delta === null
                          ? 'n/a'
                          : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp`}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
