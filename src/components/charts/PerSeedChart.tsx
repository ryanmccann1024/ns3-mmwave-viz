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

  if (seeds.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-ink-title">Same-seed policy comparison</h3>
        <Segmented
          size="sm"
          options={[
            { value: 'return', label: 'Return' },
            ...chartable.map((k) => ({ value: k, label: label(k) })),
          ]}
          value={metric}
          onChange={setMetric}
        />
        <div className="ml-auto flex items-center gap-3">
          {policies.map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-sm text-ink-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: trailColor(p) }}
              />
              {p}
            </span>
          ))}
        </div>
      </div>
      <details className="text-sm text-muted">
        <summary className="cursor-pointer hover:text-ink">How to read this chart</summary>
        <p className="pt-2">
          Each seed is one simulator condition shared by all policies. Left-to-right seed order is
          not time or learning progress.
        </p>
      </details>
      <div className="h-56">
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
            <CartesianGrid vertical={false} stroke="rgba(10,19,36,0.07)" />
            <ZAxis range={[110, 110]} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[-0.5, seeds.length - 0.5]}
              ticks={seeds.map((_, i) => i)}
              tickFormatter={(i: number) => `Seed ${seeds[i]}`}
              tickLine={false}
              axisLine={{ stroke: 'rgba(10,19,36,0.15)' }}
              fontSize={11}
              stroke="#6a7b96"
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[yMin, yMax]}
              ticks={yTicks}
              tickFormatter={(v: number) => shortNumber(v)}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              stroke="#6a7b96"
              width={48}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined
                if (!p) return null
                return (
                  <div className="glass-chip px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: trailColor(p.policy) }}
                      />
                      {p.policy} · seed {p.seed}
                    </div>
                    <div className="text-ink-2 mt-0.5">
                      {metric === 'return' ? 'Return' : label(metric)}{' '}
                      <span className="font-mono tabular-nums">{shortNumber(p.y)}</span>
                    </div>
                    <div className="text-muted">{p.episode}</div>
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pt-2 border-t border-ink/[0.06]">
          {['hold', 'random_valid']
            .filter((baseline) => evaluation.policies.includes(baseline))
            .map((baseline) => (
              <div key={baseline} className="tile p-3">
                <div className="text-sm font-semibold text-ink mb-3">
                  Delivery advantage: model − {baseline}
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
                    <div key={seed} className="flex items-center gap-2 text-sm mb-2">
                      <span className="w-14 text-muted">{seed}</span>
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
                        className={`w-16 text-right tabular-nums ${delta !== null && delta < 0 ? 'text-rose-700' : 'text-emerald-800'}`}
                      >
                        {delta === null
                          ? 'n/a'
                          : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp`}
                      </span>
                    </div>
                  )
                })}
                <div className="text-sm text-muted mt-3">
                  Right of center favors the model; left favors {baseline}. pp = percentage points.
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
