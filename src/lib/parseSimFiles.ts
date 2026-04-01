import Papa from 'papaparse'
import type {
  SimFrame,
  NodeState,
  LinkState,
  SimMeta,
  NodeType,
  BuildingState,
  FlowState,
  RouteState,
  McsState,
  RxPowerState,
} from '../types'

interface CsvRow {
  [key: string]: string
}

export function parseMeta(text: string): SimMeta {
  const meta: Partial<SimMeta> = {}
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) break
    const m = line.match(/^#\s*(\w+)=(.+)$/)
    if (!m) continue
    const [, key, val] = m
    if (key === 'scenario') meta.scenario = val.trim()
    if (key === 'frequency') meta.frequency = parseFloat(val)
    if (key === 'txPower') meta.txPower = parseFloat(val)
    if (key === 'numNodes') meta.numNodes = parseInt(val)
    if (key === 'simDuration') meta.simDuration = parseInt(val)
    if (key === 'tickMs') meta.tickMs = parseInt(val)
    if (key === 'dimensions') meta.dimensions = parseInt(val) as 1 | 2 | 3
    if (key === 'rainRate') meta.rainRate = parseFloat(val)
    if (key === 'channelModel') meta.channelModel = val.trim()
    if (key === 'flowTopology') meta.flowTopology = val.trim()
    if (key === 'trafficModel') meta.trafficModel = val.trim()
  }
  return {
    scenario: meta.scenario ?? 'Unknown',
    frequency: meta.frequency ?? 28e9,
    txPower: meta.txPower ?? 23,
    numNodes: meta.numNodes ?? 0,
    simDuration: meta.simDuration ?? 0,
    tickMs: meta.tickMs ?? 100,
    dimensions: meta.dimensions ?? 3,
    rainRate: meta.rainRate ?? 0,
    channelModel: meta.channelModel ?? '',
    flowTopology: meta.flowTopology ?? '',
    trafficModel: meta.trafficModel ?? '',
  }
}

function stripComments(t: string) {
  return t
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
}

/**
 * Case-insensitive lookup of a field in a CSV row.
 * PapaParse preserves header casing, so we normalise to find the value.
 */
function field(row: Record<string, string>, name: string): string {
  const lower = name.toLowerCase()
  for (const k of Object.keys(row)) {
    if (k.trim().toLowerCase() === lower) return row[k] ?? ''
  }
  return ''
}

function normaliseCondition(raw: string): 'LOS' | 'NLOS' {
  const v = raw.trim().toUpperCase()
  if (v === 'LOS') return 'LOS'
  return 'NLOS'
}

function parseCSV(text: string): CsvRow[] {
  return Papa.parse<CsvRow>(stripComments(text), {
    header: true,
    skipEmptyLines: true,
  }).data
}

/** Parse buildings.json — supports bbox (x_min/x_max/y_min/y_max/z_min/z_max) or
 *  centre+dims (x/y/z/width/depth/height) formats, and a top-level "buildings" wrapper. */
export function parseBuildings(json: string): BuildingState[] {
  try {
    let raw = JSON.parse(json)
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.buildings)) {
      raw = raw.buildings
    }
    if (!Array.isArray(raw)) return []

    return (raw as Record<string, unknown>[]).map((b, i) => {
      // Support nested bounds: { bounds: { x_min, x_max, ... } }
      const bbox = (b.bounds as Record<string, number>) ?? b
      if ('x_min' in bbox && 'x_max' in bbox) {
        return {
          id: typeof b.id === 'number' ? b.id : i,
          x: (bbox.x_min + bbox.x_max) / 2,
          y: (bbox.y_min + bbox.y_max) / 2,
          z: bbox.z_min ?? 0,
          width: bbox.x_max - bbox.x_min,
          depth: bbox.y_max - bbox.y_min,
          height: (bbox.z_max ?? 10) - (bbox.z_min ?? 0),
        }
      }
      const flat = b as Record<string, number>
      return {
        id: typeof flat.id === 'number' ? flat.id : i,
        x: flat.x ?? 0,
        y: flat.y ?? 0,
        z: flat.z ?? 0,
        width: flat.width ?? 20,
        depth: flat.depth ?? 20,
        height: flat.height ?? 10,
      }
    })
  } catch {
    return []
  }
}

/** Detect the gateway node from flows: in gateway topology the gateway appears as src or dst in every flow. */
function detectGatewayNode(flowsByTime: Map<number, FlowState[]>): number | null {
  const firstFlows = flowsByTime.values().next().value as FlowState[] | undefined
  if (!firstFlows || firstFlows.length < 2) return null

  // Count how often each node appears as src or dst
  const counts = new Map<number, number>()
  for (const f of firstFlows) {
    counts.set(f.src, (counts.get(f.src) ?? 0) + 1)
    counts.set(f.dst, (counts.get(f.dst) ?? 0) + 1)
  }
  // Gateway appears in every flow
  for (const [nodeId, count] of counts) {
    if (count === firstFlows.length) return nodeId
  }
  return null
}

export interface ParseFilesInput {
  linksText: string
  posText: string
  flowsText?: string
  routesText?: string
  nodesJsonText?: string
  mcsText?: string
  rxPowerText?: string
}

