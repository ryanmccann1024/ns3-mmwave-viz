import type { SimFrame } from '../../types'
import { TrafficFlow } from './TrafficFlow'
import { visibleTrafficRoutes } from '../../lib/trafficRoutes'

interface Props {
  frame: SimFrame
  selectedFlow: { src: number; dst: number } | null
  dim: 1 | 2 | 3
  posScale?: number
}

/** Compute a flow index per route based on shared link segments.
 *  Routes sharing the same edge get incrementing indices so their
 *  particles are vertically offset and don't overlap. */
function computeFlowIndices(routes: Props['frame']['routes']): Map<string, number> {
  // Map each directed edge to the list of route keys that use it
  const edgeUsers = new Map<string, string[]>()
  for (const route of routes) {
    const rKey = `${route.src}-${route.dst}`
    for (let i = 0; i < route.path.length - 1; i++) {
      const edgeKey = `${route.path[i]}-${route.path[i + 1]}`
      let users = edgeUsers.get(edgeKey)
      if (!users) {
        users = []
        edgeUsers.set(edgeKey, users)
      }
      if (!users.includes(rKey)) users.push(rKey)
    }
  }

  // For each route, its index is the max rank it has across all its edges
  const flowIndex = new Map<string, number>()
  for (const route of routes) {
    const rKey = `${route.src}-${route.dst}`
    let maxRank = 0
    for (let i = 0; i < route.path.length - 1; i++) {
      const edgeKey = `${route.path[i]}-${route.path[i + 1]}`
      const users = edgeUsers.get(edgeKey)!
      const rank = users.indexOf(rKey)
      if (rank > maxRank) maxRank = rank
    }
    flowIndex.set(rKey, maxRank)
  }

  return flowIndex
}

export function TrafficLayer({ frame, selectedFlow, dim, posScale = 1 }: Props) {
  const { flows, nodes } = frame

  // Build node lookup
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  const visibleRoutes = visibleTrafficRoutes(frame, selectedFlow)

  const flowIndices = computeFlowIndices(visibleRoutes)

  return (
    <group>
      {visibleRoutes.map((route) => {
        const flow = flows.find((f) => f.src === route.src && f.dst === route.dst)
        const rKey = `${route.src}-${route.dst}`
        return (
          <TrafficFlow
            key={rKey}
            route={route}
            flow={flow}
            nodeMap={nodeMap}
            dim={dim}
            flowIndex={flowIndices.get(rKey) ?? 0}
            posScale={posScale}
          />
        )
      })}
    </group>
  )
}
