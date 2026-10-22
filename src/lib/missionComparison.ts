import type { Evaluation } from './experimentIndex.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const TERMS: Record<string, string> = {
  connected_outdoor_area_fraction_v1: 'Covered area',
  team_target_distance_score_v1: 'Target proximity',
  survivor_critical_delivery_fraction_v1: 'Delivery',
  jammed_traffic_delivery_fraction_v1: 'Delivery',
  available_peer_travel_fraction_v1: 'Travel',
  boundary_contact_fraction_v1: 'Wall contact',
  available_team_closeness_v1: 'Cohesion',
  demanded_path_sinr_margin_v1: 'SINR',
  target_proximity_potential_v1: 'Target progress',
  weakest_survivor_delivery_fraction_v1: 'Weakest peer',
  weakest_active_delivery_fraction_v1: 'Weakest peer',
  worst_peer_target_proximity_v1: 'Farthest peer',
  investigator_target_proximity_v1: 'Investigator',
  followers_target_proximity_v1: 'Followers',
  followers_investigator_then_target_proximity_v1: 'Followers',
  available_target_arrival_fraction_v1: 'Arrival',
}
export function phaseFromPath(path: string): number | null {
  const match = path.match(/(?:^|\/)10-23(?:-(\d+))?(?:\/|$)/)
  return match ? Number(match[1] ?? 0) + 1 : null
}
export function rewardTerms(schema: unknown): string[] {
  const components = rec(schema).components
  const coordinated = Array.isArray(components)
    ? components.find((v) => typeof v === 'string' && v.startsWith('coordinated_'))
    : null
  if (typeof coordinated === 'string')
    return [
      ...(coordinated.includes('_service_')
        ? ['Delivery', 'Lower-tail service', 'SINR', 'Isolation']
        : coordinated.includes('_investigation_')
          ? ['Target proximity', 'Arrival', 'Connectivity']
          : ['Covered area', 'Lower-tail service']),
      'Travel',
      'Wall contact',
      'Peer blocking',
      coordinated.includes('_adaptive_') ? 'Adaptive priorities' : 'Fixed priorities',
    ]
  return [
    ...new Set(
      (Array.isArray(components) ? components : [])
        .filter((v): v is string => typeof v === 'string')
        .map(
          (c) =>
            TERMS[c] ??
            (c.startsWith('level0_')
              ? 'Binary objective'
              : c.replace(/_v\d+$/, '').replace(/_/g, ' '))
        )
    ),
  ]
}
export function shortRewardTitle(schema: unknown, fallback: string): string {
  const first = rec(schema).components
  const coordinated = Array.isArray(first)
    ? first.find((v) => typeof v === 'string' && v.startsWith('coordinated_'))
    : null
  if (typeof coordinated === 'string') {
    const adaptive = coordinated.includes('_adaptive_')
    if (coordinated.includes('_service_'))
      return adaptive ? 'Restore then settle' : 'Service + fairness'
    if (coordinated.includes('_investigation_'))
      return adaptive ? 'Approach then establish' : 'Approach + arrival'
    return adaptive ? 'Expand then settle' : 'Area + service'
  }

  const terms = rewardTerms(schema),
    data = rec(schema)
  const components = Array.isArray(data.components) ? data.components : [],
    weights = Array.isArray(data.weights) ? data.weights : []
  for (const [component, term] of [
    ['available_team_closeness_v1', 'Cohesion'],
    ['available_peer_travel_fraction_v1', 'Travel'],
  ]) {
    const index = components.indexOf(component),
      weight = weights[index],
      slot = terms.indexOf(term)
    if (slot >= 0 && typeof weight === 'number') terms[slot] = `${term} ${Math.abs(weight)}`
  }
  return terms.length ? terms.join(' + ') : fallback.split(' · ')[0]
}
export function missionMetadata(campaign: string, row: Rec, train: Rec) {
  const imported = rec(train.imported_control)
  const source = [
    row.source_campaign,
    imported.source,
    imported.source_training,
    imported.source_output,
  ].find((v): v is string => typeof v === 'string')
  const current =
    phaseFromPath(campaign) ?? phaseFromPath(String(train.output_dir ?? train.model_path ?? ''))
  const phase =
    typeof row.source_phase === 'number'
      ? row.source_phase
      : (phaseFromPath(source ?? '') ?? current)
  return {
    phase,
    origin: source || phase !== current ? 'Historical' : 'New',
    terms: rewardTerms(train.reward_schema),
  }
}
export interface MissionFilters {
  phase: string
  term: string
  mode: string
  origin: string
}
export const ALL_FILTERS: MissionFilters = {
  phase: 'All',
  term: 'All',
  mode: 'All',
  origin: 'All',
}
export function executionMode(e: Evaluation): string {
  if (e.label.includes('Frozen sampled')) return 'Sampled'
  if (e.provenance?.kind === 'online' || e.label.includes('Online learning')) return 'Online'
  if (/Sample 60|progress stalls/.test(e.label)) return 'Sampling schedule'
  return 'Deterministic'
}
export function matchesMissionFilters(e: Evaluation, f: MissionFilters): boolean {
  const meta = e.missionTags
  return (
    (f.phase === 'All' || String(meta?.phase) === f.phase) &&
    (f.term === 'All' || (meta?.terms ?? rewardTerms(e.rewardSchema)).includes(f.term)) &&
    (f.mode === 'All' || executionMode(e) === f.mode) &&
    (f.origin === 'All' || meta?.origin === f.origin)
  )
}
export interface MetricColumn {
  key: string
  label: string
  unit: '%' | 'm' | 's'
  higher: boolean
  help: string
}
export function missionColumns(mission: string): MetricColumn[] {
  const travel: MetricColumn = {
    key: 'travel_m_total',
    label: 'Total travel',
    unit: 'm',
    higher: false,
    help: 'Sum of actual peer XY travel over the full episode; lower is better only with useful mission performance.',
  }
  if (mission === 'investigation')
    return [
      {
        key: 'team_completed_ever',
        label: 'Team completed',
        unit: '%',
        higher: true,
        help: 'Fraction of evaluated episodes completing the configured full-team investigation and dwell.',
      },
      {
        key: 'final_team_arrival_fraction',
        label: 'Peers at target',
        unit: '%',
        higher: true,
        help: 'Fraction of available peers inside the target radius at episode end.',
      },
      {
        key: 'final_team_max_distance_m',
        label: 'Farthest peer',
        unit: 'm',
        higher: false,
        help: 'Largest available-peer horizontal distance from target at episode end.',
      },
      travel,
    ]
  if (mission === 'coverage')
    return [
      {
        key: 'final_minute_coverage',
        label: 'Final coverage',
        unit: '%',
        higher: true,
        help: 'Mean connected outdoor probe coverage during 540 < t ≤ 600 s.',
      },
      {
        key: 'final_minute_original_delivery',
        label: 'Final service',
        unit: '%',
        higher: true,
        help: 'Original-demand delivery fraction in the final minute.',
      },
      travel,
    ]
  return [
    {
      key: 'final_minute_event_delivery',
      label: 'Final service',
      unit: '%',
      higher: true,
      help: 'Delivery fraction over the final minute; recovery excludes failed-peer demand.',
    },
    {
      key: 'post_event_delivery',
      label: 'Event service',
      unit: '%',
      higher: true,
      help: 'Delivery fraction across the full eligible period after failure or jammer onset, including disruption.',
    },
    {
      key: 'final_minute_worst_service',
      label: 'Worst-peer service',
      unit: '%',
      higher: true,
      help: 'Mean least-served available demand-bearing endpoint fraction during the final minute.',
    },
    {
      key: 'event_outage_s',
      label: 'Event outage',
      unit: 's',
      higher: false,
      help: 'Seconds failing the configured event-service success test after onset; not equivalent to zero traffic.',
    },
    travel,
  ]
}
export interface ComparisonRow {
  id: string
  signature: string
  evaluation: Evaluation
  policy: string
  title: string
  phase: number | null
  origin: string
  mode: string
  values: Record<string, number | null>
  ranges: Record<string, string>
  seeds: number[]
}
export function comparisonRows(evaluations: Evaluation[], mission: string): ComparisonRow[] {
  const columns = missionColumns(mission),
    result: ComparisonRow[] = [],
    seen = new Set<string>()
  for (const e of evaluations)
    for (const policy of e.policies) {
      const episodes = e.episodes.filter((p) => p.policy === policy && p.status === 'completed')
      if (!episodes.length) continue
      const identity =
        policy === 'model'
          ? e.key
          : `${policy}:${episodes
              .map((p) => p.dir)
              .sort()
              .join('|')}`
      if (seen.has(identity)) continue
      seen.add(identity)
      const values: Record<string, number | null> = {},
        ranges: Record<string, string> = {}
      for (const c of columns) {
        const xs = episodes
          .map((p) => p.metrics?.[c.key])
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        values[c.key] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
        ranges[c.key] = xs.length
          ? `Measured ${xs.length}/${episodes.length} episodes; seed range ${Math.min(...xs).toFixed(3)}–${Math.max(...xs).toFixed(3)}.`
          : 'Metric not recorded; no value inferred.'
      }
      result.push({
        id: identity,
        signature:
          policy === 'model'
            ? `${e.missionTags?.phase}:${e.missionVariantKey ?? e.key}:${executionMode(e)}:${e.trainingSeed}`
            : policy,
        evaluation: e,
        policy,
        title:
          policy === 'model'
            ? shortRewardTitle(e.rewardSchema, e.label)
            : ({
                hold: 'Hold position',
                random_valid: 'Random valid',
                scripted: 'Scripted reference',
              }[policy] ?? policy),
        phase: policy === 'model' ? (e.missionTags?.phase ?? null) : null,
        origin: policy === 'model' ? (e.missionTags?.origin ?? 'Unknown') : 'Baseline',
        mode: policy === 'model' ? executionMode(e) : 'Baseline',
        values,
        ranges,
        seeds: [...new Set(episodes.map((p) => p.seed))],
      })
    }
  return result
}
/** Shade each metric independently. Missing data remain unshaded; no blended score. */
export function comparisonShade(
  value: number | null,
  all: (number | null)[],
  higher: boolean
): string | undefined {
  const xs = all.filter((v): v is number => v !== null && Number.isFinite(v))
  if (
    value === null ||
    !Number.isFinite(value) ||
    !xs.length ||
    Math.max(...xs) === Math.min(...xs)
  )
    return undefined
  let q = (value - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs))
  if (!higher) q = 1 - q
  return `hsl(${Math.round(15 + q * 130)} 45% 93%)`
}

