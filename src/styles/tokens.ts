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

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10] as const
