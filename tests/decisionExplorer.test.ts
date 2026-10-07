import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APPLIED_UNAVAILABLE_REASON,
  brushRangeForColumns,
  bucketize,
  buildDecisionIndex,
  columnForDecision,
  decisionAtTime,
  deriveApplied,
  joinDecision,
  makeRowIndex,
  nearestDecision,
  resolveHoldIndex,
  stepDecision,
} from '../src/lib/decisionExplorer.ts'
import type { DecisionIndex, EpisodeTelemetry } from '../src/lib/decisionExplorer.ts'
import { recordForDecision } from '../src/lib/episodeTelemetry.ts'
import { makeTelemetry, prng } from './helpers/syntheticTelemetry.ts'

type MutableStep = Record<string, unknown>

/** Deep clone of a synthetic episode so tests can corrupt it freely. */
function cloneTelemetry(t: EpisodeTelemetry): EpisodeTelemetry {
  return structuredClone(t)
}

function mutableSteps(t: EpisodeTelemetry): MutableStep[] {
  return t.steps as unknown as MutableStep[]
}

// --- resolveHoldIndex / deriveApplied -------------------------------------

test('resolveHoldIndex finds a unique hold, trimmed and case-insensitive', () => {
  assert.equal(resolveHoldIndex(['west', 'hold', 'east']), 1)
  assert.equal(resolveHoldIndex(['west', 'east', ' Hold ']), 2)
  assert.equal(resolveHoldIndex(['west', 'east']), null)
  assert.equal(resolveHoldIndex([]), null)
  assert.equal(resolveHoldIndex(['hold', 'east', 'HOLD']), null)
})

test('deriveApplied replaces exactly the revalidated slots with hold', () => {
  assert.deepEqual(deriveApplied([0, 1, 2, 3], [1, 3], 9), {
    status: 'derived',
    values: [0, 9, 2, 9],
  })
  const requested = [3, 2, 1]
  const copy = deriveApplied(requested, [], 4)
  assert.equal(copy.status, 'derived')
  assert.ok(copy.status === 'derived')
  assert.deepEqual(copy.values, requested)
  assert.notEqual(copy.values, requested)
  assert.deepEqual(deriveApplied([0, 1], [-1, 2, 7, 1.5], 4), { status: 'derived', values: [0, 1] })
  assert.deepEqual(deriveApplied([0, 1], [0], null), {
    status: 'unavailable',
    reason: "no unique 'hold' action in contract.action_meanings",
  })
  assert.equal(APPLIED_UNAVAILABLE_REASON, "no unique 'hold' action in contract.action_meanings")
})

// --- buildDecisionIndex ---------------------------------------------------

test('buildDecisionIndex sorts decisions and finds every sampled hole', () => {
  const { telemetry } = makeTelemetry({ decisions: 10, sampledEvery: 3 })
  const idx = buildDecisionIndex(telemetry)
  assert.ok(idx.decisions instanceof Int32Array)
  assert.deepEqual(Array.from(idx.decisions), [0, 3, 6, 9, 10])
  assert.deepEqual(idx.gaps, [
    { afterDecision: 0, beforeDecision: 3, missing: 2 },
    { afterDecision: 3, beforeDecision: 6, missing: 2 },
    { afterDecision: 6, beforeDecision: 9, missing: 2 },
  ])
  assert.equal(idx.minDecision, 0)
  assert.equal(idx.maxDecision, 10)
  assert.equal(idx.expected, 10)
  assert.equal(idx.coverageKnown, true)
  assert.equal(idx.tickS, 0.5)
})

test('buildDecisionIndex reports explicit drops as gaps', () => {
  const { telemetry } = makeTelemetry({ decisions: 10, dropDecisions: [4, 7, 8] })
  const idx = buildDecisionIndex(telemetry)
  assert.deepEqual(Array.from(idx.decisions), [0, 1, 2, 3, 5, 6, 9, 10])
  assert.deepEqual(idx.gaps, [
    { afterDecision: 3, beforeDecision: 5, missing: 1 },
    { afterDecision: 6, beforeDecision: 9, missing: 2 },
  ])
})

