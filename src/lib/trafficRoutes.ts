import type { RouteState, SimFrame } from '../types'

/**
 * The routes the scene animates as moving traffic. Pulses show delivered traffic only:
 * a route whose flow delivers nothing (offered demand alone), or whose path passes a node
 * that is offline in this frame, is never drawn as transmitting. With no selection, the
 * five routes carrying the most delivered traffic are shown.
 */
export function visibleTrafficRoutes(
  frame: Pick<SimFrame, 'routes' | 'flows' | 'nodes'>,
  selectedFlow: { src: number; dst: number } | null
): RouteState[] {
  const active = new Map(frame.nodes.map((n) => [n.id, n.active]))
  const delivered = new Map(frame.flows.map((f) => [`${f.src}-${f.dst}`, f.deliveredMbps]))
  const rate = (r: RouteState) => delivered.get(`${r.src}-${r.dst}`) ?? 0
  const live = frame.routes.filter(
    (r) =>
      r.routable &&
      r.path.length >= 2 &&
      rate(r) > 0 &&
      r.path.every((id) => active.get(id) === true)
  )
  if (selectedFlow)
    return live.filter((r) => r.src === selectedFlow.src && r.dst === selectedFlow.dst)
  return live.sort((a, b) => rate(b) - rate(a)).slice(0, 5)
}
