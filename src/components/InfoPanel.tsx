import type { SimFrame, NodeState, LinkState, FlowState } from '../types'
import { NODE_COLORS, NODE_FAILURE_COLOR } from '../styles/tokens'
import { outageAt, type NodeOutage } from '../lib/nodeOutages'
import { MOTION } from '../styles/motion'
import { Row } from './ui/Row'

interface Props {
  frame: SimFrame
  selectedNode: number | null
  selectedLink: string | null
  selectedFlow: { src: number; dst: number } | null
  onSelectNode: (id: number | null) => void
  onSelectFlow: (flow: { src: number; dst: number } | null) => void
}

const TYPE_NAME: Record<string, string> = {
  ground: 'Ground node',
  air: 'Drone',
  bs: 'Base station',
  vehicle: 'Vehicle',
  peer: 'Peer',
  gateway: 'Gateway',
}

const typeName = (type: string) => TYPE_NAME[type] ?? type

/** A node's links to peers that are up: rows for an offline peer are not links */
function liveLinksOf(id: number, links: LinkState[], nodes: readonly NodeState[]) {
  const offline = new Set(nodes.filter((n) => !n.active).map((n) => n.id))
  return links.filter(
    (l) => (l.nodeA === id || l.nodeB === id) && !offline.has(l.nodeA) && !offline.has(l.nodeB)
  )
}

/** The original node ID (e.g. drone-1) when the roster was checked, else "Node 3" */
export function nodeName(nodes: readonly NodeState[], id: number): string {
  return nodes.find((n) => n.id === id)?.name ?? `Node ${id}`
}

function Dot({ color }: { color: string }) {
  return (
    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
  )
}

const linkState = (l: LinkState) =>
  `${l.connected ? 'Connected' : 'Down'} · ${l.condition === 'LOS' ? 'line of sight' : 'blocked (NLOS)'}`