test('buildDecisionIndex trusts a valid num_decisions and appends a trailing gap', () => {
  const { telemetry } = makeTelemetry({ decisions: 10, numDecisions: 15 })
  const idx = buildDecisionIndex(telemetry)
  assert.equal(idx.expected, 15)
  assert.equal(idx.coverageKnown, true)
  assert.deepEqual(idx.gaps.at(-1), { afterDecision: 10, beforeDecision: 16, missing: 5 })
  assert.equal(idx.gaps.length, 1)
})

test('buildDecisionIndex without num_decisions never invents a trailing gap', () => {
  const omitted = buildDecisionIndex(makeTelemetry({ decisions: 10, numDecisions: null }).telemetry)
  assert.equal(omitted.expected, omitted.maxDecision)
  assert.equal(omitted.expected, 10)
  assert.equal(omitted.coverageKnown, false)
  assert.deepEqual(omitted.gaps, [])

  const tooSmall = buildDecisionIndex(makeTelemetry({ decisions: 10, numDecisions: 5 }).telemetry)
  assert.equal(tooSmall.coverageKnown, false)
  assert.equal(tooSmall.expected, 10)
  assert.deepEqual(tooSmall.gaps, [])
})

test('buildDecisionIndex resolves hold and tick_s from the contract', () => {
  assert.equal(
    buildDecisionIndex(makeTelemetry({ decisions: 4, holdIndex: 2 }).telemetry).holdIndex,
    2
  )
  assert.equal(
    buildDecisionIndex(makeTelemetry({ decisions: 4, holdIndex: null }).telemetry).holdIndex,
    null
  )
  assert.equal(
    buildDecisionIndex(makeTelemetry({ decisions: 4, tickS: 0.25 }).telemetry).tickS,
    0.25
  )
})

test('buildDecisionIndex rejects malformed decision order and timing', () => {
  const base = makeTelemetry({ decisions: 6 }).telemetry

  const duplicate = cloneTelemetry(base)
  const dupSteps = mutableSteps(duplicate)
  dupSteps[4] = { ...dupSteps[3], tick: 1000, time_s: 1000 }
  dupSteps.length = 5
  assert.equal(dupSteps[3].decision, 3)
  assert.equal(dupSteps[4].decision, 3)
  assert.throws(() => buildDecisionIndex(duplicate), /duplicate decision 3/)

  const fractional = cloneTelemetry(base)
  mutableSteps(fractional)[2].decision = 2.5
  assert.throws(() => buildDecisionIndex(fractional), /non-integer decision/)

  const unordered = cloneTelemetry(base)
  const unorderedSteps = mutableSteps(unordered)
  unorderedSteps[3].decision = 1
  assert.throws(() => buildDecisionIndex(unordered), /not in ascending order/)

  const reversedTick = cloneTelemetry(base)
  mutableSteps(reversedTick)[3].tick = 1
  assert.throws(() => buildDecisionIndex(reversedTick), /tick does not increase/)

  const flatTick = cloneTelemetry(base)
  const flatSteps = mutableSteps(flatTick)
  flatSteps[3].tick = flatSteps[2].tick
  assert.throws(() => buildDecisionIndex(flatTick), /tick does not increase/)

  const nanTime = cloneTelemetry(base)
  mutableSteps(nanTime)[2].time_s = NaN
  assert.throws(() => buildDecisionIndex(nanTime), /nonfinite time_s/)

  const infTime = cloneTelemetry(base)
  mutableSteps(infTime)[5].time_s = Infinity
  assert.throws(() => buildDecisionIndex(infTime), /nonfinite time_s/)

  const flatTime = cloneTelemetry(base)
  const flatTimeSteps = mutableSteps(flatTime)
  flatTimeSteps[4].time_s = flatTimeSteps[3].time_s
  assert.throws(() => buildDecisionIndex(flatTime), /time_s does not increase/)
})

// --- recordForDecision ----------------------------------------------------

test('recordForDecision is exact: dropped and fractional decisions give null', () => {
  const { telemetry } = makeTelemetry({ decisions: 8, dropDecisions: [3] })
  for (const n of [0, 1, 2, 4, 8]) assert.equal(recordForDecision(telemetry, n)?.decision, n)
  assert.equal(recordForDecision(telemetry, 3), null)
  assert.equal(recordForDecision(telemetry, 2.5), null)
  assert.equal(recordForDecision(telemetry, 9), null)
})

// --- joinDecision ---------------------------------------------------------

