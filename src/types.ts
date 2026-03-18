export type NodeType = 'ground' | 'air' | 'bs' | 'vehicle'

export interface LogEntry {
  id: number
  timestamp: number
  wallTime: Date
  level: 'info' | 'warn' | 'event' | 'error'
  message: string
}

export interface NodeState {
  id: number
  x: number
  y: number
  z: number
  nodeType: NodeType
  active: boolean
}

export interface LinkState {
  nodeA: number
  nodeB: number
  dist: number
  pathloss: number
  rxPower: number
  condition: 'LOS' | 'NLOS'
  connected: boolean
}

export interface SimFrame {
  time: number
  nodes: NodeState[]
  links: LinkState[]
}

export interface SimMeta {
  scenario: string
  frequency: number // Hz
  txPower: number // dBm
  numNodes: number
  simDuration: number // ms
  tickMs: number // measurement interval ms (frame spacing)
  dimensions: 1 | 2 | 3
}
