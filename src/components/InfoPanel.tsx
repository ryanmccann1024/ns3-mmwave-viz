import type { SimFrame, NodeState, LinkState, FlowState } from '../types'
import { NODE_COLORS } from '../styles/tokens'
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

function Dot({ color }: { color: string }) {
  return (
    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
  )
}

const linkState = (l: LinkState) =>
  `${l.connected ? 'Connected' : 'Down'} · ${l.condition === 'LOS' ? 'line of sight' : 'blocked (NLOS)'}`

export function NodeDetail({ node, links }: { node: NodeState; links: LinkState[] }) {
  const myLinks = links.filter((l) => l.nodeA === node.id || l.nodeB === node.id)
  const connected = myLinks.filter((l) => l.connected).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <Dot color={NODE_COLORS[node.nodeType]} />
          <span className="text-xl font-semibold tracking-tight text-ink-title">
            {typeName(node.nodeType)} {node.id}
          </span>
        </div>
        <div className="text-base text-ink-2">
          {connected} of {myLinks.length} links connected
        </div>
      </div>

      <div>
        <Row
          label="Position"
          value={`${node.x.toFixed(0)}, ${node.y.toFixed(0)}, ${node.z.toFixed(0)} m`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-base font-semibold text-ink-title">Links</div>
        {myLinks.length === 0 && <div className="text-ink-2 text-base">No links</div>}
        {myLinks.map((l) => {
          const peer = l.nodeA === node.id ? l.nodeB : l.nodeA
          return (
            <div
              key={`${l.nodeA}-${l.nodeB}`}
              className="py-2 border-b border-hairline last:border-0 flex flex-col gap-0.5"
            >
              <div className="flex justify-between items-baseline gap-4">
                <span className="text-ink text-base font-medium">Node {peer}</span>
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

export function LinkDetail({ link }: { link: LinkState }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xl font-semibold tracking-tight text-ink-title">
          Node {link.nodeA} to node {link.nodeB}
        </div>
        <div className={`text-base ${link.connected ? 'text-ink-2' : 'text-rose-700'}`}>
          {linkState(link)}
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
  selected,
  onSelect,
}: {
  flow: FlowState
  selected: boolean
  onSelect: () => void
}) {
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
          Node {flow.src} to {flow.dst}
        </div>
        <div className="text-base text-ink-2 tabular-nums">
          {flow.deliveredMbps.toFixed(1)} of {flow.demandMbps.toFixed(1)} Mbps
          {flow.hopCount > 1 ? ` · ${flow.hopCount} hops` : ''}
          {flow.latencyMs > 0 ? ` · ${flow.latencyMs.toFixed(0)} ms` : ''}
        </div>
      </div>
      <span
        className={`flex-shrink-0 text-base font-medium tabular-nums ${flow.routable ? 'text-ink' : 'text-rose-700'}`}
      >
        {flow.routable ? ratio : 'No route'}
      </span>
    </button>
  )
}

function NodeListItem({
  node,
  links,
  selected,
  onClick,
}: {
  node: NodeState
  links: LinkState[]
  selected: boolean
  onClick: () => void
}) {
  const myLinks = links.filter((l) => l.nodeA === node.id || l.nodeB === node.id)
  const connected = myLinks.filter((l) => l.connected).length

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${LIST_ITEM} ${selected ? 'bg-accent-wash' : 'hover:bg-white/70'} ${!node.active ? 'opacity-50' : ''}`}
    >
      <Dot color={NODE_COLORS[node.nodeType]} />
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-ink truncate">
          {typeName(node.nodeType)} {node.id}
        </div>
        <div className="text-base text-ink-2 tabular-nums truncate">
          {node.x.toFixed(0)}, {node.y.toFixed(0)}, {node.z.toFixed(0)} m
        </div>
      </div>
      <span className="flex-shrink-0 text-base text-ink-2 tabular-nums">
        {connected} of {myLinks.length} links
      </span>
    </button>
  )
}

/** Every node in the frame; click to select */
export function NodeList({
  frame,
  selectedNode,
  onSelectNode,
}: Pick<Props, 'frame' | 'selectedNode' | 'onSelectNode'>) {
  return (
    <div className="flex flex-col gap-0.5">
      {frame.nodes.map((n) => (
        <NodeListItem
          key={n.id}
          node={n}
          links={frame.links}
          selected={selectedNode === n.id}
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
