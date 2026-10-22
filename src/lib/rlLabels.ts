import type { Evaluation } from './experimentIndex'
import type { BaselineStatus } from './baselineManifest.ts'
import { sanitizeLabel } from './baselineManifest.ts'

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const GRADED_REWARD_LABELS: Record<string, string> = {
  coordinated_service_bridge_v1: 'Service + team radio',
  coordinated_coverage_sufficient_v1: 'Sufficient area + service',
  coordinated_service_fixed_v1: 'Service + fairness (fixed)',
  coordinated_service_adaptive_v1: 'Restore then settle (adaptive)',
  coordinated_investigation_fixed_v1: 'Approach + arrival (fixed)',
  coordinated_investigation_adaptive_v1: 'Approach then establish (adaptive)',
  coordinated_coverage_fixed_v1: 'Area + service (fixed)',
  coordinated_coverage_adaptive_v1: 'Expand then settle (adaptive)',

  connected_outdoor_area_fraction_v1: 'Connected area covered (0–1)',
  team_target_distance_score_v1: 'Team target proximity (0–1)',
  survivor_critical_delivery_fraction_v1: 'Survivor delivery ratio (0–1)',
  jammed_traffic_delivery_fraction_v1: 'Delivery during jamming (0–1)',
  available_peer_travel_fraction_v1: 'Actual travel ÷ permitted travel',
  worst_peer_target_proximity_v1: 'Farthest peer target proximity',
  weakest_survivor_delivery_fraction_v1: 'Least-served survivor delivery',
  weakest_active_delivery_fraction_v1: 'Least-served active peer delivery',
  available_team_closeness_v1: 'Team closeness (mean pair distance)',
  demanded_path_sinr_margin_v1: 'Demanded-path signal margin',
  available_target_arrival_fraction_v1: 'Peers currently inside target (0–1)',
  target_proximity_potential_v1: 'Target proximity plus discounted progress',
  boundary_contact_fraction_v1: 'Fraction of peers contacting a wall',
  investigator_target_proximity_v1: 'Investigator target proximity',
  followers_target_proximity_v1: 'Followers target proximity',
  followers_investigator_then_target_proximity_v1: 'Followers approach investigator, then target',
}

