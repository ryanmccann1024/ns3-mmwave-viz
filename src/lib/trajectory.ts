// Controlled-node trails from positions.csv. Simulator coordinates (Z = altitude);
// the scene applies its own transform when drawing.

export interface TrailPoint {
  time: number
  x: number
  y: number
  z: number
}

export interface ControlledNode {
  slot: number
  nodeId: string
  /** integer node_id used in the CSVs == index in contract.node_ids */
  index: number
}

export interface ControlledNodeMapping {
  nodes: ControlledNode[]
  /** slot ids that do not appear in node_ids; reported, never guessed */
  missing: string[]
}

export function controlledNodeIndices(contract: {
  node_ids: string[]
  slot_node_ids: string[]
}): ControlledNodeMapping {
  const nodes: ControlledNode[] = []
  const missing: string[] = []
  contract.slot_node_ids.forEach((nodeId, slot) => {
    const index = contract.node_ids.indexOf(nodeId)
    if (index < 0) missing.push(nodeId)
    else nodes.push({ slot, nodeId, index })
  })
  return { nodes, missing }
}

export interface TrailsResult {
  trails: Map<number, TrailPoint[]>
  error: string | null
}

/** Time-ordered points per requested node index. */
export function extractTrails(positionsCsvText: string, nodeIndices: number[]): TrailsResult {
  const trails = new Map<number, TrailPoint[]>()
  for (const index of nodeIndices) trails.set(index, [])
  let columns: { time: number; node: number; x: number; y: number; z: number } | null = null
  let sorted = true

  for (const rawLine of positionsCsvText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const cells = line.split(',')
    if (columns === null) {
      columns = {
        time: cells.indexOf('time_s'),
        node: cells.indexOf('node_id'),
        x: cells.indexOf('x'),
        y: cells.indexOf('y'),
        z: cells.indexOf('z'),
      }
      if (Object.values(columns).some((i) => i < 0)) {
        return { trails, error: 'positions.csv header lacks time_s,node_id,x,y,z columns' }
      }
      continue
    }
    const points = trails.get(Number(cells[columns.node]))
    if (!points) continue
    const point = {
      time: Number(cells[columns.time]),
      x: Number(cells[columns.x]),
      y: Number(cells[columns.y]),
      z: Number(cells[columns.z]),
    }
    if (![point.time, point.x, point.y, point.z].every(Number.isFinite)) continue
    if (points.length > 0 && points[points.length - 1].time > point.time) sorted = false
    points.push(point)
  }
  if (columns === null) return { trails, error: 'positions.csv has no header row' }
  if (!sorted) for (const points of trails.values()) points.sort((a, b) => a.time - b.time)
  return { trails, error: null }
}

/** Uniform stride down to at most maxPoints, always keeping the first and last point. */
export function decimate<T>(points: T[], maxPoints: number): T[] {
  const limit = Math.max(2, Math.floor(maxPoints))
  if (points.length <= limit) return points
  const last = points.length - 1
  const stride = Math.ceil(last / (limit - 1))
  const out: T[] = []
  for (let i = 0; i < last; i += stride) out.push(points[i])
  out.push(points[last])
  return out
}
