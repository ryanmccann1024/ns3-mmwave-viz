import type { Evaluation } from './experimentIndex'
import type { BaselineStatus } from './baselineManifest.ts'
import { sanitizeLabel } from './baselineManifest.ts'

/** Labels for people, derived from the saved reward schema rather than a row-name guess. */
export function rewardLabel(evaluation: Evaluation): string {
  const schema =
    evaluation.rewardSchema &&
    typeof evaluation.rewardSchema === 'object' &&
    !Array.isArray(evaluation.rewardSchema)
      ? (evaluation.rewardSchema as Record<string, unknown>)
      : {}
  const components = Array.isArray(schema.components)
    ? schema.components.filter((value: unknown): value is string => typeof value === 'string')
    : []
  if (components.length === 1 && components[0] === 'service_success') return 'Binary +1/−1'
  if (components.length === 1 && components[0] === 'sinr_quality') return 'SINR quality (0–1)'
  if (
    components.length === 2 &&
    components[0] === 'sinr_quality' &&
    components[1] === 'travel_fraction'
  ) {
    const weights = Array.isArray(schema.weights) ? schema.weights : []
    if (typeof weights[1] === 'number' && weights[1] < 0) return 'SINR quality − movement'
  }
  if (components.length === 0) return evaluation.label
  return components.map((component) => component.replace(/_/g, ' ')).join(' + ')
}

export function policyLabel(policy: string): string {
  if (policy === 'model') return 'Trained model'
  if (policy === 'hold') return 'Hold position'
  if (policy === 'random_valid') return 'Random valid moves'
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
