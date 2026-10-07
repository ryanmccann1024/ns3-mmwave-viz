import test from 'node:test'
import assert from 'node:assert/strict'
import { policyDelivery } from '../src/lib/experimentSummary.ts'

const ep = (policy: string, delivery: number | undefined, status = 'completed') => ({
  policy,
  status,
  metrics: delivery === undefined ? {} : { delivery_ratio: delivery },
})

test('policyDelivery averages completed episodes across evaluations, model first', () => {
  const experiment = {
    evaluations: [
      { episodes: [ep('hold', 0.2), ep('model', 0.8), ep('geometric', 0.6)] },
      { episodes: [ep('hold', 0.4), ep('model', 0.6), ep('geometric', 0.9, 'failed')] },
    ],
  }
  // @ts-expect-error minimal fixture: only the fields policyDelivery reads
  const rows = policyDelivery(experiment)
  assert.deepEqual(
    rows.map((r) => [r.policy, Number(r.delivery.toFixed(3))]),
    [
      ['model', 0.7],
      ['geometric', 0.6],
      ['hold', 0.3],
    ]
  )
})

test('policyDelivery skips policies without measured episodes', () => {
  // @ts-expect-error minimal fixture: only the fields policyDelivery reads
  assert.deepEqual(policyDelivery({ evaluations: [{ episodes: [ep('hold', undefined)] }] }), [])
})
