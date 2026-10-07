import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNodeMapping, parseArchivedNodeIds } from '../src/lib/nodeIdentity.ts'

const contract = {
  node_ids: ['node-a', 'node-b', 'node-c'],
  slot_node_ids: ['node-b', null, 'node-c'],
}
const csv = (...ids: number[]) => new Set(ids)

function reasonOf(mapping: ReturnType<typeof buildNodeMapping>): string | null {
  return mapping.status === 'unavailable' ? mapping.reason : null
}

test('maps contract node ids ordinally onto CSV ids and slots', () => {
  const m = buildNodeMapping(contract, csv(0, 1, 2), ['node-a', 'node-b', 'node-c'])
  assert.equal(m.status, 'mapped')
  assert.ok(m.status === 'mapped')
  assert.deepEqual(
    [...m.csvIdByContractId],
    [
      ['node-a', 0],
      ['node-b', 1],
      ['node-c', 2],
    ]
  )
  assert.deepEqual(
    [...m.contractIdByCsvId],
    [
      [0, 'node-a'],
      [1, 'node-b'],
      [2, 'node-c'],
    ]
  )
  assert.deepEqual(m.csvIdBySlot, [1, null, 2])
  assert.deepEqual(
    [...m.slotByCsvId],
    [
      [1, 0],
      [2, 2],
    ]
  )
  assert.equal(m.slotByCsvId.has(0), false)

  const withoutArchive = buildNodeMapping(contract, csv(0, 1, 2))
  assert.equal(withoutArchive.status, 'mapped')
})

test('reports an exact reason for every roster mismatch', () => {
  assert.equal(
    reasonOf(buildNodeMapping({ node_ids: [], slot_node_ids: [] }, csv())),
    'contract has no node_ids'
  )
  assert.equal(
    reasonOf(
      buildNodeMapping({ ...contract, node_ids: ['node-a', 'node-b', 'node-a'] }, csv(0, 1, 2))
    ),
    'duplicate or empty contract node id'
  )
  assert.equal(
    reasonOf(buildNodeMapping({ ...contract, node_ids: ['node-a', '', 'node-c'] }, csv(0, 1, 2))),
    'duplicate or empty contract node id'
  )
  for (const ids of [csv(0, 1), csv(0, 1, 2, 3), csv(0, 1, 5)]) {
    assert.equal(
      reasonOf(buildNodeMapping(contract, ids)),
      'CSV roster does not match contract order'
    )
  }
  for (const archived of [
    ['node-b', 'node-a', 'node-c'],
    ['node-a', 'node-a', 'node-c'],
    ['node-a', 'node-b'],
  ]) {
    assert.equal(
      reasonOf(buildNodeMapping(contract, csv(0, 1, 2), archived)),
      'archived nodes.json order differs from contract'
    )
  }
  assert.equal(
    reasonOf(buildNodeMapping({ ...contract, slot_node_ids: ['node-b', 'node-z'] }, csv(0, 1, 2))),
    'slot_node_ids references unknown node node-z'
  )
  assert.equal(
    reasonOf(
      buildNodeMapping({ ...contract, slot_node_ids: ['node-b', null, 'node-b'] }, csv(0, 1, 2))
    ),
    'slot_node_ids lists node node-b more than once'
  )
})

test('the mapping follows the roster order, never numeric-looking ids', () => {
  const reordered = buildNodeMapping(
    { node_ids: ['node-c', 'node-a'], slot_node_ids: ['node-a'] },
    csv(0, 1),
    ['node-c', 'node-a']
  )
  assert.ok(reordered.status === 'mapped')
  assert.equal(reordered.csvIdByContractId.get('node-c'), 0)
  assert.equal(reordered.csvIdByContractId.get('node-a'), 1)
  assert.deepEqual(reordered.csvIdBySlot, [1])

  const numeric = buildNodeMapping({ node_ids: ['7', '3'], slot_node_ids: ['3'] }, csv(0, 1))
  assert.ok(numeric.status === 'mapped')
  assert.equal(numeric.csvIdByContractId.get('7'), 0)
  assert.equal(numeric.csvIdByContractId.get('3'), 1)
  assert.equal(numeric.contractIdByCsvId.get(7), undefined)
  assert.equal(numeric.contractIdByCsvId.get(3), undefined)
  assert.deepEqual(numeric.csvIdBySlot, [1])

  assert.equal(
    reasonOf(buildNodeMapping({ node_ids: ['7', '3'], slot_node_ids: [] }, csv(7, 3))),
    'CSV roster does not match contract order'
  )
})

test('parseArchivedNodeIds reads ordered ids and reports malformed files', () => {
  assert.deepEqual(parseArchivedNodeIds(undefined), { status: 'absent' })
  assert.deepEqual(parseArchivedNodeIds('[{"id":"a"},{"id":"b"}]'), {
    status: 'valid',
    ids: ['a', 'b'],
  })
  for (const text of [
    '{not json',
    '{"id":"a"}',
    '[{"id":"a"},{"name":"b"}]',
    '[{"id":"a"},{"id":"a"}]',
  ]) {
    const parsed = parseArchivedNodeIds(text)
    assert.equal(parsed.status, 'invalid', text)
    assert.ok(parsed.status === 'invalid')
    assert.ok(parsed.reason.length > 0)
  }
})
