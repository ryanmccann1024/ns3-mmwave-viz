import type { NodeType } from '../types'

export const NODE_COLORS: Record<NodeType, string> = {
  ground: '#7dd3fc',
  air: '#fbbf24',
  bs: '#c084fc',
  vehicle: '#34d399',
}
export const NODE_COLOR_INACTIVE = '#334155'
export const NODE_COLOR_DIMMED = '#1e3a4a'
export const NODE_COLOR_SELECTED = '#ffffff'

export const LINK_COLORS = {
  losConnected: '#22c55e',
  nlosConnected: '#f97316',
  disconnected: '#ef4444',
} as const

export const NODE_SIZES: Record<NodeType, number> = {
  air: 4,
  bs: 3,
  ground: 3.5,
  vehicle: 3.5,
}

export const NODE_LABELS: Record<NodeType, string> = {
  air: 'UAV',
  bs: 'BS',
  vehicle: 'VEH',
  ground: 'GND',
}

export const NODE_BADGE_CLASSES: Record<NodeType, string> = {
  ground: 'bg-slate-700 text-slate-300',
  air: 'bg-sky-900/60 text-sky-300 border border-sky-700',
  bs: 'bg-purple-900/60 text-purple-300 border border-purple-700',
  vehicle: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700',
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  ground: 'GROUND',
  air: 'AIR / UAV',
  bs: 'BASE STATION',
  vehicle: 'VEHICLE',
}

export const LINK_BADGE_CLASSES = {
  LOS: 'bg-emerald-900/60 text-emerald-300',
  NLOS: 'bg-orange-900/60 text-orange-300',
  connected: 'bg-emerald-900/60 text-emerald-300',
  disconnected: 'bg-red-900/60 text-red-300',
} as const

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10] as const