export function parseFiles(input: ParseFilesInput): SimFrame[] {
  const { linksText, posText, flowsText, routesText, nodesJsonText, mcsText, rxPowerText } = input

  const posRows = parseCSV(posText)
  const linkRows = parseCSV(linksText)

  // Parse optional new CSVs
  const flowRows = flowsText ? parseCSV(flowsText) : []
  const routeRows = routesText ? parseCSV(routesText) : []

  // Parse nodes.json for role overrides
  let nodeRoles: Map<number, string> | undefined
  if (nodesJsonText) {
    try {
      const nodesArr = JSON.parse(nodesJsonText)
      if (Array.isArray(nodesArr)) {
        nodeRoles = new Map()
        nodesArr.forEach((n: { role?: string }, i: number) => {
          if (n.role) nodeRoles!.set(i, n.role)
        })
      }
    } catch {
      // ignore
    }
  }

  // -- Positions --
  const posByTime = new Map<number, NodeState[]>()
  for (const r of posRows) {
    const t = parseFloat((r as Record<string, string>).time_s)
    if (!posByTime.has(t)) posByTime.set(t, [])
    const nodeId = parseInt((r as Record<string, string>).node_id)
    let nodeType = ((r as Record<string, string>).node_type?.trim() as NodeType) ?? 'ground'
    // Override with role from nodes.json if available
    if (nodeRoles?.has(nodeId)) {
      const role = nodeRoles.get(nodeId)!
      if (role === 'gateway') nodeType = 'gateway'
    }
    posByTime.get(t)!.push({
      id: nodeId,
      x: parseFloat((r as Record<string, string>).x),
      y: parseFloat((r as Record<string, string>).y),
      z: parseFloat((r as Record<string, string>).z),
      nodeType,
      active:
        (r as Record<string, string>).active !== undefined
          ? (r as Record<string, string>).active.trim() !== '0'
          : true,
    })
  }

  // -- Links --
  const linksByTime = new Map<number, LinkState[]>()
  for (const r of linkRows) {
    const t = parseFloat(field(r, 'time_s'))
    if (!linksByTime.has(t)) linksByTime.set(t, [])
    const sinrRaw =
      field(r, 'sinr_db') || field(r, 'sinr_dB') || field(r, 'snr_dB') || field(r, 'snr')
    const sinr = sinrRaw ? parseFloat(sinrRaw) : undefined
    const capRaw = field(r, 'capacity_mbps')
    const delRaw = field(r, 'delivered_mbps')
    const hopRaw = field(r, 'hop_count')
    linksByTime.get(t)!.push({
      nodeA: parseInt(field(r, 'node_a')),
      nodeB: parseInt(field(r, 'node_b')),
      dist: parseFloat(field(r, 'dist_m')),
      pathloss: parseFloat(field(r, 'pathloss_dB')),
      rxPower: parseFloat(field(r, 'rx_power_dBm')),
      sinr: sinr !== undefined && !isNaN(sinr) ? sinr : undefined,
      condition: normaliseCondition(field(r, 'condition')),
      conditionReason: field(r, 'condition_reason') || undefined,
      connected: capRaw ? parseFloat(capRaw) > 0 : true,
      capacityMbps: capRaw ? parseFloat(capRaw) : undefined,
      deliveredMbps: delRaw ? parseFloat(delRaw) : undefined,
      hopCount: hopRaw ? parseInt(hopRaw) : undefined,
    })
  }

  // -- Flows --
  const flowsByTime = new Map<number, FlowState[]>()
  for (const r of flowRows) {
    const t = parseFloat(field(r, 'time_s'))
    if (!flowsByTime.has(t)) flowsByTime.set(t, [])
    flowsByTime.get(t)!.push({
      src: parseInt(field(r, 'src')),
      dst: parseInt(field(r, 'dst')),
      demandMbps: parseFloat(field(r, 'demand_mbps')),
      deliveredMbps: parseFloat(field(r, 'delivered_mbps')),
      latencyMs: parseFloat(field(r, 'latency_ms')),
      hopCount: parseInt(field(r, 'hop_count')),
      routable: field(r, 'routable') === '1',
    })
  }

  // -- Routes --
  const routesByTime = new Map<number, RouteState[]>()
  for (const r of routeRows) {
    const t = parseFloat(field(r, 'time_s'))
    if (!routesByTime.has(t)) routesByTime.set(t, [])
    const pathStr = field(r, 'path')
    routesByTime.get(t)!.push({
      src: parseInt(field(r, 'src')),
      dst: parseInt(field(r, 'dst')),
      path: pathStr ? pathStr.split(';').map(Number) : [],
      bottleneckMbps: parseFloat(field(r, 'bottleneck_mbps')),
      hopCount: parseInt(field(r, 'hop_count')),
      routable: field(r, 'routable') === '1',
    })
  }

  // -- MCS --
  const mcsByTime = new Map<number, McsState[]>()
  if (mcsText) {
    const mcsRows = parseCSV(mcsText)
    for (const r of mcsRows) {
      const t = parseFloat(field(r, 'time_s'))
      if (!mcsByTime.has(t)) mcsByTime.set(t, [])
      mcsByTime.get(t)!.push({
        nodeA: parseInt(field(r, 'node_a')),
        nodeB: parseInt(field(r, 'node_b')),
        mcsIndex: parseInt(field(r, 'mcs_index')),
        spectralEff: parseFloat(field(r, 'spectral_eff')),
      })
    }
  }

  // -- RX Power --
  const rxPowerByTime = new Map<number, RxPowerState[]>()
  if (rxPowerText) {
    const rxRows = parseCSV(rxPowerText)
    for (const r of rxRows) {
      const t = parseFloat(field(r, 'time_s'))
      if (!rxPowerByTime.has(t)) rxPowerByTime.set(t, [])
      rxPowerByTime.get(t)!.push({
        nodeA: parseInt(field(r, 'node_a')),
        nodeB: parseInt(field(r, 'node_b')),
        rxPowerDbm: parseFloat(field(r, 'rx_power_dbm')),
      })
    }
  }

  // Detect gateway node from flow patterns and override node types
  const gatewayId = detectGatewayNode(flowsByTime)
  if (gatewayId !== null) {
    for (const nodes of posByTime.values()) {
      const gw = nodes.find((n) => n.id === gatewayId)
      if (gw) gw.nodeType = 'gateway'
    }
  }

  const times = Array.from(new Set([...posByTime.keys(), ...linksByTime.keys()])).sort(
    (a, b) => a - b
  )

  const frames = times.map((t) => ({
    time: t,
    nodes: (posByTime.get(t) ?? []).sort((a, b) => a.id - b.id),
    links: linksByTime.get(t) ?? [],
    flows: flowsByTime.get(t) ?? [],
    routes: routesByTime.get(t) ?? [],
    mcs: mcsByTime.get(t) ?? [],
    rxPower: rxPowerByTime.get(t) ?? [],
  }))

  inferNodeTypes(frames)
  return frames
}

