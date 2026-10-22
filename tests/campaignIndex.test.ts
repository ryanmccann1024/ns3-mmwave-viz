import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverExperiments, loadExperiment } from '../src/lib/experimentIndex.ts'
import {
  campaignEvaluationCount,
  campaignScenarios,
  diagnosticScenarios,
} from '../src/lib/campaignIndex.ts'
import { replayChoices } from '../src/lib/replayComparison.ts'
import type { ResultCatalog } from '../src/lib/resultCatalog.ts'

type Data = Record<string, unknown>
const main = 'custom/10-09-3/main'
const seeds = [401, 402]
function catalog(entries: Data): ResultCatalog & { reads: string[] } {
  const reads: string[] = []
  return {
    name: 'campaign',
    reads,
    paths: () => Object.keys(entries).sort(),
    has: (path) => path in entries,
    getFile: async (path) => {
      if (!(path in entries)) return null
      reads.push(path)
      return new File(
        [
          typeof entries[path] === 'string'
            ? (entries[path] as string)
            : JSON.stringify(entries[path]),
        ],
        path
      )
    },
  }
}
function addEvaluation(entries: Data, root: string, label: string) {
  entries[`${root}/eval_manifest.json`] = {
    eval_manifest_version: 3,
    label,
    status: 'completed',
    seed_roles: { training_seed: 101, held_out: true, held_out_seeds: seeds },
    episodes_expected: 4,
    episodes_completed: 4,
    policies: Object.fromEntries(
      ['model', 'hold'].map((policy) => [
        policy,
        {
          episodes: seeds.map((seed, index) => ({
            seed,
            episode_dir: `/external/${policy}/episode-000${index}`,
            status: 'completed',
            metrics: { delivery_ratio: 0.8, travel_m_total: 10 },
            return: 200,
          })),
        },
      ])
    ),
  }
  for (const policy of ['model', 'hold']) {
    seeds.forEach((seed, index) => {
      for (const file of ['links.csv', 'positions.csv'])
        entries[`${root}/${policy}/episode-000${index}/seed-${seed}/${file}`] = 'csv'
    })
  }
}
function fixture(
  scene = 'small-hold',
  profiles = ['stable', 'credit', 'deeper', 'exploration', 'reference', 'wider']
) {
  const entries: Data = {
    'custom/10-09-3/campaign_resolved.json': { campaign_kind: 'adaptive-ppo-v1' },
    [`${main}/selected_profile.json`]: { winner: 'stable' },
  }
  for (const profile of profiles) {
    const root = `${main}/${scene}/${profile}`
    entries[`${root}/experiment_plan.json`] = {
      experiment_plan_version: 1,
      evaluations: [{ label: 'dynamic-balance', training_seed: 101 }],
    }
    entries[`${root}/train/dynamic-balance/train-seed-101/train_manifest.json`] = {
      hyperparameters: { learning_rate: 0.0001, net_arch: [64, 64] },
    }
    addEvaluation(entries, `${root}/eval/dynamic-balance/train-seed-101`, 'dynamic-balance')
  }
  for (const reward of [
    'low-travel',
    'strong-travel',
    'coverage-strong-travel',
    'service-balance',
  ]) {
    addEvaluation(entries, `${main}/references/${scene}/${reward}`, reward)
  }
  addEvaluation(entries, `${main}/baseline-cache/${scene}`, 'cache')
  return entries
}
function addOnline(entries: Data) {
  const root = `${main}/small-moving-jammer/stable/online`
  const episodes = ['fixed_sampled', 'online'].flatMap((mode) =>
    seeds.map((seed) => ({
      mode,
      seed,
      episode_dir: `/external/${mode}/seed-${seed}/episode-0000`,
      update_cycles: mode === 'online' ? 5 : 0,
      metrics: { delivery_ratio: 0.9, endpoint_delivery_ratio: 1 },
    }))
  )
  entries[`${root}/online_manifest.json`] = {
    online_experiment_version: 1,
    seeds,
    status: 'completed',
    episodes,
    settings: { n_steps: 120 },
  }
  for (const entry of episodes) {
    const dir = `${root}/${entry.mode}/seed-${entry.seed}/episode-0000`
    entries[`${dir}/rl_episode.json`] = {
      status: 'completed',
      decisions: 600,
      cumulative_reward: 300,
      reward_components_sum: { delivery_ratio: 400 },
    }
    entries[`${dir}/steps.jsonl`] = ''
    entries[`${dir}/inputs/jammers.json`] = 'initial'
    entries[`${dir}/motion-inputs/jammers.json`] = 'moving'
    for (const file of ['links.csv', 'positions.csv'])
      entries[`${dir}/seed-${entry.seed}/${file}`] = 'csv'
  }
  return root
}

test('adaptive campaign discovery groups profiles and prior rewards by physical scenario, hiding caches', () => {
  const entries = fixture()
  entries['custom/10-09/local-fast/main/small-hold/experiment_plan.json'] = {}
  const c = catalog(entries)
  assert.deepEqual(discoverExperiments(c), [
    { root: `${main}/small-hold`, kind: 'campaign' },
    { root: 'custom/10-09/local-fast/main/small-hold', kind: 'plan' },
  ])
  assert.equal(c.reads.length, 0)
  assert.equal(campaignEvaluationCount(c.paths(), campaignScenarios(c.paths())[0]), 10)
})

