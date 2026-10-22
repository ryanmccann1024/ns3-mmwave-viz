import type { SimFrame } from '../types'

/** A node that was up and then went down; `upAt` is when it came back, or null if it never did */
export interface NodeOutage {
  nodeId: number
  /** original node ID (e.g. drone-1), when the roster was checked */
  name?: string
  downAt: number
  /** index of the first frame in which the node is down */
  frameIndex: number
  upAt: number | null
}

/**
 * Every up-to-down transition across the replay, in time order. A node that is down from
 * the first frame never failed during the run, so it has no outage.
 */
export function nodeOutages(frames: SimFrame[]): NodeOutage[] {
  const outages: NodeOutage[] = []
  const wasActive = new Map<number, boolean>()
  const open = new Map<number, NodeOutage>()
  frames.forEach((frame, i) => {
    for (const node of frame.nodes) {
      const prev = wasActive.get(node.id)
      if (prev === true && !node.active) {
        const outage: NodeOutage = {
          nodeId: node.id,
          ...(node.name ? { name: node.name } : {}),
          downAt: frame.time,
          frameIndex: i,
          upAt: null,
        }
        outages.push(outage)
        open.set(node.id, outage)
      } else if (prev === false && node.active) {
        const outage = open.get(node.id)
        if (outage) outage.upAt = frame.time
        open.delete(node.id)
      }
      wasActive.set(node.id, node.active)
    }
  })
  return outages
}

/** How an outage names its node: the original ID, else "node 3" */
export const outageNodeName = (o: NodeOutage) => o.name ?? `node ${o.nodeId}`

/**
 * The notice to keep after moving from frame `prev` to `next`. Moving forward raises the
 * outages crossed; moving back before an outage's first down frame withdraws it, since
 * the node is up again at the new playhead.
 */
export function nextOutageNotice(
  current: NodeOutage[],
  outages: NodeOutage[],
  prev: number,
  next: number
): NodeOutage[] {
  if (next > prev) {
    const crossed = outages.filter((o) => o.frameIndex > prev && o.frameIndex <= next)
    return crossed.length > 0 ? crossed : current
  }
  const kept = current.filter((o) => o.frameIndex <= next)
  return kept.length === current.length ? current : kept
}

/** The outage a node is in at `time`, if any */
export function outageAt(
  outages: NodeOutage[],
  nodeId: number,
  time: number
): NodeOutage | undefined {
  return outages.find(
    (o) => o.nodeId === nodeId && o.downAt <= time && (o.upAt === null || time < o.upAt)
  )
}