// ---------------------------------------------------------------------------
// Infer node types from movement behaviour
// ---------------------------------------------------------------------------
// Nodes marked as 'peer' or 'ground' (generic types) are reclassified based
// on their altitude and speed across frames:
//   - altitude > 3m          → air  (drone / UAV)
//   - speed > 3 m/s on ground → vehicle
//   - speed 0.5–3 m/s        → ground  (pedestrian)
//   - speed < 0.5 m/s        → bs     (stationary / base-station-like)
// Explicitly typed nodes (gateway, bs, air, vehicle) are never overridden.

const ALTITUDE_THRESHOLD = 3 // metres — above this = airborne
const VEHICLE_SPEED = 3 // m/s
const PEDESTRIAN_SPEED = 0.5 // m/s

function inferNodeTypes(frames: SimFrame[]) {
  if (frames.length < 2) return

  // Collect all node IDs from the first frame
  const nodeIds = frames[0].nodes.map((n) => n.id)

  // For each node, compute speeds between consecutive frames
  const nodeSpeeds = new Map<number, number[]>()
  const nodeAltitudes = new Map<number, number[]>()
  for (const id of nodeIds) {
    nodeSpeeds.set(id, [])
    nodeAltitudes.set(id, [])
  }

  for (let i = 0; i < frames.length; i++) {
    const cur = frames[i]
    const next = i + 1 < frames.length ? frames[i + 1] : null
    for (const node of cur.nodes) {
      nodeAltitudes.get(node.id)?.push(node.z)
      if (!next) continue
      const nextNode = next.nodes.find((n) => n.id === node.id)
      if (!nextNode) continue
      const dt = next.time - cur.time
      if (dt <= 0) continue
      const dx = nextNode.x - node.x
      const dy = nextNode.y - node.y
      const dz = nextNode.z - node.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      nodeSpeeds.get(node.id)?.push(dist / dt) // m/s (sim coords are metres, time is seconds)
    }
  }

  // Classify each node
  const nodeTypeMap = new Map<number, NodeType>()
  for (const id of nodeIds) {
    const firstNode = frames[0].nodes.find((n) => n.id === id)
    if (!firstNode) continue
    // Only reclassify generic types
    if (firstNode.nodeType !== 'peer' && firstNode.nodeType !== 'ground') continue

    const alts = nodeAltitudes.get(id) ?? []
    const speeds = nodeSpeeds.get(id) ?? []

    // Median altitude
    const medAlt = median(alts)
    // Median speed (more robust than mean for noisy data)
    const medSpeed = median(speeds)

    let inferred: NodeType
    if (medAlt > ALTITUDE_THRESHOLD) {
      inferred = 'air'
    } else if (medSpeed > VEHICLE_SPEED) {
      inferred = 'vehicle'
    } else if (medSpeed >= PEDESTRIAN_SPEED) {
      inferred = 'ground'
    } else {
      inferred = 'bs'
    }

    nodeTypeMap.set(id, inferred)
  }

  // Apply inferred types to all frames
  for (const frame of frames) {
    for (const node of frame.nodes) {
      const inferred = nodeTypeMap.get(node.id)
      if (inferred) node.nodeType = inferred
    }
  }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
