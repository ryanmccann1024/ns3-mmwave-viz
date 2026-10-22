import type { StepRecord, TelemetryContract } from './episodeTelemetry.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
export type MissionPoint = {
  time: number
  service: number | null
  los: number | null
  sinr: number | null
  coverage: number | null
  arrival: number | null
  travel: number
  distance: number | null
}
export function missionTimeline(steps: StepRecord[], contract: TelemetryContract): MissionPoint[] {
  let previous: number[][] | null = null
  let travel = 0
  const controlled = new Set(contract.slot_node_ids.filter(Boolean))
  return steps.map((step) => {
    const facts = rec(step.facts),
      state = rec(facts.mission_state),
      window = rec(facts.window)
    const nodes = (Array.isArray(facts.nodes) ? facts.nodes : []) as number[][]
    const active = (
      Array.isArray(facts.node_available) ? facts.node_available : nodes.map(() => true)
    ) as boolean[]
    const links = (Array.isArray(facts.links) ? facts.links : []) as number[][]
    if (previous)
      nodes.forEach((n, i) => {
        if (controlled.has(contract.node_ids[i]) && previous?.[i])
          travel += Math.hypot(n[0] - previous[i][0], n[1] - previous[i][1])
      })
    previous = nodes
    let index = 0
    const pairs: number[][] = []
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const link = links[index++]
        if (active[i] && active[j] && link) pairs.push(link)
      }
    const valid = pairs.map((p) => p[0]).filter((v) => Number.isFinite(v) && v > -900)
    const demand = Number(window.demand_mbps_sum)
    const service =
      typeof state.survivor_delivery === 'number'
        ? state.survivor_delivery
        : demand > 0
          ? Number(window.delivered_mbps_sum) / demand
          : null
    return {
      time: step.time_s,
      service: service === null ? null : service * 100,
      los: pairs.length ? (pairs.reduce((s, p) => s + p[2], 0) / pairs.length) * 100 : null,
      sinr: valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : null,
      coverage:
        typeof rec(facts.coverage).fraction === 'number'
          ? Number(rec(facts.coverage).fraction) * 100
          : null,
      arrival:
        typeof state.team_arrival_fraction === 'number' ? state.team_arrival_fraction * 100 : null,
      travel,
      distance: typeof state.distance_m === 'number' ? state.distance_m : null,
    }
  })
}
