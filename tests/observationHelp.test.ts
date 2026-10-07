import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeFeature } from '../src/lib/observationHelp.ts'

const contract = {
  node_ids: ['anchor', 'mover', 'other'],
  slot_node_ids: ['mover'],
  action_meanings: ['west', 'east', 'south', 'north', 'hold'],
}

test('slot and peer indices resolve to the saved node IDs', () => {
  assert.match(describeFeature('slot0.active', contract).meaning, /controlled node/)
  const peer = describeFeature('slot0.peer_index0.present', contract)
  assert.match(peer.owner, /mover.*anchor/)
  assert.match(peer.meaning, /not its ID/)
})

test('normalized position and SINR explain their actual transforms', () => {
  assert.match(describeFeature('slot0.x_n', contract).calculation, /configured minimum/)
  assert.match(describeFeature('slot0.peer_index0.sinr_n', contract).calculation, /−20…40 dB/)
  assert.match(describeFeature('slot0.peer_index0.cap_n', contract).calculation, /log10/)
})

test('unknown fields retain a safe generic explanation', () => {
  assert.match(describeFeature('slot0.future_feature', contract).calculation, /saved normalization/)
})
