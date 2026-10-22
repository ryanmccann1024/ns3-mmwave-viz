import type { Evaluation, Experiment } from './experimentIndex.ts'

export type Objective = {
  kind: string
  metric: string
  label: string
  higher: boolean
  unit: '%' | 's'
  secondary: string
  secondaryLabel: string
}
const objectives: Record<string, Objective> = {
  coverage: {
    kind: 'coverage',
    metric: 'final_minute_coverage',
    label: 'Final coverage',
    higher: true,
    unit: '%',
    secondary: 'final_minute_survivor_delivery',
    secondaryLabel: 'Final service',
  },
  investigation: {
    kind: 'investigation',
    metric: 'investigation_success',
    label: 'Team completion',
    higher: true,
    unit: '%',
    secondary: 'team_arrival_fraction_final',
    secondaryLabel: 'Team at target',
  },
  recovery: {
    kind: 'recovery',
    metric: 'recovery_sustained_final',
    label: 'Sustained recovery',
    higher: true,
    unit: '%',
    secondary: 'final_minute_survivor_delivery',
    secondaryLabel: 'Final service',
  },
  jamming: {
    kind: 'jamming',
    metric: 'jammer_disruption_s',
    label: 'Service disruption',
    higher: false,
    unit: 's',
    secondary: 'post_jammer_delivery_ratio',
    secondaryLabel: 'After jamming',
  },
}
export function missionObjective(evaluation: Evaluation): Objective | null {
  const contract = (evaluation.contract ?? {}) as Record<string, unknown>
  const mission = contract.mission as { kind?: string } | undefined
  const kind =
    evaluation.missionKind ?? (contract.jammer_path_enabled === true ? 'jamming' : mission?.kind)
  const objective = kind ? objectives[kind] : undefined
  if (!objective) return null
  const recorded = (key: string) =>
    evaluation.episodes.some((e) => typeof e.metrics?.[key] === 'number')
  // Without the mission-review disruption, a phase report's scenario-check outage (window
  // delivery under 90% after the jammer onset) is shown under its own name, never as
  // jammer_disruption_s
  if (kind === 'jamming' && !recorded('jammer_disruption_s') && recorded('event_outage_s'))
    return {
      ...objective,
      metric: 'event_outage_s',
      label: 'Outage after onset',
      ...(recorded('post_jammer_delivery_ratio')
        ? {}
        : { secondary: 'post_event_delivery', secondaryLabel: 'After onset' }),
    }
  if (
    kind === 'recovery' &&
    evaluation.episodes.some((e) => typeof e.metrics?.reactive_recovery_success === 'number')
  )
    return { ...objective, metric: 'reactive_recovery_success', label: 'Reactive recovery' }
  if (
    kind === 'recovery' &&
    !evaluation.episodes.some((e) => typeof e.metrics?.recovery_sustained_final === 'number')
  )
    return {
      ...objective,
      metric: 'final_minute_survivor_delivery',
      label: 'Final service',
    }
  return objective
}
export const objectiveValue = (
  value: number | null | undefined,
  objective: Pick<Objective, 'unit'>
) =>
  value == null || !Number.isFinite(value)
    ? '–'
    : objective.unit === '%'
      ? `${(value * 100).toFixed(1)}%`
      : `${value.toFixed(0)} s`
const mean = (values: (number | null | undefined)[]) => {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}
export function missionSummary(experiment: Pick<Experiment, 'evaluations'>) {
  const first = experiment.evaluations.find((e) => missionObjective(e))
  if (!first) return null
  const objective = missionObjective(first)!
  const groups = new Map<string, Evaluation[]>()
  const completed = experiment.evaluations.filter((e) =>
    e.episodes.some((p) => p.policy === 'model' && p.status === 'completed')
  )
  const confirmed = completed.filter((e) => e.stage === 'confirmation')
  for (const e of confirmed.length ? confirmed : completed)
    groups.set(e.label, [...(groups.get(e.label) ?? []), e])
  const models = [...groups]
    .map(([label, entries]) => {
      const episodes = entries.flatMap((e) =>
        e.episodes.filter((p) => p.policy === 'model' && p.status === 'completed')
      )
      const metrics: Record<string, number | null> = {}
      for (const key of new Set(episodes.flatMap((p) => Object.keys(p.metrics ?? {}))))
        metrics[key] = mean(episodes.map((p) => p.metrics?.[key]))
      return { label, value: metrics[objective.metric], metrics }
    })
    .filter((m) => m.value != null)
  const rank = (m: {
    value: number | null | undefined
    metrics: Record<string, number | null>
  }) => {
    const v = m.value ?? (objective.higher ? -Infinity : Infinity)
    return [
      objective.kind === 'coverage'
        ? Number((m.metrics.final_minute_survivor_delivery ?? 0) >= 0.9)
        : 1,
      objective.higher ? v : -v,
      m.metrics[objective.secondary] ?? -Infinity,
      objective.kind === 'investigation'
        ? -(m.metrics.team_distance_remaining_m ?? Infinity)
        : -(m.metrics.survivor_outage_s ?? 0),
      -(m.metrics.travel_m_total ?? Infinity),
    ]
  }
  models.sort((a, b) => {
    const x = rank(a),
      y = rank(b)
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]
    return a.label.localeCompare(b.label)
  })
  const baselines = new Map<string, Map<string, number>>()
  for (const e of experiment.evaluations)
    for (const p of e.episodes) {
      const v = p.metrics?.[objective.metric]
      if (
        p.policy === 'model' ||
        p.status !== 'completed' ||
        typeof v !== 'number' ||
        !Number.isFinite(v)
      )
        continue
      const byDir = baselines.get(p.policy) ?? new Map<string, number>()
      byDir.set(p.dir, v)
      baselines.set(p.policy, byDir)
    }
  const baseline = [...baselines]
    .map(([label, byDir]) => ({ label, value: mean([...byDir.values()])! }))
    .sort((a, b) => (objective.higher ? b.value - a.value : a.value - b.value))[0]
  return { objective, model: models[0] ?? null, baseline: baseline ?? null }
}
