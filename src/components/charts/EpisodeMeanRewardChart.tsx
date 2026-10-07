import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from './RlCharts'
import { AXIS, AXIS_LABEL, GRID } from './chartStyle'
import { shortNumber } from '../../lib/format'
import type { EpisodeRewardPoint } from '../../lib/rlStats'
import { trailColor } from '../../styles/tokens'

export function EpisodeMeanRewardChart({
  points,
  seedCount,
}: {
  points: EpisodeRewardPoint[]
  seedCount: number
}) {
  const color = trailColor('model')
  return (
    <ChartCard
      title="Mean reward per training episode"
      subtitle={`Each point is the episode return divided by its number of decisions. ${seedCount === 1 ? 'One training seed; no seed averaging or smoothing.' : `Matching episode numbers are averaged across up to ${seedCount} independent training seeds; no smoothing.`}`}
      legend={[{ label: 'Episode mean reward', color }]}
      height="h-72"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 20, left: 10 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="episode"
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
            width={70}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => shortNumber(v)}
            label={{ value: 'Mean reward', angle: -90, position: 'insideLeft', ...AXIS_LABEL }}
          />
          <Tooltip
            content={({ active, payload }) => {
              const p = active
                ? (payload?.[0]?.payload as EpisodeRewardPoint | undefined)
                : undefined
              return p ? (
                <div className="glass-chip px-3 py-2 text-sm text-ink flex flex-col gap-1">
                  <strong>Training episode {p.episode}</strong>
                  <span>Mean reward: {shortNumber(p.meanReward)}</span>
                  <span>Episode return: {shortNumber(p.returnMean)}</span>
                  <span>
                    {p.decisions.join(' / ')} decisions · {p.seeds} training{' '}
                    {p.seeds === 1 ? 'seed' : 'seeds'}
                  </span>
                  {p.seeds > 1 && (
                    <span>
                      Seed range: {shortNumber(p.range[0])} to {shortNumber(p.range[1])}
                    </span>
                  )}
                </div>
              ) : null
            }}
          />
          <Line
            dataKey="meanReward"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