test('joinDecision on decision 0 is the reset snapshot', () => {
  const { telemetry } = makeTelemetry({ decisions: 5 })
  const idx = buildDecisionIndex(telemetry)
  const reset = joinDecision(telemetry, idx, 0)
  assert.ok(reset)
  assert.equal(reset.kind, 'reset')
  assert.equal(reset.input, null)
  assert.equal(reset.action, null)
  assert.equal(reset.outcome, null)
  assert.equal(reset.sourceRecord, null)
  assert.equal(reset.record.decision, 0)
})

test('joinDecision takes inputs from n-1 and outcome from n', () => {
  const slots = 3
  const { telemetry, truth } = makeTelemetry({ decisions: 30, slots, rewardNullEvery: 4 })
  const idx = buildDecisionIndex(telemetry)
  const hold = idx.holdIndex
  assert.equal(hold, 4)
  let maskDiffers = 0
  let nullRewards = 0
  for (let n = 1; n <= 30; n++) {
    const j = joinDecision(telemetry, idx, n)
    assert.ok(j)
    assert.equal(j.kind, 'action')
    assert.equal(j.decision, n)
    assert.equal(j.record.decision, n)
    assert.equal(j.sourceRecord?.decision, n - 1)

    assert.ok(j.input && j.input.status === 'exact')
    assert.equal(j.input.sourceDecision, n - 1)
    assert.equal(j.input.obsSha256, truth.obsByDecision.get(n - 1))
    assert.deepEqual(j.input.mask, truth.maskByDecision.get(n - 1))
    if (JSON.stringify(j.input.mask) !== JSON.stringify(truth.maskByDecision.get(n))) maskDiffers++
    assert.equal(j.input.maskBySlot?.length, slots)

    assert.ok(j.action && !('status' in j.action))
    const requested = truth.actionByDecision.get(n)
    const reval = truth.revalByDecision.get(n)
    assert.ok(requested && reval)
    assert.deepEqual(j.action.requested, requested)
    assert.deepEqual(j.action.revalidatedSlots, reval)
    assert.ok(j.action.applied.status === 'derived')
    assert.deepEqual(
      j.action.applied.values,
      requested.map((v, s) => (reval.includes(s) ? hold : v))
    )

    assert.ok(j.outcome)
    const rec = j.record
    assert.equal(j.outcome.intervalStartS, rec.time_s - rec.ticks_in_step * 0.5)
    assert.equal(j.outcome.intervalEndS, rec.time_s)
    const expectedReward = truth.rewardByDecision.get(n)
    if (expectedReward === null) {
      nullRewards++
      assert.equal(j.outcome.reward, null)
    } else {
      assert.equal(j.outcome.reward?.total, expectedReward)
    }
  }
  assert.ok(maskDiffers > 0, 'record n mask should differ from the input mask for some n')
  assert.ok(nullRewards > 0)
})

test('joinDecision reports a sampled-out source without substituting', () => {
  const { telemetry, truth } = makeTelemetry({ decisions: 10, sampledEvery: 2 })
  const idx = buildDecisionIndex(telemetry)
  for (const n of [2, 4, 6, 8, 10]) {
    const j = joinDecision(telemetry, idx, n)
    assert.ok(j)
    assert.deepEqual(j.input, { status: 'missing_source', sourceDecision: n - 1 })
    assert.equal(j.sourceRecord, null)
    assert.ok(j.action && !('status' in j.action))
    assert.deepEqual(j.action.requested, truth.actionByDecision.get(n))
    assert.ok(j.outcome)
    assert.equal(j.outcome.intervalEndS, j.record.time_s)
  }
  assert.equal(joinDecision(telemetry, idx, 3), null)
  assert.equal(joinDecision(telemetry, idx, 11), null)
})

test('joinDecision without action_sent marks the action unavailable', () => {
  const base = makeTelemetry({ decisions: 5 }).telemetry
  const t = cloneTelemetry(base)
  mutableSteps(t)[3].action_sent = null
  const idx = buildDecisionIndex(t)
  const j = joinDecision(t, idx, 3)
  assert.ok(j)
  assert.equal(j.kind, 'action')
  assert.deepEqual(j.action, { status: 'unavailable', reason: 'no action_sent in record' })
})