export function shortEvaluationTitle(e: Evaluation): string {
  return e.missionRewardTitle ? `${e.missionRewardTitle} · ${executionMode(e)}` : e.label
}

/** Versioned recorded history fills phases absent from the currently loaded model tree. */
export function historyEvaluations(value: unknown): Evaluation[] {
  const data = rec(value)
  if (data.phase_comparison_version !== 1 || !Array.isArray(data.diagnostics)) return []
  const groups = new Map<string, Evaluation>()
  for (const item of data.diagnostics) {
    const row = rec(item)
    if (
      !Number.isInteger(row.phase) ||
      !Number.isInteger(row.seed) ||
      typeof row.variant !== 'string' ||
      typeof row.policy !== 'string'
    )
      continue
    const mode =
      row.policy === 'online'
        ? 'Online learning'
        : row.policy === 'frozen_sampled'
          ? 'Frozen sampled'
          : row.policy === 'frozen_deterministic'
            ? 'Frozen deterministic'
            : row.policy === 'initial-sampling'
              ? 'Sample 60 decisions, then deterministic'
              : 'Sample briefly when progress stalls'
    const id = `${row.phase}:${row.variant}:${row.policy}:${row.training_seed}`
    let evaluation = groups.get(id)
    if (!evaluation) {
      evaluation = {
        key: id,
        label: mode,
        trainingSeed: row.training_seed as number,
        policies: ['model'],
        episodes: [],
        rewardSchema: row.reward_schema,
        missionPpoLabel: String(row.ppo_label ?? 'Recorded settings'),
        missionVariantKey: row.variant,
        historyOnly: true,
        missionTags: {
          phase: row.phase as number,
          origin: 'Historical',
          terms: rewardTerms(row.reward_schema),
        },
      } as unknown as Evaluation
      groups.set(id, evaluation)
    }
    evaluation.episodes.push({
      policy: 'model',
      seed: row.seed,
      status: 'completed',
      dir: id + '/' + row.seed,
      metrics: row.metrics,
    } as Evaluation['episodes'][number])
  }
  return [...groups.values()]
}
export function mergedComparisonRows(
  live: Evaluation[],
  historical: Evaluation[],
  mission: string
): ComparisonRow[] {
  const rows = comparisonRows(live, mission),
    seen = new Set(rows.map((r) => r.signature))
  return [
    ...rows,
    ...comparisonRows(historical, mission).filter((r) => !seen.has(r.signature)),
  ].sort(
    (a, b) =>
      (a.phase ?? 99) - (b.phase ?? 99) ||
      a.title.localeCompare(b.title) ||
      a.mode.localeCompare(b.mode)
  )
}
