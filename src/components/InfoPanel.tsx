import type { SimFrame, NodeState, LinkState, FlowState } from '../types'
import {
  NODE_TYPE_LABELS,
  NODE_BADGE_CLASSES,
  LINK_BADGE_CLASSES,
  NODE_LABELS,
} from '../styles/tokens'
import { Badge } from './ui/Badge'
import { Row } from './ui/Row'

interface Props {
  frame: SimFrame
  selectedNode: number | null
  selectedLink: string | null
  selectedFlow: { src: number; dst: number } | null
  onSelectNode: (id: number | null) => void
  onSelectFlow: (flow: { src: number; dst: number } | null) => void
}

function NodeDetail({ node, links }: { node: NodeState; links: LinkState[] }) {
  const myLinks = links.filter((l) => l.nodeA === node.id || l.nodeB === node.id)
  const connected = myLinks.filter((l) => l.connected).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
          {node.id}
        </div>
        <div>
          <div className="text-gray-900 font-semibold text-sm">Node {node.id}</div>
          <Badge
            label={NODE_TYPE_LABELS[node.nodeType]}
            colorClass={NODE_BADGE_CLASSES[node.nodeType]}
          />
          <div className="text-gray-400 text-xs mt-1">
            {connected}/{myLinks.length} links active
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Position</div>
        <Row label="X" value={`${node.x.toFixed(1)} m`} />
        <Row label="Y" value={`${node.y.toFixed(1)} m`} />
        <Row label="Z" value={`${node.z.toFixed(1)} m`} />
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Links</div>
        {myLinks.length === 0 && <div className="text-gray-400 text-xs">No links</div>}
        {myLinks.map((l) => {
          const peer = l.nodeA === node.id ? l.nodeB : l.nodeA
          return (
            <div
              key={`${l.nodeA}-${l.nodeB}`}
              className="py-2 border-b border-gray-100 last:border-0"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-700 text-xs font-medium">→ Node {peer}</span>
                <div className="flex gap-1">
                  <Badge
                    label={l.condition}
                    colorClass={
                      l.condition === 'LOS' ? LINK_BADGE_CLASSES.LOS : LINK_BADGE_CLASSES.NLOS
                    }
                  />
                  <Badge
                    label={l.connected ? 'ON' : 'OFF'}
                    colorClass={
                      l.connected ? LINK_BADGE_CLASSES.connected : LINK_BADGE_CLASSES.disconnected
                    }
                  />
                </div>
              </div>
              <div className="text-gray-500 text-xs font-mono">
                {l.sinr !== undefined ? `${l.sinr.toFixed(1)} dB · ` : ''}
                {l.dist.toFixed(1)} m
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LinkDetail({ link }: { link: LinkState }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-gray-900 font-semibold text-sm mb-1">
          Node {link.nodeA} — Node {link.nodeB}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Badge
            label={link.condition}
            colorClass={link.condition === 'LOS' ? LINK_BADGE_CLASSES.LOS : LINK_BADGE_CLASSES.NLOS}
          />
          <Badge
            label={link.connected ? 'CONNECTED' : 'DISCONNECTED'}
            colorClass={
              link.connected ? LINK_BADGE_CLASSES.connected : LINK_BADGE_CLASSES.disconnected
            }
          />
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Link Metrics</div>
        <Row label="Distance" value={`${link.dist.toFixed(2)} m`} />
        {link.sinr !== undefined && <Row label="SINR" value={`${link.sinr.toFixed(2)} dB`} />}
        <Row label="Condition" value={link.condition} />
        {link.conditionReason && <Row label="Reason" value={link.conditionReason} />}
        {link.capacityMbps !== undefined && (
          <Row label="Capacity" value={`${link.capacityMbps.toFixed(1)} Mbps`} />
        )}
        {link.deliveredMbps !== undefined && (
          <Row label="Delivered" value={`${link.deliveredMbps.toFixed(1)} Mbps`} />
        )}
        {link.hopCount !== undefined && link.hopCount > 0 && (
          <Row label="Max Hops" value={String(link.hopCount)} />
        )}
      </div>
    </div>
  )
}

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
    flow.demandMbps > 0 ? ((flow.deliveredMbps / flow.demandMbps) * 100).toFixed(0) : '—'
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left py-2 px-1 border-b border-gray-100 last:border-0 transition-colors ${
        selected ? 'bg-sky-50' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-gray-700 text-xs font-medium">
          {flow.src} → {flow.dst}
        </span>
        <span
          className={`text-xs font-mono ${flow.routable ? 'text-emerald-600' : 'text-red-500'}`}
        >
          {flow.routable ? `${ratio}%` : 'unroutable'}
        </span>
      </div>
      <div className="text-gray-500 text-xs font-mono">
        {flow.deliveredMbps.toFixed(1)}/{flow.demandMbps.toFixed(1)} Mbps
        {flow.hopCount > 1 ? ` · ${flow.hopCount} hops` : ''}
        {flow.latencyMs > 0 ? ` · ${flow.latencyMs.toFixed(1)}ms` : ''}
      </div>
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
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-b border-gray-100 last:border-0 ${
        selected ? 'bg-sky-50 border-l-2 border-l-sky-500' : 'hover:bg-gray-50'
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          selected ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-600'
        } ${!node.active ? 'opacity-40' : ''}`}
      >
        {node.id}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700 truncate">
            {NODE_LABELS[node.nodeType]} {node.id}
          </span>
          <span
            className={`text-xs font-mono flex-shrink-0 ml-1 ${
              connected > 0 ? 'text-emerald-600' : 'text-gray-300'
            }`}
          >
            {connected}/{myLinks.length}
          </span>
        </div>
        <div className="text-xs text-gray-400 font-mono truncate">
          ({node.x.toFixed(0)}, {node.y.toFixed(0)}, {node.z.toFixed(0)})
        </div>
      </div>
    </button>
  )
}

export function InfoPanel({
  frame,
  selectedNode,
  selectedLink,
  selectedFlow,
  onSelectNode,
  onSelectFlow,
}: Props) {
  const node =
    selectedNode !== null ? (frame.nodes.find((n) => n.id === selectedNode) ?? null) : null
  const link = selectedLink
    ? (frame.links.find((l) => `${l.nodeA}-${l.nodeB}` === selectedLink) ?? null)
    : null

  const showDetail = node !== null || link !== null
  const hasFlows = frame.flows.length > 0

  return (
    <div className="w-72 min-w-[18rem] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col hidden lg:flex">
      {/* Node list */}
      <div
        className={`flex flex-col ${showDetail || hasFlows ? 'flex-shrink-0 max-h-48' : 'flex-1'} overflow-y-auto`}
      >
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
            Nodes ({frame.nodes.length})
          </span>
        </div>
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

      {/* Flows section */}
      {hasFlows && (
        <div className="flex flex-col flex-shrink-0 max-h-40 overflow-y-auto border-t border-gray-200">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
              Flows ({frame.flows.length})
            </span>
          </div>
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
      )}

      {/* Detail panel */}
      {showDetail && (
        <div className="flex-1 overflow-y-auto p-4 border-t border-gray-200">
          {node ? (
            <NodeDetail node={node} links={frame.links} />
          ) : link ? (
            <LinkDetail link={link} />
          ) : null}
        </div>
      )}

      {/* Legend when nothing selected */}
      {!showDetail && (
        <div className="p-3 border-t border-gray-100 bg-gray-50">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Legend</div>
          <div className="space-y-1.5 text-xs text-gray-500 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-emerald-500 inline-block" />
              LOS (solid)
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0 border-t-2 border-dashed border-yellow-500 inline-block" />
              NLOS (dashed)
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0 border-t-2 border-dashed border-gray-400 inline-block" />
              Disconnected
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