export function rewardWeightLabel(value: number): string {
  return `×${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
}

/** Exact Level 1 calculations, separate from the multiplier applied to their value. */
export function gradedRewardExplanation(
  component: string,
  schema?: unknown
): { calculation: string; example: string; timing: string } | null {
  const details = record(record(record(schema).component_details)[component])
  const contract = record(details.contract)
  const mission = record(contract.mission)
  const radius = mission.team_radius_m
  const targetRadius =
    typeof radius === 'number' && Number.isFinite(radius)
      ? `${radius} m target radius`
      : 'saved target radius'
  if (component.startsWith('coordinated_'))
    return {
      calculation:
        typeof details.formula === 'string'
          ? details.formula
          : 'See the saved mission reward schema.',
      example:
        component === 'coordinated_service_bridge_v1'
          ? 'G measures the weakest radio bridge across the whole available team. At -6.7 dB it is 0.5; the deficit penalty is w × (1 − G). High delivery between separate pairs can still leave G low.'
          : component === 'coordinated_coverage_sufficient_v1'
            ? 'Area reward stops increasing at the saved coverage target. Raw area, target retention, service and travel must still be compared separately.'
            : component.includes('investigation')
              ? 'For each available peer, closeness is exp(-distance beyond the target radius / 100 m). A peer inside has closeness 1. Q gives half its weight to the furthest peer; A counts peers inside.'
              : component.includes('service')
                ? 'With nine demanded peers, F averages the three lowest delivery ratios. A high total delivery cannot hide their low service. L measures signal potential, not delivered traffic.'
                : 'Area is connected outdoor coverage. Coverage has no compact-clustering reward. The settling travel cost is applied only by the adaptive arm after sustained area and service.',
      timing:
        'One completed eligible decision; failed peers excluded. Adaptive settling requires 30 seconds of current success; relapse fallback after 5 seconds or immediately after severe loss. Wall contact and rejected peer movement are costs. No future jammer/failure information.',
    }
  if (component === 'available_team_closeness_v1')
    return {
      calculation:
        'Score = 1 − mean horizontal separation of available peer pairs ÷ field diagonal. The displayed weight sets its contribution.',
      example: 'Mean separation 100 m in this 400 × 400 m field → about 0.823 before weighting.',
      timing:
        'Fully released decision windows only. Failed peers excluded; fewer than two available peers or no demand → 0.',
    }
  if (component === 'demanded_path_sinr_margin_v1')
    return {
      calculation:
        'For each demanded pair, find the current path with the best weakest-link SINR. Average sigmoid((path SINR + 6.7 dB) ÷ 4 dB); cap at 1 above 10 dB or when delivery reaches 95%. This measures signal potential, not delivered traffic.',
      example: 'Path bottleneck −6.7 dB → 0.5; at least 10 dB → 1, before weighting.',
      timing:
        'Fully post-event windows; failed and zero-demand endpoints excluded. Recovery uses critical pairs; jamming uses the declared all-pairs demand. No future jammer positions.',
    }
  if (component === 'target_proximity_potential_v1')
    return {
      calculation:
        'Reward = Q now + 50 × (0.99 × Phi now − Q previously). Q is mean target proximity; Phi equals Q except it is zero at the final step. The final correction prevents earning extra discounted reward from loops.',
      example:
        'Q increases from 0.50 to 0.51 → reward 0.755. Final-step reward includes the correction and can be negative.',
      timing:
        'Each scored investigation decision, using previous and current positions. Gamma 0.99 and scale 50 are saved in the reward schema; this arm keeps those fixed.',
    }
  if (component === 'connected_outdoor_area_fraction_v1')
    return {
      calculation:
        'Reward = outdoor area served by the largest connected peer group ÷ total outdoor area. Buildings excluded.',
      example: '70% covered → 0.70.',
      timing: 'Each scored decision; no scored ticks → 0.',
    }
  if (component === 'team_target_distance_score_v1')
    return {
      calculation: `Reward = 1 − (mean distance beyond the ${targetRadius} ÷ field diagonal). Peers inside contribute zero excess distance.`,
      example: 'Mean excess distance = 20% of diagonal → 0.80; all peers inside → 1.',
      timing: 'Available peers only. No available peers or no scored ticks → 0.',
    }
  if (component === 'available_target_arrival_fraction_v1')
    return {
      calculation: 'Available peers within the horizontal target radius ÷ available peers.',
      example: 'Two of three peers inside → 0.667; with weight 0.5 → 0.333 reward.',
      timing:
        'Every completed decision while present. Leaving loses that share. Forced or mixed event windows and no available peers → 0.',
    }
  if (component === 'survivor_critical_delivery_fraction_v1')
    return {
      calculation:
        'Reward = critical traffic delivered ÷ requested between surviving nodes. Failed-node traffic excluded.',
      example: '70% delivered → 0.70.',
      timing: 'Fully post-failure windows only; otherwise 0. No demand or no scored ticks → 0.',
    }
  if (component === 'jammed_traffic_delivery_fraction_v1')
    return {
      calculation: 'Reward = total traffic delivered ÷ total traffic requested.',
      example: '70% delivered → 0.70.',
      timing:
        'Windows fully after emission starts only; otherwise 0. No demand or no scored ticks → 0.',
    }
  return null
}

/** Plain names for the four static October 23 reward conditions. Other IDs stay unchanged. */
export function rewardComponentLabel(component: string, schema?: unknown): string {
  if (Object.prototype.hasOwnProperty.call(GRADED_REWARD_LABELS, component))
    return GRADED_REWARD_LABELS[component]
  const details = record(record(record(schema).component_details)[component])
  const parameters = record(details.parameters)
  if (component === 'level0_coverage_v1') {
    const target = parameters.target
    return typeof target === 'number' && Number.isFinite(target)
      ? `Connected outdoor coverage ≥ ${(target * 100).toFixed(2)}%`
      : 'Connected outdoor coverage ≥ target'
  }
  if (component === 'level0_investigation_v1') {
    const radius = record(record(details.contract).mission).team_radius_m
    return typeof radius === 'number' && Number.isFinite(radius)
      ? `All available peers within ${radius} m of target`
      : 'All available peers within target radius'
  }
  if (component === 'level0_recovery_v1') return 'Survivor traffic delivery ≥ 90% after failure'
  if (component === 'level0_jamming_v1') return 'Traffic delivery ≥ 90% during jamming'
  return component
}

/** A condition and its per-decision payoff; null preserves historical campaign labels. */
export function staticRewardLabel(schema: unknown): string | null {
  const components = record(schema).components
  if (!Array.isArray(components) || components.length !== 1 || typeof components[0] !== 'string')
    return null
  const component = components[0]
  if (!component.startsWith('level0_')) return null
  const name = rewardComponentLabel(component, schema)
  return name === component ? null : `${name} (+1 / −0.001)`
}

/** Labels for people, derived from the saved reward schema rather than a row-name guess. */
export function rewardLabel(evaluation: Evaluation): string {
  const selected = record(evaluation.rewardSchema).components
  if (
    Array.isArray(selected) &&
    selected.length === 1 &&
    typeof selected[0] === 'string' &&
    Object.prototype.hasOwnProperty.call(GRADED_REWARD_LABELS, selected[0])
  )
    return GRADED_REWARD_LABELS[selected[0]]
  const simple = staticRewardLabel(evaluation.rewardSchema)
  if (simple) return simple
  const schema =
    evaluation.rewardSchema &&
    typeof evaluation.rewardSchema === 'object' &&
    !Array.isArray(evaluation.rewardSchema)
      ? (evaluation.rewardSchema as Record<string, unknown>)
      : {}
  const components = Array.isArray(schema.components)
    ? schema.components.filter((value: unknown): value is string => typeof value === 'string')
    : []
  if (components.length > 1 && components.every((c) => c in GRADED_REWARD_LABELS)) {
    const weights = Array.isArray(schema.weights) ? schema.weights : []
    return components
      .map((c, i) => {
        const label = GRADED_REWARD_LABELS[c].replace(' (0–1)', '')
        return typeof weights[i] === 'number' ? `${weights[i]} × ${label}` : label
      })
      .join(' + ')
  }
  if (components.includes('team_distance_delta_v2')) return 'Investigation guided'
  if (components.includes('post_failure_service_v2')) return 'Recovery guided'
  if (components.includes('coverage_target_maintained_v2')) return 'Coverage with settling'
  if (components.includes('service_settle_cost_v2')) return 'Jamming service and settling'
  if (components.includes('team_approach_cost_v1')) return 'Investigation phased'
  if (components.includes('recovery_response_deficit_v1')) return 'Recovery phased'
  if (components.includes('team_goal_proximity_v1')) return 'Investigation focus'
  if (components.includes('survivor_service_maintained_v1')) return 'Recovery focus'
  if (components.includes('decision_travel_v1') && components.includes('sinr_quality'))
    return 'Service and SINR focus'
  if (components.includes('decision_travel_v1')) return 'Coverage focus'
  if (components.length === 1 && components[0] === 'service_success') return 'Binary +1/−1'
  if (components.includes('team_arrival_fraction')) return 'Team investigation'
  if (components.includes('investigation_complete')) return 'Connected investigation'
  if (components.includes('recovery_complete')) return 'Recovery priority'
  if (components.includes('weak_service_deficit')) return 'Coverage priority'
  if (components.includes('adaptive_movement_cost')) return 'Dynamic Balance'
  if (components.length === 1 && components[0] === 'sinr_quality') return 'SINR quality (0–1)'
  if (components.length === 1 && components[0] === 'delivery_ratio') return 'Delivery'
  if (components.length === 1 && components[0] === 'throughput_mbps') return 'Throughput'
  if (components.includes('unmet_sinr_quality') && components.includes('connectivity'))
    return 'Service + mesh'
  if (components.includes('sinr_quality') && components.includes('span_travel_fraction'))
    return 'SINR − span travel'
  if (
    components.length === 2 &&
    components[0] === 'sinr_quality' &&
    components[1] === 'travel_fraction'
  ) {
    const weights = Array.isArray(schema.weights) ? schema.weights : []
    if (typeof weights[1] === 'number' && weights[1] < 0) return 'SINR quality − movement'
  }
  if (components.length > 3 && components.includes('unsafe_proximity_fraction'))
    return 'Service + safety'
  if (components.length === 0) return evaluation.label
  if (components.length > 3) return 'Combined reward'
  return components.map((component) => component.replace(/_/g, ' ')).join(' + ')
}

export function policyLabel(policy: string): string {
  if (policy === 'model') return 'Trained model'
  if (policy === 'hold') return 'Hold position'
  if (policy === 'random_valid') return 'Random valid moves'
  if (policy === 'scripted') return 'Scripted mission reference'
  if (policy === 'geometric') return 'Geometric'
  if (policy === 'optimization') return 'Optimization'
  return policy.replace(/_/g, ' ')
}

const OBJECTIVE_LABELS: Record<string, string> = {
  coverage: 'Coverage',
  balanced: 'Balanced',
  resilience: 'Resilience',
}

/** Baseline placement objective; unknown strings are shown raw (sanitized). */
export function objectiveLabel(s: string | null): string {
  if (s === null) return 'unknown'
  if (Object.prototype.hasOwnProperty.call(OBJECTIVE_LABELS, s)) return OBJECTIVE_LABELS[s]
  return sanitizeLabel(s) ?? 'unknown'
}

const BASELINE_STATUS_LABELS: Record<BaselineStatus, string> = {
  preparing: 'Preparing',
  prepared: 'Prepared',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
  interrupted: 'Interrupted',
}

export function baselineStatusLabel(s: BaselineStatus | 'unknown' | null): string {
  if (s === null || s === 'unknown') return 'Unknown'
  return Object.prototype.hasOwnProperty.call(BASELINE_STATUS_LABELS, s)
    ? BASELINE_STATUS_LABELS[s]
    : 'Unknown'
}

export function experimentLabel(name: string): string {
  const mission = name.match(
    /^(rural|urban)-(coverage|investigation|recovery|jamming)-(small|large|extra-large)$/
  )
  if (mission) {
    const [, environment, goal, size] = mission
    const peers = size === 'small' ? 3 : size === 'large' ? 6 : 9
    return `${environment === 'rural' ? 'Rural RMa' : 'Urban UMa'} · ${goal.charAt(0).toUpperCase() + goal.slice(1)} · ${peers} peers`
  }
  const raw = name.replace(/^rl-/, '')
  const number = raw.match(/^(\d+)-/)?.[1]
  const prefix = number?.length === 1 ? `${number} · ` : ''
  const short = raw.replace(/^\d+-/, '')
  return (
    prefix +
    short
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase())
      .replace(/Sinr/g, 'SINR')
      .replace(/\bVs\b/g, 'vs')
      .replace(/\b(\d+)km\b/gi, '$1 km')
      .replace(/\b(\d+)mbps\b/gi, '$1 Mbps')
      .replace(/\b(\d+)seed\b/gi, '$1 seeds')
      .replace(/\b(\d+)ep\b/gi, '$1 episodes')
  )
}

/**
 * A snake_case key (reward component, action meaning, config field) as words:
 * sinr_quality -> SINR quality, delivery_ratio -> Delivery ratio.
 */
export function componentLabel(key: string): string {
  const t = key
    .replace(/_+/g, ' ')
    .trim()
    .replace(/\b(sinr|snr|los|nlos|mcs)\b/gi, (w) => w.toUpperCase())
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** A manifest's model_selection, worded so a final model is never read as a best checkpoint */
export function modelSelectionLabel(selection: string | null | undefined): string {
  if (selection === 'final') return 'Final model'
  if (selection === 'best') return 'Best checkpoint'
  return selection ?? 'not recorded'
}
