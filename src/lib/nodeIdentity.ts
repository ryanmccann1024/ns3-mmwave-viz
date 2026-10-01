// Checked mapping between telemetry contract node IDs (strings such as "node-a")
// and the numeric node_id used by the playback CSVs.
//
// The simulator fills contract.node_ids in nodes.json order and writes each node's
// index in that order as the CSV node_id, so the mapping is ordinal:
// contract.node_ids[i] <-> CSV id i. It is only trusted when every roster check
// below passes; string IDs are never coerced to numbers.

export type NodeMapping =
  | {
      status: 'mapped'
      csvIdByContractId: Map<string, number>
      contractIdByCsvId: Map<number, string>
      slotByCsvId: Map<number, number>
      csvIdBySlot: (number | null)[]
    }
  | { status: 'unavailable'; reason: string }

export function buildNodeMapping(
  contract: { node_ids: readonly string[]; slot_node_ids: readonly (string | null)[] },
  csvNodeIds: ReadonlySet<number>,
  archivedNodeIds?: readonly string[]
): NodeMapping {
  const nodeIds = Array.isArray(contract.node_ids) ? contract.node_ids : []
  if (nodeIds.length === 0) return { status: 'unavailable', reason: 'contract has no node_ids' }

  const csvIdByContractId = new Map<string, number>()
  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i]
    if (typeof id !== 'string' || id === '' || csvIdByContractId.has(id)) {
      return { status: 'unavailable', reason: 'duplicate or empty contract node id' }
    }
    csvIdByContractId.set(id, i)
  }

  // The loaded frame must carry exactly the ids 0..N-1: no extras, none missing.
  if (csvNodeIds.size !== nodeIds.length) {
    return { status: 'unavailable', reason: 'CSV roster does not match contract order' }
  }
  for (let i = 0; i < nodeIds.length; i++) {
    if (!csvNodeIds.has(i)) {
      return { status: 'unavailable', reason: 'CSV roster does not match contract order' }
    }
  }

  if (archivedNodeIds !== undefined) {
    if (
      archivedNodeIds.length !== nodeIds.length ||
      archivedNodeIds.some((id, i) => id !== nodeIds[i])
    ) {
      return { status: 'unavailable', reason: 'archived nodes.json order differs from contract' }
    }
  }

  const slots = Array.isArray(contract.slot_node_ids) ? contract.slot_node_ids : []
  const slotByCsvId = new Map<number, number>()
  const csvIdBySlot: (number | null)[] = []
  for (let slot = 0; slot < slots.length; slot++) {
    const id = slots[slot]
    if (id === null) {
      csvIdBySlot.push(null)
      continue
    }
    const csvId = typeof id === 'string' ? csvIdByContractId.get(id) : undefined
    if (csvId === undefined) {
      return {
        status: 'unavailable',
        reason: `slot_node_ids references unknown node ${String(id)}`,
      }
    }
    if (slotByCsvId.has(csvId)) {
      return { status: 'unavailable', reason: `slot_node_ids lists node ${id} more than once` }
    }
    slotByCsvId.set(csvId, slot)
    csvIdBySlot.push(csvId)
  }

  const contractIdByCsvId = new Map<number, string>()
  for (const [id, csvId] of csvIdByContractId) contractIdByCsvId.set(csvId, id)
  return { status: 'mapped', csvIdByContractId, contractIdByCsvId, slotByCsvId, csvIdBySlot }
}

export type DeclaredNodeIds =
  | { status: 'absent' }
  | { status: 'valid'; ids: string[] }
  | { status: 'invalid'; reason: string }

/**
 * Ordered node IDs from an archived inputs/nodes.json (an array of objects with a
 * string `id`). A present but malformed file is reported as invalid, not ignored.
 */
export function parseArchivedNodeIds(text: string | undefined | null): DeclaredNodeIds {
  if (text === undefined || text === null) return { status: 'absent' }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { status: 'invalid', reason: 'nodes.json is not valid JSON' }
  }
  if (!Array.isArray(value)) return { status: 'invalid', reason: 'nodes.json is not an array' }
  const ids: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < value.length; i++) {
    const entry: unknown = value[i]
    const id =
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        ? (entry as { id?: unknown }).id
        : undefined
    if (typeof id !== 'string' || id === '') {
      return { status: 'invalid', reason: `nodes.json entry ${i} has no string id` }
    }
    if (seen.has(id)) return { status: 'invalid', reason: `nodes.json repeats id ${id}` }
    seen.add(id)
    ids.push(id)
  }
  return { status: 'valid', ids }
}
