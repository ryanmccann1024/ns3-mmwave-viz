import type { SimFrame, NodeState, LinkState } from '../types'
import { NODE_TYPE_LABELS, NODE_BADGE_CLASSES, LINK_BADGE_CLASSES } from '../styles/tokens'
import { Badge } from './ui/Badge'
import { Row } from './ui/Row'

interface Props {
  frame: SimFrame
  selectedNode: number | null
  selectedLink: string | null
}

function NodeDetail({ node, links }: { node: NodeState; links: LinkState[] }) {
  const myLinks = links.filter((l) => l.nodeA === node.id || l.nodeB === node.id)
  const connected = myLinks.filter((l) => l.connected).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-sky-700 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
          {node.id}
        </div>
        <div>
          <div className="text-slate-200 font-semibold text-sm">Node {node.id}</div>
          <Badge
            label={NODE_TYPE_LABELS[node.nodeType]}
            colorClass={NODE_BADGE_CLASSES[node.nodeType]}
          />
          <div className="text-slate-500 text-xs mt-1">
            {connected}/{myLinks.length} links active
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Position</div>
        <Row label="X" value={`${node.x.toFixed(1)} m`} />
        <Row label="Y" value={`${node.y.toFixed(1)} m`} />
        <Row label="Altitude (Z)" value={`${node.z.toFixed(1)} m`} />
      </div>

      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Links</div>
        {myLinks.length === 0 && <div className="text-slate-600 text-xs">No links</div>}
        {myLinks.map((l) => {
          const peer = l.nodeA === node.id ? l.nodeB : l.nodeA
          return (
            <div
              key={`${l.nodeA}-${l.nodeB}`}
              className="py-2 border-b border-slate-700/50 last:border-0"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-300 text-xs font-medium">→ Node {peer}</span>
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
              <div className="text-slate-400 text-xs font-mono">
                {l.rxPower.toFixed(2)} dBm · {l.dist.toFixed(1)} m
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
        <div className="text-slate-200 font-semibold text-sm mb-1">
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
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Link Metrics</div>
        <Row label="3-D Distance" value={`${link.dist.toFixed(2)} m`} />
        <Row label="Path Loss" value={`${link.pathloss.toFixed(2)} dB`} />
        <Row label="Rx Power" value={`${link.rxPower.toFixed(2)} dBm`} />
        <Row label="Condition" value={link.condition} />
        <Row label="Connected" value={link.connected ? 'Yes' : 'No'} />
      </div>

      <div className="text-xs text-slate-600 mt-2 leading-relaxed">
        <strong className="text-slate-500">LOS</strong> = clear line of sight → lower path loss
        <br />
        <strong className="text-slate-500">NLOS</strong> = obstructed → higher path loss, more
        variable
      </div>
    </div>
  )
}

export function InfoPanel({ frame, selectedNode, selectedLink }: Props) {
  const node =
    selectedNode !== null ? (frame.nodes.find((n) => n.id === selectedNode) ?? null) : null
  const link = selectedLink
    ? (frame.links.find((l) => `${l.nodeA}-${l.nodeB}` === selectedLink) ?? null)
    : null

  return (
    <div className="w-64 flex-shrink-0 bg-slate-800/60 border-l border-slate-700 p-4 overflow-y-auto hidden lg:block">
      {node ? (
        <NodeDetail node={node} links={frame.links} />
      ) : link ? (
        <LinkDetail link={link} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center pt-8">
          <div className="text-3xl">🔭</div>
          <div className="text-slate-500 text-sm leading-relaxed">
            Click a <span className="text-slate-400">node</span> or
            <br />
            <span className="text-slate-400">link</span> to inspect it
          </div>
          <div className="mt-4 text-xs text-slate-600 space-y-1 text-left">
            <div>■ Box = ground node</div>
            <div>◆ Octahedron = UAV/air</div>
            <div>━ Green = LOS connected</div>
            <div>━ Orange = NLOS connected</div>
            <div>╌ Red = disconnected</div>
          </div>
        </div>
      )}
    </div>
  )
}
