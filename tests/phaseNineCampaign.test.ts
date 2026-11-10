import test from 'node:test'
import assert from 'node:assert/strict'
import { phaseFromPath, missionMetadata } from '../src/lib/missionComparison.ts'

test('Phase 9 explicit folders override the October 30 legacy Phase 8 date', () => {
  assert.equal(phaseFromPath('custom/10-30/phase-9/main/urban-recovery-3-peers'), 9)
  assert.equal(phaseFromPath('phase-9'), 9)
  assert.equal(phaseFromPath('custom/10-30/phase-8-a/main/x'), 8)
  assert.equal(phaseFromPath('custom/10-30/phase-8-b/main/x'), 8)
  assert.equal(phaseFromPath('custom/10-30'), 8)
  assert.equal(phaseFromPath('custom/10-23/phase-1'), 1)
  assert.deepEqual(missionMetadata('custom/10-30/phase-9', { source_phase: 9 }, {}), {
    phase: 9, origin: 'New', terms: [],
  })
})
