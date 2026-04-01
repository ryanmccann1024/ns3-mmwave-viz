import type { SimFrame } from '../../types'
import { TrafficFlow } from './TrafficFlow'

interface Props {
  frame: SimFrame
  selectedFlow: { src: number; dst: number } | null
  dim: 1 | 2 | 3
}

export function TrafficLayer({ frame, selectedFlow, dim }: Props) {
  const { routes, flows, nodes } = frame

  // Build node lookup
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // Determine which routes to show
  let visibleRoutes = routes.filter((r) => r.routable && r.path.length >= 2)

  if (selectedFlow) {
    // Show only routes matching the selected flow
    visibleRoutes = visibleRoutes.filter(
      (r) => r.src === selectedFlow.src && r.dst === selectedFlow.dst
    )
  } else {
    // Show top 5 routes by demand when nothing selected
    const flowDemand = new Map(flows.map((f) => [`${f.src}-${f.dst}`, f.demandMbps]))
    visibleRoutes = visibleRoutes
      .sort(
        (a, b) =>
          (flowDemand.get(`${b.src}-${b.dst}`) ?? 0) - (flowDemand.get(`${a.src}-${a.dst}`) ?? 0)
      )
      .slice(0, 5)
  }

  return (
    <group>
      {visibleRoutes.map((route) => {
        const flow = flows.find((f) => f.src === route.src && f.dst === route.dst)
        return (
          <TrafficFlow
            key={`${route.src}-${route.dst}`}
            route={route}
            flow={flow}
            nodeMap={nodeMap}
            dim={dim}
          />
        )
      })}
    </group>
  )
}
