import test from 'node:test'
import assert from 'node:assert/strict'
import { replayChoices } from '../src/lib/replayComparison.ts'
import type { Episode, Evaluation } from '../src/lib/experimentIndex.ts'

test('comparison matches seed and training seed and includes baselines only once', () => {
  const ep = (key: string, policy: string, seed = 301, playable = true) =>
    ({
      evaluationKey: key,
      policy,
      seed,
      playable,
      status: 'completed',
      trainingSeed: 101,
      dir: `${key}/${policy}/${seed}`,
    }) as Episode
  const evaluation = (key: string, trainingSeed = 101) =>
    ({
      key,
      label: key,
      trainingSeed,
      episodes: [
        ep(key, 'model'),
        ep(key, 'model', 302),
        ep(key, 'hold'),
        ep(key, 'random_valid', 301, false),
      ],
    }) as Evaluation
  const choices = replayChoices(
    [evaluation('low'), evaluation('strong'), evaluation('other-seed', 102)],
    ep('low', 'model')
  )
  assert.deepEqual(
    choices.map((c) => c.episode.dir),
    ['low/model/301', 'strong/model/301', 'low/hold/301']
  )
})
