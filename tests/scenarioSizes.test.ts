import test from 'node:test'
import assert from 'node:assert/strict'
import { familyOf, groupScenarioSizes, peerSize } from '../src/lib/scenarioSizes.ts'

test('a team size is read from the folder name', () => {
  assert.deepEqual(peerSize('urban-recovery-6-peers'), { stem: 'urban-recovery', peers: 6 })
  assert.deepEqual(peerSize('rural-jamming-extra-large'), { stem: 'rural-jamming', peers: 9 })
  assert.equal(peerSize('small-jammer'), null)
})

test('sizes of one scenario share a family, smallest first', () => {
  const roots = [
    'c/10-23-5/main/urban-recovery-9-peers',
    'c/10-23-5/main/urban-recovery-3-peers',
    'c/10-23-5/main/urban-jamming-3-peers',
    'c/10-23-5/main/urban-recovery-6-peers',
    'c/10-23-5/main/native-check',
  ].map((root) => ({ root }))
  const families = groupScenarioSizes(roots)
  assert.deepEqual(
    families.map((f) => [f.stem, f.sizes.map((s) => s.peers)]),
    [
      ['urban-recovery', [3, 6, 9]],
      ['urban-jamming', [3]],
      ['native-check', [null]],
    ]
  )
  assert.equal(familyOf(roots, 'c/10-23-5/main/urban-recovery-6-peers')?.key, families[0].key)
})

test('the same stem in different folders stays apart', () => {
  const families = groupScenarioSizes(
    ['a/urban-recovery-3-peers', 'b/urban-recovery-6-peers'].map((root) => ({ root }))
  )
  assert.equal(families.length, 2)
})
