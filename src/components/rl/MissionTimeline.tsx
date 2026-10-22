import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import type { Evaluation } from '../../lib/experimentIndex'
import type { EvaluationTelemetry } from '../../hooks/useRlData'
import { missionTimeline, type MissionPoint } from '../../lib/missionTimeline'
import { missionObjective } from '../../lib/missionObjective'
import { ChartCard, TipRow, TooltipBox } from '../charts/RlCharts'
import { AXIS, AXIS_LABEL, GRID } from '../charts/chartStyle'
import { Segmented } from '../ui/Segmented'
import { trailColor } from '../../styles/tokens'
import { policyLabel } from '../../lib/rlLabels'

/** What each metric is called and the unit its values and axis carry */
const metrics = [
  { value: 'service', label: 'Service', unit: '%' },
  { value: 'los', label: 'LOS', unit: '%' },
  { value: 'sinr', label: 'SINR', unit: 'dB' },
  { value: 'coverage', label: 'Coverage', unit: '%' },
  { value: 'arrival', label: 'At target', unit: '%' },
  { value: 'travel', label: 'Travel', unit: 'm' },
  { value: 'distance', label: 'Distance left', unit: 'm' },
] as const
type Metric = Exclude<keyof MissionPoint, 'time'>
export function MissionTimeline({
  evaluation,
  telemetry,
}: {
  evaluation: Evaluation
  telemetry: EvaluationTelemetry
}) {
  const objective = missionObjective(evaluation)
  const [metric, setMetric] = useState<Metric>(
    objective?.kind === 'coverage'
      ? 'coverage'
      : objective?.kind === 'investigation'
        ? 'arrival'
        : 'service'
  )
  const data = useMemo(() => {
    const byTime = new Map<number, Record<string, number | null>>()
    for (const [policy, episodes] of Object.entries(telemetry.byPolicy)) {
      const values = new Map<number, number[]>()
      for (const steps of episodes)
        for (const point of missionTimeline(steps, evaluation.contract!)) {
          const value = point[metric]
          if (value !== null && Number.isFinite(value))
            values.set(point.time, [...(values.get(point.time) ?? []), value])
        }
      for (const [time, points] of values)
        byTime.set(time, {
          ...byTime.get(time),
          time,
          [policy]: points.reduce((a, b) => a + b, 0) / points.length,
        })
    }
    return [...byTime.values()].sort((a, b) => Number(a.time) - Number(b.time))
  }, [evaluation, telemetry, metric])
  const policies = Object.keys(telemetry.byPolicy)
  const failures = [
    ...new Set(
      evaluation.episodes
        .map((e) => e.metrics?.failure_s)
        .filter((v): v is number => typeof v === 'number')
    ),
  ]
  if (!evaluation.contract) return null
  const unit = metrics.find((m) => m.value === metric)?.unit ?? ''
  const percent = unit === '%'
  return (
    <ChartCard
      title="Mission timeline"
      subtitle="Mean over seeds"
      aside={
        <Segmented
          options={metrics
            .filter(
              (m) =>
                !['arrival', 'distance'].includes(m.value) || objective?.kind === 'investigation'
            )
            .map(({ value, label }) => ({ value, label }))}
          value={metric}
          onChange={setMetric}
        />
      }
      legend={policies.map((p) => ({ label: policyLabel(p), color: trailColor(p) }))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, left: 4, right: 16, bottom: 20 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            {...AXIS}
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            label={{
              value: 'Episode time (s)',
              position: 'insideBottom',
              offset: -12,
              ...AXIS_LABEL,
            }}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={56}
            domain={percent ? [0, 100] : ['auto', 'auto']}
            tickFormatter={(v: number) => `${Math.round(v)}${percent ? '%' : ''}`}
          />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox>
                  <div className="font-medium text-ink">{label} s</div>
                  {payload.map((p) => (
                    <TipRow
                      key={String(p.dataKey)}
                      color={trailColor(String(p.dataKey))}
                      label={policyLabel(String(p.dataKey))}
                      value={
                        typeof p.value === 'number'
                          ? `${p.value.toFixed(percent ? 0 : 1)}${percent ? '%' : ` ${unit}`}`
                          : '–'
                      }
                    />
                  ))}
                </TooltipBox>
              ) : null
            }
          />
          {failures.length === 1 && (
            <ReferenceLine
              x={failures[0]}
              stroke="#475569"
              strokeDasharray="4 4"
              label={{ value: 'Relay loss', position: 'insideTopRight', ...AXIS_LABEL }}
            />
          )}
          {policies.map((p) => (
            <Line
              key={p}
              type="linear"
              dataKey={p}
              name={policyLabel(p)}
              stroke={trailColor(p)}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