test('joinDecision without a unique hold cannot derive the applied action', () => {
  const { telemetry } = makeTelemetry({ decisions: 5, holdIndex: null })
  const idx = buildDecisionIndex(telemetry)
  const j = joinDecision(telemetry, idx, 2)
  assert.ok(j && j.action && !('status' in j.action))
  assert.equal(j.action.applied.status, 'unavailable')
})

test('joinDecision without tick_s has no interval start', () => {
  const t = cloneTelemetry(makeTelemetry({ decisions: 5 }).telemetry)
  ;(t.header.contract as { tick_s?: number }).tick_s = undefined
  const idx = buildDecisionIndex(t)
  assert.equal(idx.tickS, null)
  const j = joinDecision(t, idx, 2)
  assert.ok(j?.outcome)
  assert.equal(j.outcome.intervalStartS, null)
  assert.equal(j.outcome.intervalEndS, j.record.time_s)
})

// --- navigation -----------------------------------------------------------

test('nearestDecision snaps to the closest present decision, earlier on a tie', () => {
  const idx = buildDecisionIndex(makeTelemetry({ decisions: 10, sampledEvery: 2 }).telemetry)
  assert.deepEqual(Array.from(idx.decisions), [0, 2, 4, 6, 8, 10])
  assert.equal(nearestDecision(idx, 4), 4)
  assert.equal(nearestDecision(idx, 2.4), 2)
  assert.equal(nearestDecision(idx, 3.4), 4)
  assert.equal(nearestDecision(idx, 3), 2)
  assert.equal(nearestDecision(idx, 7), 6)
  assert.equal(nearestDecision(idx, -5), 0)
  assert.equal(nearestDecision(idx, 99), 10)
})

test('stepDecision skips holes and stops at edges and range bounds', () => {
  const idx = buildDecisionIndex(
    makeTelemetry({ decisions: 10, sampledEvery: 2, dropDecisions: [6] }).telemetry
  )
  assert.deepEqual(Array.from(idx.decisions), [0, 2, 4, 8, 10])
  assert.equal(stepDecision(idx, 4, 1), 8)
  assert.equal(stepDecision(idx, 8, -1), 4)
  assert.equal(stepDecision(idx, 0, 1), 2)
  assert.equal(stepDecision(idx, 10, 1), null)
  assert.equal(stepDecision(idx, 0, -1), null)
  assert.equal(stepDecision(idx, 4, 1, [0, 6]), null)
  assert.equal(stepDecision(idx, 4, -1, [3, 10]), null)
  assert.equal(stepDecision(idx, 4, 1, [0, 8]), 8)
  assert.equal(stepDecision(idx, 5, 1), 8)
  assert.equal(stepDecision(idx, 5, -1), 4)
  assert.equal(stepDecision(idx, 3, 1), 4)
  assert.equal(stepDecision(idx, 3, -1), 2)
})

test('decisionAtTime maps a time to the window (n-1, n] that contains it', () => {
  const idx = buildDecisionIndex(
    makeTelemetry({ decisions: 6, tickS: 0.5, ticksInStep: 2 }).telemetry
  )
  assert.equal(decisionAtTime(idx, 0), 0)
  assert.equal(decisionAtTime(idx, 0.25), 1)
  assert.equal(decisionAtTime(idx, 1), 1)
  assert.equal(decisionAtTime(idx, 1.5), 2)
  assert.equal(decisionAtTime(idx, 6), 6)
  assert.equal(decisionAtTime(idx, 6.5), null)
  assert.equal(decisionAtTime(idx, -0.5), null)

  const dropped = buildDecisionIndex(makeTelemetry({ decisions: 6, dropDecisions: [3] }).telemetry)
  assert.equal(decisionAtTime(dropped, 2.5), null)
  assert.equal(decisionAtTime(dropped, 3.5), 4)

  const reset = buildDecisionIndex(makeTelemetry({ decisions: 6, resetOnly: true }).telemetry)
  assert.equal(decisionAtTime(reset, 0), 0)
  assert.equal(decisionAtTime(reset, 0.5), null)
})

// --- bucketize ------------------------------------------------------------

function bruteBucket(idx: DecisionIndex, first: number, last: number) {
  const present = new Set<number>()
  let count = 0
  let min = NaN
  let max = NaN
  for (let i = 0; i < idx.decisions.length; i++) {
    const d = idx.decisions[i]
    if (d < first || d > last) continue
    present.add(d)
    count++
    const r = idx.rewardTotals[i]
    if (Number.isNaN(r)) continue
    if (Number.isNaN(min) || r < min) min = r
    if (Number.isNaN(max) || r > max) max = r
  }
  let hasGap = false
  for (let d = Math.max(first, idx.minDecision); d <= Math.min(last, idx.expected); d++) {
    if (!present.has(d)) {
      hasGap = true
      break
    }
  }
  return { count, min, max, hasGap }
}

