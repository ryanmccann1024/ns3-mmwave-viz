import type { NodeState } from '../types'
import { buildNodeMapping } from './nodeIdentity.ts'

/** Where an investigation mission sends its investigator, from contract.mission */
export interface InvestigationTarget {
  /** contract node id of the investigator, e.g. "drone-1" */
  teamInvestigation?: boolean
  teamRadiusM?: number
  investigatorId: string
  x: number
  y: number
  arrivalRadiusM: number
  coverageRadiusM: number
  dwellS: number | null
}

const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Reads an investigation target from a contract's `mission` block. Recovery and coverage
 * missions carry goal fields too, but only an investigation has a target to show.
 */
export function investigationTarget(mission: unknown): InvestigationTarget | null {
  if (typeof mission !== 'object' || mission === null) return null
  const m = mission as Record<string, unknown>
  if (m.kind !== 'investigation') return null
  const x = finite(m.goal_x)
  const y = finite(m.goal_y)
  const investigatorId = typeof m.investigator_id === 'string' ? m.investigator_id : ''
  if (x === null || y === null || investigatorId === '') return null
  const arrival = finite(m.arrival_radius_m)
  const coverage = finite(m.coverage_radius_m)
  return {
    investigatorId,
    ...(m.team_investigation === true
      ? { teamInvestigation: true, teamRadiusM: finite(m.team_radius_m) ?? 50 }
      : {}),
    x,
    y,
    arrivalRadiusM: arrival !== null && arrival > 0 ? arrival : 0,
    coverageRadiusM: coverage !== null && coverage > 0 ? coverage : 0,
    dwellS: finite(m.dwell_s),
  }
}

/** Horizontal distance from a node to the target, in metres */
export function distanceToTarget(node: Pick<NodeState, 'x' | 'y'>, target: InvestigationTarget) {
  return Math.hypot(node.x - target.x, node.y - target.y)
}

/** What the 3D scene draws for a mission: its target, and the investigator's CSV node id */
export interface MissionOverlay {
  target: InvestigationTarget
  /** null when the contract's node order cannot be checked against the replay */
  investigatorCsvId: number | null
}

/**
 * The investigation overlay for one replay. The investigator is found through the checked
 * ordinal mapping between contract node ids and CSV ids, so no decision telemetry is needed.
 */
export function missionOverlay(
  contract:
    | { node_ids: readonly string[]; slot_node_ids: readonly (string | null)[]; mission?: unknown }
    | null
    | undefined,
  csvNodeIds: ReadonlySet<number> | null,
  archivedNodeIds?: readonly string[]
): MissionOverlay | null {
  const target = investigationTarget(contract?.mission)
  if (!target || !contract) return null
  if (!csvNodeIds) return { target, investigatorCsvId: null }
  const ids = buildNodeMapping(contract, csvNodeIds, archivedNodeIds)
  return {
    target,
    investigatorCsvId:
      ids.status === 'mapped' ? (ids.csvIdByContractId.get(target.investigatorId) ?? null) : null,
  }
}
