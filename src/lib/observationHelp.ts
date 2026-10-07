import type { EvalContract } from './experimentIndex'

export interface FeatureHelp {
  title: string
  owner: string
  meaning: string
  calculation: string
}

/** Human explanation of a saved feature name; never guesses a live value. */
export function describeFeature(name: string, contract: EvalContract | null): FeatureHelp {
  const match = /^slot(\d+)(?:\.peer_index(\d+))?\.(.+)$/.exec(name)
  if (!match)
    return {
      title: name,
      owner: 'Saved observation',
      meaning: 'A feature recorded in the observation schema.',
      calculation: 'See this run’s saved normalization and bounds below.',
    }
  const slot = Number(match[1])
  const peerIndex = match[2] === undefined ? null : Number(match[2])
  const field = match[3]
  const nodeId = contract?.slot_node_ids?.[slot]
  const peers = contract?.node_ids?.filter((id) => id !== nodeId) ?? []
  const peerId = peerIndex === null ? null : peers[peerIndex]
  const owner =
    peerIndex === null
      ? `Control slot ${slot}${nodeId ? ` · node ${nodeId}` : ' · unused/padded slot'}`
      : `Control slot ${slot}${nodeId ? ` · node ${nodeId}` : ''} → peer ${peerIndex}${peerId ? ` · node ${peerId}` : ''}`
  const axis = /^[xyz](?:_n)?$/.test(field) ? field[0].toUpperCase() : null
  const relative = /^relative_([xyz])_n$/.exec(field)
  const velocity = /^relative_v([xyz])_n$/.exec(field)

  if (field === 'active')
    return {
      title: 'Controlled slot is active',
      owner,
      meaning:
        '1 means this slot contains a real controlled node; 0 means it is padding. Slot is an action position, not a mesh-node ID.',
      calculation: 'Binary flag: 0 or 1.',
    }
  if (field === 'present')
    return {
      title: 'Peer is present',
      owner,
      meaning:
        '1 means this peer exists for this controlled slot; 0 appears for a padded slot. “Peer index” is the peer’s position in the fixed node order, not its ID.',
      calculation: 'Binary flag: 0 or 1.',
    }
  if (axis && field.endsWith('_n'))
    return {
      title: `${axis} position, normalized`,
      owner,
      meaning: `The controlled node’s absolute ${axis.toLowerCase()} coordinate. “_n” means normalized; this is not meters.`,
      calculation:
        '2 × (position − configured minimum) / (maximum − minimum) − 1, clipped to [−1, 1]. The run.ini bounds set the physical meters.',
    }
  if (axis)
    return {
      title: `${axis} position in meters`,
      owner,
      meaning: `The controlled node’s raw ${axis.toLowerCase()} coordinate.`,
      calculation: 'No normalization for this raw feature.',
    }
  if (relative)
    return {
      title: `Relative ${relative[1].toUpperCase()} position`,
      owner,
      meaning: `Peer position minus controlled-node position along ${relative[1]}. A positive value places the peer in the positive axis direction.`,
      calculation: 'Divide by the configured axis span in meters, then clip to [−1, 1].',
    }
  if (velocity)
    return {
      title: `Relative ${velocity[1].toUpperCase()} velocity`,
      owner,
      meaning: `Peer velocity minus controlled-node velocity along ${velocity[1]}.`,
      calculation: 'Divide by 40 m/s, then clip to [−1, 1].',
    }

  const details: Record<string, [string, string, string]> = {
    sinr_valid: [
      'SINR measurement is valid',
      '1 means this peer link has a valid SINR; 0 means the measurement is unavailable.',
      'Binary flag: 0 or 1.',
    ],
    sinr_n: [
      'Link SINR, normalized',
      'Current signal-to-interference-plus-noise ratio for this peer link. It is a link measurement, not a distance.',
      'Clip raw SINR to −20…40 dB, then (SINR + 20) / 60. Invalid links become 0.',
    ],
    sinr_db: [
      'Link SINR in dB',
      'Raw current signal-to-interference-plus-noise ratio for this peer link.',
      'No normalization; units are dB.',
    ],
    cap_n: [
      'Link capacity, normalized',
      'Current simulator-computed capacity of this peer link, derived from SINR and the configured rate model; not delivered traffic.',
      'clip(log10(1 + capacity in Mbps) / 4, 0, 1).',
    ],
    capacity_mbps: [
      'Link capacity',
      'Current simulator-computed capacity of this peer link, derived from SINR and the configured rate model.',
      'No normalization; units are Mbps.',
    ],
    is_los: [
      'Line of sight',
      '1 means the current link condition is LOS; 0 means NLOS.',
      'Binary flag: 0 or 1.',
    ],
    demand_log_n: [
      'Traffic demand',
      'Requested traffic averaged over the previous completed decision window.',
      'clip(log10(1 + demand Mbps per tick) / 4, 0, 1).',
    ],
    delivered_log_n: [
      'Delivered traffic',
      'Delivered traffic averaged over the previous completed decision window.',
      'clip(log10(1 + delivered Mbps per tick) / 4, 0, 1).',
    ],
    delivery_ratio: [
      'Delivery ratio',
      'Delivered traffic divided by requested traffic in the previous completed decision window.',
      'Clipped to [0, 1]; zero demand maps to 0.',
    ],
    connected_fraction: [
      'Connected-link fraction',
      'Fraction of link-ticks connected in the previous decision window.',
      'Connected pair count / (window ticks × number of links).',
    ],
    unroutable_fraction: [
      'Unroutable-flow fraction',
      'Fraction of demand-bearing flow-ticks with no route in the previous decision window.',
      'Unroutable flow-ticks / flow-ticks with demand.',
    ],
    service_gap_log_n: [
      'Unmet traffic demand',
      'Requested minus delivered traffic in the previous decision window.',
      'clip(log10(1 + unmet Mbps per tick) / 4, 0, 1).',
    ],
  }
  const detail = details[field]
  if (detail) return { title: detail[0], owner, meaning: detail[1], calculation: detail[2] }
  return {
    title: field.replace(/_/g, ' '),
    owner,
    meaning: 'Saved feature for this controlled slot or peer.',
    calculation: 'Check the saved normalization and bounds below for this preset.',
  }
}
