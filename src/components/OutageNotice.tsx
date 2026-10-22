import { useEffect, useRef, useState } from 'react'
import type { NodeOutage } from '../lib/nodeOutages'
import { nextOutageNotice, outageNodeName } from '../lib/nodeOutages'
import { NODE_FAILURE_COLOR } from '../styles/tokens'
import { MOTION } from '../styles/motion'

const SHOW_MS = 5000

const capitalize = (s: string) => (s.startsWith('node ') ? `N${s.slice(1)}` : s)

/**
 * The outages crossed when playback (or a forward seek) moves past them, cleared after a few
 * seconds. Moving backwards never raises one and withdraws any the playhead is now before;
 * a different replay (new outages) starts with no notice.
 */
export function useOutageNotice(outages: NodeOutage[], frameIndex: number): NodeOutage[] {
  const [notice, setNotice] = useState<NodeOutage[]>([])
  const prevRef = useRef(frameIndex)
  const outagesRef = useRef(outages)
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = frameIndex
    if (outagesRef.current !== outages) {
      outagesRef.current = outages
      setNotice([])
      return
    }
    setNotice((current) => nextOutageNotice(current, outages, prev, frameIndex))
  }, [frameIndex, outages])
  useEffect(() => {
    if (notice.length === 0) return
    const timer = setTimeout(() => setNotice([]), SHOW_MS)
    return () => clearTimeout(timer)
  }, [notice])
  return notice
}

/** A chip over the canvas naming the node(s) that just went down; click to select the first */
export function OutageNotice({
  outages,
  onSelectNode,
}: {
  outages: NodeOutage[]
  onSelectNode: (id: number) => void
}) {
  if (outages.length === 0) return null
  return (
    <button
      key={outages.map((o) => `${o.nodeId}@${o.downAt}`).join(',')}
      type="button"
      role="status"
      onClick={() => onSelectNode(outages[0].nodeId)}
      className={`glass-chip absolute bottom-3 left-3 z-10 flex items-center gap-3 px-4 py-3 text-left ${MOTION.enter}`}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ background: NODE_FAILURE_COLOR }}
      />
      <span className="text-base font-medium text-ink">
        {outages.length === 1
          ? `${capitalize(outageNodeName(outages[0]))} went offline`
          : `${capitalize(outages.map(outageNodeName).join(', '))} went offline`}
        <span className="text-ink-2 tabular-nums"> at {outages[0].downAt.toFixed(1)} s</span>
      </span>
    </button>
  )
}