function sameNumber(actual: number, expected: number, message: string) {
  if (Number.isNaN(expected)) assert.ok(Number.isNaN(actual), message)
  else assert.equal(actual, expected, message)
}

test('bucketize matches a brute-force pass for several column counts', () => {
  const { telemetry, truth } = makeTelemetry({
    decisions: 5000,
    sampledEvery: 3,
    dropDecisions: [300, 301, 302, 303, 1500, 2400, 2403, 2406, 4998],
    numDecisions: 5100,
    rewardNullEvery: 9,
  })
  const idx = buildDecisionIndex(telemetry)
  const presentInDomain = truth.presentDecisions.filter(
    (d) => d >= idx.minDecision && d <= idx.expected
  ).length
  for (const columns of [7, 64, 1600]) {
    const buckets = bucketize(idx, columns)
    assert.equal(buckets.length, columns)
    assert.equal(buckets[0].firstDecision, idx.minDecision)
    assert.equal(buckets.at(-1)?.lastDecision, idx.expected)
    assert.equal(
      buckets.reduce((s, b) => s + b.count, 0),
      presentInDomain
    )
    let allNull = 0
    for (const b of buckets) {
      const label = `columns ${columns} bucket ${b.x} [${b.firstDecision}, ${b.lastDecision}]`
      const brute = bruteBucket(idx, b.firstDecision, b.lastDecision)
      assert.equal(b.count, brute.count, label)
      sameNumber(b.minReward, brute.min, label)
      sameNumber(b.maxReward, brute.max, label)
      assert.equal(b.hasGap, brute.hasGap, label)
      if (b.count === 1) {
        const d = idx.decisions.find((v) => v >= b.firstDecision && v <= b.lastDecision)
        assert.ok(d !== undefined)
        const exact = truth.rewardByDecision.get(d)
        if (exact !== null && exact !== undefined) {
          assert.equal(b.minReward, exact, label)
          assert.equal(b.maxReward, exact, label)
        }
      }
      if (b.count > 0 && Number.isNaN(b.minReward)) {
        allNull++
        assert.ok(Number.isNaN(b.maxReward))
      }
    }
    if (columns === 1600) assert.ok(allNull > 0, 'expected some all-null-reward buckets')
    // the trailing coverage hole is always flagged
    assert.equal(buckets.at(-1)?.hasGap, true)
  }
})

test('bucketize handles zero columns, a custom domain and columns wider than the span', () => {
  const { telemetry, truth } = makeTelemetry({
    decisions: 1000,
    sampledEvery: 2,
    dropDecisions: [200, 202],
  })
  const idx = buildDecisionIndex(telemetry)
  assert.deepEqual(bucketize(idx, 0), [])

  const domain = bucketize(idx, 7, [100, 400])
  assert.equal(domain.length, 7)
  assert.equal(domain[0].firstDecision, 100)
  assert.equal(domain.at(-1)?.lastDecision, 400)
  assert.equal(
    domain.reduce((s, b) => s + b.count, 0),
    truth.presentDecisions.filter((d) => d >= 100 && d <= 400).length
  )
  for (const b of domain) {
    const brute = bruteBucket(idx, b.firstDecision, b.lastDecision)
    assert.equal(b.count, brute.count)
    sameNumber(b.minReward, brute.min, `domain bucket ${b.x}`)
    sameNumber(b.maxReward, brute.max, `domain bucket ${b.x}`)
    assert.equal(b.hasGap, brute.hasGap)
  }

  // 50 columns over 11 decisions: several columns share one decision; only
  // one of them owns it, the others are empty and never flag a gap.
  const small = buildDecisionIndex(makeTelemetry({ decisions: 10, sampledEvery: 2 }).telemetry)
  const wide = bucketize(small, 50)
  assert.equal(wide.length, 50)
  assert.equal(
    wide.reduce((s, b) => s + b.count, 0),
    small.decisions.length
  )
  const byDecision = new Map<number, typeof wide>()
  for (const b of wide) {
    assert.equal(b.firstDecision, b.lastDecision)
    const group = byDecision.get(b.firstDecision) ?? []
    group.push(b)
    byDecision.set(b.firstDecision, group)
  }
  assert.equal(byDecision.size, 11)
  for (const [d, group] of byDecision) {
    const brute = bruteBucket(small, d, d)
    assert.equal(
      group.reduce((s, b) => s + b.count, 0),
      brute.count,
      `decision ${d}`
    )
    assert.equal(group.filter((b) => b.hasGap).length, brute.hasGap ? 1 : 0, `decision ${d}`)
    const owners = group.filter((b) => b.count > 0 || b.hasGap)
    assert.equal(owners.length, 1, `decision ${d} has exactly one owning column`)
    for (const b of group) {
      if (b === owners[0]) continue
      assert.equal(b.count, 0)
      assert.equal(b.hasGap, false)
    }
  }
})