test('all six PPO profiles and all four earlier rewards share one scenario and replay chooser', async () => {
  const c = catalog(fixture())
  const experiment = await loadExperiment(c, `${main}/small-hold`)
  assert.equal(experiment.evaluations.length, 10)
  assert.equal(experiment.issues.length, 0)
  assert.equal(new Set(experiment.evaluations.map((e) => e.key)).size, 10)
  const stable = experiment.evaluations[0]
  assert.equal(stable.label, 'Dynamic Balance · Stable')
  assert.deepEqual(stable.provenance?.settings?.net_arch, [64, 64])
  const previous = experiment.evaluations.find((e) => e.label === 'Low Travel · Previous')!
  assert.equal(previous.episodes[0].evaluationKey, previous.key)
  assert.equal(previous.episodes[0].return, 200)
  const current = stable.episodes.find((e) => e.policy === 'model' && e.seed === 401)!
  const choices = replayChoices(experiment.evaluations, current)
  assert.equal(choices.filter((c) => c.episode.policy === 'model').length, 10)
  assert.equal(choices.filter((c) => c.episode.policy === 'hold').length, 1)
  assert.ok(choices.every((c) => c.episode.seed === 401 && c.episode.playable))
  assert.ok(!c.reads.some((path) => path.endsWith('.csv')))
  assert.ok(!c.reads.some((path) => path.startsWith('/external')))
})

test('extension scenarios have the selected PPO profile plus four previous reward models', async () => {
  const experiment = await loadExperiment(
    catalog(fixture('small-jammer', ['stable'])),
    `${main}/small-jammer`
  )
  assert.equal(experiment.evaluations.length, 5)
  assert.equal(experiment.evaluations.filter((e) => e.provenance?.kind === 'previous').length, 4)
})

test('online and fixed sampled episodes retain their own paths, updates and moving-jammer trajectory', async () => {
  const entries = fixture('small-moving-jammer', ['stable'])
  const root = addOnline(entries)
  const c = catalog(entries)
  const experiment = await loadExperiment(c, `${main}/small-moving-jammer`)
  const online = experiment.evaluations.find((e) => e.provenance?.kind === 'online')!
  const fixed = experiment.evaluations.find((e) => e.provenance?.kind === 'fixed')!
  assert.equal(online.state, 'ok')
  assert.equal(online.heldOut, false)
  assert.equal(fixed.heldOut, true)
  assert.equal(online.policySummaries.model, null)
  const episode = online.episodes.find((e) => e.policy === 'model')!
  assert.equal(episode.dir, `${root}/online/seed-401/episode-0000`)
  assert.equal(episode.decisions, 600)
  assert.equal(episode.return, 300)
  assert.equal(episode.metrics?.update_cycles, 5)
  assert.equal(fixed.episodes.find((e) => e.policy === 'model')?.metrics?.update_cycles, 0)
  assert.equal(episode.files.jammersJson, `${episode.dir}/motion-inputs/jammers.json`)
  assert.equal(episode.hasTelemetry, true)
  assert.equal(
    replayChoices(experiment.evaluations, episode).filter((c) => c.episode.policy === 'model')
      .length,
    7
  )
  assert.equal(campaignEvaluationCount(c.paths(), campaignScenarios(c.paths())[0]), 7)
})

test('a missing online seed is incomplete rather than reported as a successful operation', async () => {
  const entries = fixture('small-moving-jammer', ['stable'])
  const root = addOnline(entries)
  const manifest = entries[`${root}/online_manifest.json`] as {
    episodes: { mode: string; seed: number }[]
  }
  manifest.episodes = manifest.episodes.filter((e) => !(e.mode === 'online' && e.seed === 402))
  const experiment = await loadExperiment(catalog(entries), `${main}/small-moving-jammer`)
  assert.equal(
    experiment.evaluations.find((e) => e.provenance?.kind === 'online')?.state,
    'incomplete'
  )
})

test('unsupported online manifests report an issue while retaining usable frozen evaluations', async () => {
  const entries = fixture('small-moving-jammer', ['stable'])
  const root = addOnline(entries)
  entries[`${root}/online_manifest.json`] = { online_experiment_version: 99 }
  const experiment = await loadExperiment(catalog(entries), `${main}/small-moving-jammer`)
  assert.equal(experiment.evaluations.length, 5)
  assert.match(experiment.issues.join(' '), /Unsupported online experiment version/)
})

test('hold diagnostics group reward and action variants, separating delayed traffic', async () => {
  const entries: Data = {}
  for (const reward of ['low-travel', 'strong-travel', 'coverage-strong-travel']) {
    for (const mode of ['sampled', 'deterministic'])
      addEvaluation(
        entries,
        `custom/10-09-2/main/diagnostics/small-hold-${reward}/${mode}`,
        `small-hold-${reward}`
      )
    addEvaluation(
      entries,
      `custom/10-09-2/main/diagnostics/small-hold-${reward}-delayed-transfer/deterministic`,
      `small-hold-${reward}-delayed-transfer`
    )
  }
  const c = catalog(entries)
  assert.equal(diagnosticScenarios(c.paths()).length, 2)
  assert.equal(discoverExperiments(c).length, 2)
  const regular = await loadExperiment(c, 'custom/10-09-2/main/diagnostics/standard/small-hold')
  assert.equal(regular.evaluations.length, 6)
  assert.equal(new Set(regular.evaluations.map((e) => e.key)).size, 6)
  const delayed = await loadExperiment(
    c,
    'custom/10-09-2/main/diagnostics/delayed-transfer/small-hold'
  )
  assert.equal(delayed.evaluations.length, 3)
  assert.ok(delayed.evaluations.every((e) => !e.label.includes('delayed-transfer')))
})
