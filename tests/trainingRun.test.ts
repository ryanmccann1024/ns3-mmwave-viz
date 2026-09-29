import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ResultCatalog } from '../src/lib/resultCatalog.ts'
import { discoverTrainingRuns, loadTrainingRun, matchTrainingRun } from '../src/lib/trainingRun.ts'

function fakeCatalog(files: Record<string, unknown>): ResultCatalog {
  const body = (v: unknown) =>
    v instanceof Uint8Array ? v : typeof v === 'string' ? v : JSON.stringify(v)
  return {
    name: 'fake',
    paths: () => Object.keys(files).sort(),
    has: (p) => p in files,
    getFile: async (p) =>
      p in files ? new File([body(files[p]) as BlobPart], p.split('/').pop()!) : null,
  }
}

const record = (
  episode: number,
  status: string,
  decisions: number,
  reward: number,
  stop = 'done'
) => ({
  episode,
  status,
  decisions,
  stop_reason: stop,
  cumulative_reward: reward,
  reward_components_sum: { delivery_ratio: reward * 0.6, connectivity: reward * 0.4 },
})

test('a training run reads its episodes, marks bookkeeping records, and parses evaluations.npz', async () => {
  const npz = new Uint8Array(
    readFileSync(new URL('./fixtures/evaluations-stored.npz', import.meta.url))
  )
  const catalog = fakeCatalog({
    'run/train_manifest.json': {
      status: 'completed',
      algorithm: 'MaskablePPO',
      seed: 1,
      hyperparameters: { total_timesteps: 2000 },
      best_mean_reward: 29.9,
      selection: {
        reward_components: ['delivery_ratio', 'connectivity'],
        reward_weights: [1, 0.5],
      },
      contract: { action_meanings: ['west', 'hold'], slot_node_ids: ['A'] },
      evaluation: { seed: 10 },
    },
    'run/evaluations.npz': npz,
    'run/episode-0000/rl_episode.json': record(0, 'interrupted', 0, 0, 'reset'),
    'run/episode-0001/rl_episode.json': record(1, 'completed', 20, 27.8),
    'run/episode-0001/seed-1/links.csv': 'l',
    'run/episode-0001/seed-1/positions.csv': 'p',
    'run/episode-0002/rl_episode.json': record(2, 'completed', 20, 28.4),
    'run/eval/model/episode-0000/rl_episode.json': record(0, 'completed', 20, 99),
  })
  assert.deepEqual(discoverTrainingRuns(catalog), ['run'])
  const run = await loadTrainingRun(catalog, 'run')
  assert.equal(run.algorithm, 'MaskablePPO')
  assert.deepEqual(run.rewardComponents, ['delivery_ratio', 'connectivity'])
  assert.deepEqual(
    run.episodes.map((e) => [e.index, e.counted, e.playable]),
    [
      [0, false, false],
      [1, true, true],
      [2, true, false],
    ]
  )
  assert.deepEqual(run.checkpoints, [
    { timesteps: 400, returns: [27.5, 28] },
    { timesteps: 800, returns: [29, 29.5] },
  ])
  assert.equal(run.checkpointsError, null)
})

test('an eval bundle run_dir is matched to a catalog training run by trailing path', () => {
  const roots = ['2026-09/22/17-48-31', '2026-09/22/17-50-56']
  assert.equal(matchTrainingRun('outputs/2026-09/22/17-50-56', roots), '2026-09/22/17-50-56')
  assert.equal(matchTrainingRun('/abs/outputs/2026-09/22/17-48-31/', roots), '2026-09/22/17-48-31')
  assert.equal(matchTrainingRun('outputs/2026-09/22/09-00-00', roots), null)
  assert.equal(matchTrainingRun(null, roots), null)
})
