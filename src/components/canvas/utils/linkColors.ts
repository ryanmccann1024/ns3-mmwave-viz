import type { LinkState } from '../../../types'
import { LINK_COLORS } from '../../../styles/tokens'

export function linkColor(l: LinkState): string {
  if (!l.connected) return LINK_COLORS.disconnected
  return l.condition === 'LOS' ? LINK_COLORS.losConnected : LINK_COLORS.nlosConnected
}

export function linkKey(l: LinkState): string {
  return `${l.nodeA}-${l.nodeB}`
}