test('timeline markers use the same owning column as buckets at real episode widths', () => {
  const dense = buildDecisionIndex(makeTelemetry({ decisions: 120 }).telemetry)
  const domain: [number, number] = [dense.minDecision, dense.expected]
  for (const columns of [50, 600]) {
    const buckets = bucketize(dense, columns, domain)
    for (let decision = domain[0]; decision <= domain[1]; decision++) {
      const x = columnForDecision(decision, domain, columns)
      const owner = buckets[x]
      assert.ok(owner.firstDecision <= decision && decision <= owner.lastDecision)
      assert.ok(owner.count > 0, `decision ${decision} must have a saved owner at ${x}`)
    }
  }

  const wide = bucketize(dense, 600, domain)
  assert.equal(columnForDecision(1, domain, 600), 9)
  assert.equal(wide[9].firstDecision, 1)
  assert.equal(wide[4].firstDecision, 0)
  for (const bucket of wide) {
    if (bucket.count === 0 && !bucket.hasGap) {
      const owner = wide[columnForDecision(bucket.firstDecision, domain, 600)]
      assert.equal(owner.firstDecision, bucket.firstDecision)
      assert.ok(owner.count > 0)
    }
  }

  const sampled = buildDecisionIndex(makeTelemetry({ decisions: 120, sampledEvery: 2 }).telemetry)
  const sampledBuckets = bucketize(sampled, 600, domain)
  const missingOwner = sampledBuckets[columnForDecision(1, domain, 600)]
  assert.equal(missingOwner.count, 0)
  assert.equal(missingOwner.hasGap, true)
})

test('brush endpoints include the decision named by every timeline column', () => {
  for (const sampledEvery of [1, 2]) {
    const index = buildDecisionIndex(makeTelemetry({ decisions: 120, sampledEvery }).telemetry)
    const domain: [number, number] = [index.minDecision, index.expected]
    const buckets = bucketize(index, 600, domain)
    for (const start of [0, 200, 599]) {
      for (let end = 0; end < buckets.length; end++) {
        const range = brushRangeForColumns(buckets, start, end)
        assert.ok(range)
        const named = buckets[end].firstDecision
        assert.ok(range[0] <= named && named <= range[1], `start ${start}, end ${end}`)
        assert.equal(range[0], buckets[Math.min(start, end)].firstDecision)
        assert.equal(range[1], buckets[Math.max(start, end)].lastDecision)
      }
    }
  }
})

// --- makeRowIndex ---------------------------------------------------------

function rowsOf(rows: ReturnType<typeof makeRowIndex>) {
  const out = []
  for (let i = 0; i < rows.length; i++) out.push(rows.rowAt(i))
  return out
}

test('makeRowIndex interleaves present decisions with collapsed holes', () => {
  const idx = buildDecisionIndex(makeTelemetry({ decisions: 10, sampledEvery: 2 }).telemetry)
  const rows = makeRowIndex(idx, [0, 10])
  assert.equal(rows.length, 6 + 5)
  const all = rowsOf(rows)
  for (let i = 0; i < all.length; i++) {
    const row = all[i]
    assert.ok(row)
    if (i % 2 === 0) assert.deepEqual(row, { kind: 'decision', decision: i })
    else
      assert.deepEqual(row, {
        kind: 'gap',
        gap: { afterDecision: i - 1, beforeDecision: i + 1, missing: 1 },
      })
  }
  assert.equal(rows.rowAt(-1), null)
  assert.equal(rows.rowAt(rows.length), null)
  assert.equal(rows.rowAt(1.5), null)
})

