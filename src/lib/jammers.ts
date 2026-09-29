import type { JammerPoint, JammerState } from '../types.ts'

type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {}
const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
const point = (value: unknown): JammerPoint => {
  const p = record(value)
  return { x: number(p.x), y: number(p.y), z: number(p.z) }
}

/** Read the exact saved jammer input, not a guess from mesh-node positions. */
export function parseJammers(json: string): JammerState[] {
  try {
    const raw = JSON.parse(json) as unknown
    const entries = Array.isArray(raw) ? raw : record(raw).jammers
    if (!Array.isArray(entries)) return []
    return entries.map((value, index) => {
      const j = record(value)
      const v = record(j.velocity)
      return {
        id: typeof j.id === 'string' ? j.id : `jammer-${index}`,
        enabled: j.enabled !== false,
        type: typeof j.type === 'string' ? j.type : 'constant',
        position: point(j.position),
        velocity: { vx: number(v.vx), vy: number(v.vy), vz: number(v.vz) },
        waypoints: (Array.isArray(j.waypoints) ? j.waypoints : [])
          .map((w) => ({ ...point(w), t: number(record(w).t) }))
          .sort((a, b) => a.t - b.t),
        intervals: (Array.isArray(j.intervals) ? j.intervals : []).map((iv) => {
          const interval = record(iv)
          return { start: number(interval.start), end: number(interval.end) }
        }),
        targetFreqMhz: (Array.isArray(j.target_freq) ? j.target_freq : []).filter(
          (f): f is number => typeof f === 'number' && Number.isFinite(f)
        ),
        txPowerDbm: number(j.tx_power_dbm, 25),
        dutyCycle: number(j.duty_cycle, 1),
        maxRangeM: number(j.max_range_m),
        beamwidthDeg: number(j.beamwidth_deg, 360),
        azimuthDeg: number(j.azimuth_deg),
      }
    })
  } catch {
    return []
  }
}

/** Waypoints and constant velocity mirror the simulator's jammer mobility modes. */
export function jammerPositionAt(jammer: JammerState, timeS: number): JammerPoint {
  const waypoints = jammer.waypoints
  if (waypoints.length) {
    if (timeS <= waypoints[0].t) return waypoints[0]
    for (let i = 1; i < waypoints.length; i++) {
      const previous = waypoints[i - 1]
      const next = waypoints[i]
      if (timeS <= next.t) {
        const fraction = next.t === previous.t ? 1 : (timeS - previous.t) / (next.t - previous.t)
        return {
          x: previous.x + (next.x - previous.x) * fraction,
          y: previous.y + (next.y - previous.y) * fraction,
          z: previous.z + (next.z - previous.z) * fraction,
        }
      }
    }
    return waypoints[waypoints.length - 1]
  }
  const { position, velocity } = jammer
  return {
    x: position.x + velocity.vx * timeS,
    y: position.y + velocity.vy * timeS,
    z: position.z + velocity.vz * timeS,
  }
}

export type JammerActivity = 'on' | 'off' | 'bursty'

/** Random burst draws are not saved, so do not claim to know their exact state. */
export function jammerActivity(
  jammer: JammerState,
  timeS: number,
  carrierHz: number
): JammerActivity {
  if (!jammer.enabled || jammer.dutyCycle <= 0) return 'off'
  if (
    jammer.intervals.length &&
    !jammer.intervals.some((iv) => timeS >= iv.start && timeS < iv.end)
  )
    return 'off'
  const carrierMhz = carrierHz / 1e6
  if (jammer.targetFreqMhz.length && carrierMhz > 0) {
    const freqs = jammer.targetFreqMhz
    const inBand =
      freqs.length === 1
        ? Math.abs(carrierMhz - freqs[0]) <= 2.5
        : carrierMhz >= Math.min(...freqs) && carrierMhz <= Math.max(...freqs)
    if (!inBand) return 'off'
  }
  return jammer.type === 'random' && jammer.dutyCycle < 1 ? 'bursty' : 'on'
}
