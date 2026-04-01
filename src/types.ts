export type NodeType = 'ground' | 'air' | 'bs' | 'vehicle' | 'peer' | 'gateway'

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
  pathloss?: number
  rxPower?: number
  sinr?: number
  condition: 'LOS' | 'NLOS'
  conditionReason?: string
  connected: boolean
  capacityMbps?: number
  deliveredMbps?: number
  hopCount?: number
}

export interface FlowState {
  src: number
  dst: number
  demandMbps: number
  deliveredMbps: number
  latencyMs: number
  hopCount: number
  routable: boolean
}

export interface RouteState {
  src: number
  dst: number
  path: number[]
  bottleneckMbps: number
  hopCount: number
  routable: boolean
}

export interface McsState {
  nodeA: number
  nodeB: number
  mcsIndex: number
  spectralEff: number
}

export interface RxPowerState {
  nodeA: number
  nodeB: number
  rxPowerDbm: number
}

export interface BuildingState {
  id: number
  /** center X in sim coordinates */
  x: number
  /** center Y in sim coordinates */
  y: number
  /** base Z (bottom of building, usually 0) */
  z: number
  width: number
  depth: number
  height: number
}

export interface SimFrame {
  time: number
  nodes: NodeState[]
  links: LinkState[]
  flows: FlowState[]
  routes: RouteState[]
  mcs: McsState[]
  rxPower: RxPowerState[]
}

export interface SimMeta {
  scenario: string
  frequency: number // Hz
  txPower: number // dBm
  numNodes: number
  simDuration: number // ms
  tickMs: number // measurement interval ms (frame spacing)
  dimensions: 1 | 2 | 3
  rainRate: number // mm/hr, 0 = no rain
  channelModel: string
  flowTopology: string
  trafficModel: string
}