export function NodeDetail({
  node,
  links,
  nodes = [],
}: {
  node: NodeState
  links: LinkState[]
  nodes?: NodeState[]
}) {
  const myLinks = liveLinksOf(node.id, links, nodes)
  const connected = myLinks.filter((l) => l.connected).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <Dot color={node.active ? NODE_COLORS[node.nodeType] : NODE_FAILURE_COLOR} />
          <span className="text-xl font-semibold tracking-tight text-ink-title">
            {node.name ?? `${typeName(node.nodeType)} ${node.id}`}
          </span>
        </div>
        {node.active ? (
          <div className="text-base text-ink-2">
            {node.name ? `${typeName(node.nodeType)} · ` : ''}
            {connected} of {myLinks.length} links connected
          </div>
        ) : (
          <div className="text-base font-medium text-rose-700">Offline</div>
        )}
      </div>

      <div>
        <Row
          label="Position"
          value={`${node.x.toFixed(0)}, ${node.y.toFixed(0)}, ${node.z.toFixed(0)} m`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-base font-semibold text-ink-title">Links</div>
        {!node.active && <div className="text-ink-2 text-base">None while offline</div>}
        {node.active && myLinks.length === 0 && (
          <div className="text-ink-2 text-base">No links</div>
        )}
        {(node.active ? myLinks : []).map((l) => {
          const peer = l.nodeA === node.id ? l.nodeB : l.nodeA
          return (
            <div
              key={`${l.nodeA}-${l.nodeB}`}
              className="py-2 border-b border-hairline last:border-0 flex flex-col gap-0.5"
            >
              <div className="flex justify-between items-baseline gap-4">
                <span className="text-ink text-base font-medium">{nodeName(nodes, peer)}</span>
                <span className="text-base text-ink-2 tabular-nums">
                  {l.sinr !== undefined ? `${l.sinr.toFixed(1)} dB · ` : ''}
                  {l.dist.toFixed(0)} m
                </span>
              </div>
              <div className={`text-base ${l.connected ? 'text-ink-2' : 'text-rose-700'}`}>
                {linkState(l)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function LinkDetail({ link, nodes = [] }: { link: LinkState; nodes?: NodeState[] }) {
  const offline = nodes.filter((n) => (n.id === link.nodeA || n.id === link.nodeB) && !n.active)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xl font-semibold tracking-tight text-ink-title">
          {nodeName(nodes, link.nodeA)} to {nodeName(nodes, link.nodeB)}
        </div>
        <div className={`text-base ${link.connected ? 'text-ink-2' : 'text-rose-700'}`}>
          {offline.length
            ? `Down · ${offline.map((n) => n.name ?? `node ${n.id}`).join(' and ')} offline`
            : linkState(link)}
        </div>
      </div>

      <div>
        <Row label="Distance" value={`${link.dist.toFixed(1)} m`} />
        {link.sinr !== undefined && <Row label="SINR" value={`${link.sinr.toFixed(1)} dB`} />}
        {link.conditionReason && <Row label="Why" value={link.conditionReason} />}
        {link.capacityMbps !== undefined && (
          <Row label="Capacity" value={`${link.capacityMbps.toFixed(1)} Mbps`} />
        )}
        {link.deliveredMbps !== undefined && (
          <Row label="Delivered" value={`${link.deliveredMbps.toFixed(1)} Mbps`} />
        )}
        {link.hopCount !== undefined && link.hopCount > 0 && (
          <Row label="Most hops" value={String(link.hopCount)} />
        )}
      </div>
    </div>
  )
}

const LIST_ITEM = `w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl ${MOTION.colors}`

function FlowDetail({
  flow,
  nodes,
  selected,
  onSelect,
}: {
  flow: FlowState
  nodes: NodeState[]
  selected: boolean
  onSelect: () => void
}) {
  // Demand stays recorded for an offline endpoint; it is offered, not carried
  const offline = nodes.some((n) => (n.id === flow.src || n.id === flow.dst) && !n.active)
  const ratio =
    flow.demandMbps > 0 ? `${((flow.deliveredMbps / flow.demandMbps) * 100).toFixed(0)}%` : '–'
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${LIST_ITEM} ${selected ? 'bg-accent-wash' : 'hover:bg-white/70'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-ink">
          {nodeName(nodes, flow.src)} to {nodeName(nodes, flow.dst)}
        </div>
        <div className="text-base text-ink-2 tabular-nums">
          {flow.deliveredMbps.toFixed(1)} of {flow.demandMbps.toFixed(1)} Mbps
          {flow.hopCount > 1 ? ` · ${flow.hopCount} hops` : ''}
          {flow.latencyMs > 0 ? ` · ${flow.latencyMs.toFixed(0)} ms` : ''}
        </div>
      </div>
      <span
        className={`flex-shrink-0 text-base font-medium tabular-nums ${flow.routable && !offline ? 'text-ink' : 'text-rose-700'}`}
      >
        {offline ? 'Offline' : flow.routable ? ratio : 'No route'}
      </span>
    </button>
  )
}

function NodeListItem({
  node,
  links,
  nodes,
  selected,
  outage,
  onClick,
}: {
  node: NodeState
  links: LinkState[]
  nodes: NodeState[]
  selected: boolean
  /** set while the node is down after failing mid-run */
  outage: NodeOutage | undefined
  onClick: () => void
}) {
  const myLinks = liveLinksOf(node.id, links, nodes)
  const connected = myLinks.filter((l) => l.connected).length

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${LIST_ITEM} ${selected ? 'bg-accent-wash' : 'hover:bg-white/70'} ${!node.active && !outage ? 'opacity-50' : ''}`}
    >
      <Dot color={outage ? NODE_FAILURE_COLOR : NODE_COLORS[node.nodeType]} />
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-ink truncate">
          {node.name ?? `${typeName(node.nodeType)} ${node.id}`}
        </div>
        <div className="text-base text-ink-2 tabular-nums truncate">
          {node.x.toFixed(0)}, {node.y.toFixed(0)}, {node.z.toFixed(0)} m
        </div>
      </div>
      {outage ? (
        <span className="flex-shrink-0 text-base font-medium text-rose-700 tabular-nums">
          Offline since {outage.downAt.toFixed(1)} s
        </span>
      ) : (
        <span className="flex-shrink-0 text-base text-ink-2 tabular-nums">
          {connected} of {myLinks.length} links
        </span>
      )}
    </button>
  )
}

/** Every node in the frame; click to select */
export function NodeList({
  frame,
  selectedNode,
  onSelectNode,
  outages = [],
}: Pick<Props, 'frame' | 'selectedNode' | 'onSelectNode'> & { outages?: NodeOutage[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {frame.nodes.map((n) => (
        <NodeListItem
          key={n.id}
          node={n}
          links={frame.links}
          nodes={frame.nodes}
          selected={selectedNode === n.id}
          outage={n.active ? undefined : outageAt(outages, n.id, frame.time)}
          onClick={() => onSelectNode(selectedNode === n.id ? null : n.id)}
        />
      ))}
    </div>
  )
}

/** Every traffic flow in the frame; click to highlight its route */
export function FlowList({
  frame,
  selectedFlow,
  onSelectFlow,
}: Pick<Props, 'frame' | 'selectedFlow' | 'onSelectFlow'>) {
  return (
    <div className="flex flex-col gap-0.5">
      {frame.flows.map((f) => {
        const isSelected = selectedFlow?.src === f.src && selectedFlow?.dst === f.dst
        return (
          <FlowDetail
            key={`${f.src}-${f.dst}`}
            flow={f}
            nodes={frame.nodes}
            selected={isSelected}
            onSelect={() => onSelectFlow(isSelected ? null : { src: f.src, dst: f.dst })}
          />
        )
      })}
    </div>
  )
}

export function LinkLegend() {
  return (
    <div className="flex items-center gap-5 text-base text-ink-2 flex-wrap">
      <span className="flex items-center gap-1.5">
        <span className="w-5 h-0.5 bg-emerald-500 inline-block rounded" />
        LOS
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-5 h-0 border-t-2 border-dashed border-yellow-500 inline-block" />
        NLOS
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-5 h-0 border-t-2 border-dashed border-gray-400 inline-block" />
        Down
      </span>
    </div>
  )
}
