import type { NodeType } from '../types'

export const NODE_COLORS: Record<NodeType, string> = {
  ground: '#0ea5e9',
  air: '#f59e0b',
  bs: '#a855f7',
  vehicle: '#10b981',
  peer: '#e2e8f0',
  gateway: '#f43f5e',
}
export const NODE_COLOR_INACTIVE = '#94a3b8'
/** A node that went down mid-run: its 3D burst and beacon, and the timeline marker */
export const NODE_FAILURE_COLOR = '#ef4444'
/** An investigation goal on the ground, and the same goal once the investigator is inside it */
export const MISSION_TARGET_COLOR = '#f59e0b'
export const MISSION_REACHED_COLOR = '#22c55e'
/**
 * Jamming map: one rose hue, light to dark, in 5 dB steps of jammer power over the noise
 * floor. The first band is jamming weaker than the noise; the last is 30 dB and above.
 */
export const JAMMER_FIELD_STEP_DB = 5
export const JAMMER_FIELD_BANDS = [
  { fromDb: -10, label: 'Under noise', color: '#fecdd3' },
  { fromDb: 0, label: '0–5 dB', color: '#fda4af' },
  { fromDb: 5, label: '5–10 dB', color: '#fb7185' },
  { fromDb: 10, label: '10–15 dB', color: '#f43f5e' },
  { fromDb: 15, label: '15–20 dB', color: '#e11d48' },
  { fromDb: 20, label: '20–25 dB', color: '#be123c' },
  { fromDb: 25, label: '25–30 dB', color: '#9f1239' },
  { fromDb: 30, label: '30 dB +', color: '#4c0519' },
] as const
export const NODE_COLOR_DIMMED = '#cbd5e1'
export const NODE_COLOR_SELECTED = '#0f172a'

export const LINK_COLORS = {
  losConnected: '#16a34a',
  nlosConnected: '#eab308',
  disconnected: '#9ca3af',
} as const

export const NODE_SIZES: Record<NodeType, number> = {
  air: 4,
  bs: 3,
  ground: 3.5,
  vehicle: 3.5,
  peer: 3.5,
  gateway: 4.5,
}

export const NODE_LABELS: Record<NodeType, string> = {
  air: 'UAV',
  bs: 'BS',
  vehicle: 'VEH',
  ground: 'GND',
  peer: 'PEER',
  gateway: 'GW',
}

export const NODE_BADGE_CLASSES: Record<NodeType, string> = {
  ground: 'bg-sky-100 text-sky-800 border border-sky-200',
  air: 'bg-amber-100 text-amber-800 border border-amber-200',
  bs: 'bg-purple-100 text-purple-800 border border-purple-200',
  vehicle: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  peer: 'bg-slate-100 text-slate-800 border border-slate-200',
  gateway: 'bg-rose-100 text-rose-800 border border-rose-200',
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  ground: 'GROUND',
  air: 'AIR / UAV',
  bs: 'BASE STATION',
  vehicle: 'VEHICLE',
  peer: 'PEER',
  gateway: 'GATEWAY',
}

export const LINK_BADGE_CLASSES = {
  LOS: 'bg-emerald-100 text-emerald-800',
  NLOS: 'bg-yellow-100 text-yellow-800',
  connected: 'bg-emerald-100 text-emerald-800',
  disconnected: 'bg-gray-100 text-gray-600',
} as const

// Mission campaign phases, in an order that passes the colourblind-separation check
// (teal and pink are never adjacent). Marks use PHASE_COLORS; pills the matching tints.
export const PHASE_COLORS = ['#0284c7', '#db2777', '#d97706', '#0d9488', '#7c3aed'] as const
export const PHASE_BADGE_CLASSES = [
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-violet-100 text-violet-800 border-violet-200',
] as const
export const BASELINE_MARK_COLOR = '#94a3b8'
export const phaseColor = (phase: number | null) =>
  phase == null || phase < 1 ? BASELINE_MARK_COLOR : PHASE_COLORS[(phase - 1) % PHASE_COLORS.length]
export const phaseBadgeClass = (phase: number | null) =>
  phase == null || phase < 1
    ? 'bg-slate-100 text-slate-700 border-slate-200'
    : PHASE_BADGE_CLASSES[(phase - 1) % PHASE_BADGE_CLASSES.length]

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10] as const

// Policies other than the trained model take warm hues, so they never match a per-node
// trail colour (cool hues, below) in the 3D replay
export const TRAIL_COLORS: Record<string, string> = {
  model: '#2563eb',
  hold: '#f472b6',
  random_valid: '#eab308',
  scripted: '#dc2626',
  geometric: '#ea580c',
  optimization: '#92400e',
}
export const TRAIL_COLOR_DEFAULT = '#b45309'
export const trailColor = (policy: string) => TRAIL_COLORS[policy] ?? TRAIL_COLOR_DEFAULT

/** Per-node path colours for the live replay: cool hues only (warm hues are other policies;
 *  yellow/white are road markings) */
export const NODE_TRAIL_PALETTE = [
  '#3b82f6',
  '#a855f7',
  '#22d3ee',
  '#84cc16',
  '#6366f1',
  '#d946ef',
  '#14b8a6',
  '#93c5fd',
  '#10b981',
]
export const nodeTrailColor = (index: number) =>
  NODE_TRAIL_PALETTE[
    ((index % NODE_TRAIL_PALETTE.length) + NODE_TRAIL_PALETTE.length) % NODE_TRAIL_PALETTE.length
  ]

// Actions an RL policy can send (validated categorical order; hold is neutral: no move)
export const ACTION_COLORS: Record<string, string> = {
  west: '#0d9488',
  east: '#d97706',
  south: '#7c3aed',
  north: '#0284c7',
  hold: '#94a3b8',
}
const ACTION_FALLBACK = ['#0d9488', '#d97706', '#7c3aed', '#0284c7']
export const actionColor = (action: string, i: number) =>
  ACTION_COLORS[action] ?? ACTION_FALLBACK[i % ACTION_FALLBACK.length]

// Reward components, in the order the reward schema lists them (validated categorical order,
// 6 slots, so a typical schema never repeats a hue)
const COMPONENT_COLORS = ['#0d9488', '#7c3aed', '#d97706', '#0284c7', '#db2777', '#65a30d']
export const componentColor = (i: number) => COMPONENT_COLORS[i % COMPONENT_COLORS.length]