test('makeRowIndex collapses a multi-decision hole and clips a leading hole', () => {
  const idx = buildDecisionIndex(
    makeTelemetry({ decisions: 10, dropDecisions: [5, 6, 7] }).telemetry
  )
  const full = rowsOf(makeRowIndex(idx, [0, 10]))
  assert.equal(full.length, 8 + 1)
  assert.deepEqual(full[5], {
    kind: 'gap',
    gap: { afterDecision: 4, beforeDecision: 8, missing: 3 },
  })
  assert.deepEqual(full[6], { kind: 'decision', decision: 8 })

  const clipped = makeRowIndex(idx, [6, 10])
  assert.equal(clipped.length, 1 + 3)
  assert.deepEqual(rowsOf(clipped), [
    { kind: 'gap', gap: { afterDecision: 5, beforeDecision: 8, missing: 2 } },
    { kind: 'decision', decision: 8 },
    { kind: 'decision', decision: 9 },
    { kind: 'decision', decision: 10 },
  ])
})

test('makeRowIndex ends with the trailing coverage gap when the range reaches expected', () => {
  const idx = buildDecisionIndex(makeTelemetry({ decisions: 10, numDecisions: 15 }).telemetry)
  const rows = makeRowIndex(idx, [0, idx.expected])
  assert.equal(rows.length, 11 + 1)
  assert.deepEqual(rows.rowAt(rows.length - 1), {
    kind: 'gap',
    gap: { afterDecision: 10, beforeDecision: 16, missing: 5 },
  })
  assert.deepEqual(rows.rowAt(rows.length - 2), { kind: 'decision', decision: 10 })
})

// --- stress ---------------------------------------------------------------

for (const N of [12000, 200000]) {
  test(`stress: ${N} decisions, sampled every 2 with ~1% dropped`, () => {
    // drop every 100th kept (even) decision, never the last one
    const drop: number[] = []
    for (let d = 100; d < N; d += 200) drop.push(d)
    const t0 = performance.now()
    const { telemetry, truth } = makeTelemetry({
      decisions: N,
      sampledEvery: 2,
      dropDecisions: drop,
    })
    const tBuild = performance.now()
    const idx = buildDecisionIndex(telemetry)
    const tIndex = performance.now()
    assert.equal(idx.decisions.length, telemetry.steps.length)
    assert.equal(idx.decisions.length, truth.presentDecisions.length)

    const rand = prng(N)
    const present = truth.presentDecisions
    const tJoin0 = performance.now()
    for (let i = 0; i < 1000; i++) {
      const n = present[Math.floor(rand() * present.length)]
      const j = joinDecision(telemetry, idx, n)
      assert.ok(j, `join ${n}`)
      if (n === 0) {
        assert.equal(j.kind, 'reset')
        continue
      }
      assert.ok(j.input)
      assert.equal(j.input.sourceDecision, n - 1)
      if (truth.obsByDecision.has(n - 1)) {
        assert.equal(j.input.status, 'exact')
        assert.ok(j.input.status === 'exact')
        assert.equal(j.input.obsSha256, truth.obsByDecision.get(n - 1))
      } else {
        assert.equal(j.input.status, 'missing_source')
      }
    }
    const tJoin = performance.now()

    for (let i = 0; i < 1000; i++) {
      const guess = rand() * (N + 10) - 5
      const d = nearestDecision(idx, guess)
      assert.ok(recordForDecision(telemetry, d))
    }
    const tNearest = performance.now()

    const buckets = bucketize(idx, 1600)
    const tBucket = performance.now()
    assert.equal(buckets.length, 1600)
    assert.equal(
      buckets.reduce((s, b) => s + b.count, 0),
      telemetry.steps.length
    )

    console.log(
      `[stress N=${N}] records=${telemetry.steps.length} generate=${(tBuild - t0).toFixed(1)}ms ` +
        `buildIndex=${(tIndex - tBuild).toFixed(1)}ms join×1000=${(tJoin - tJoin0).toFixed(1)}ms ` +
        `nearest×1000=${(tNearest - tJoin).toFixed(1)}ms bucketize(1600)=${(tBucket - tNearest).toFixed(1)}ms`
    )
  })
}
