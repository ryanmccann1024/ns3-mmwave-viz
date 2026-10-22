import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverExperiments, loadExperiment } from '../src/lib/experimentIndex.ts'
import { missionScenarios, isMissionInternal } from '../src/lib/missionCampaignIndex.ts'
import { groupExperimentRoots, groupProjects } from '../src/lib/format.ts'
import { filterCatalog } from '../src/lib/folderFilter.ts'
import { replayChoices } from '../src/lib/replayComparison.ts'
import { rewardLabel, experimentLabel } from '../src/lib/rlLabels.ts'
import type { ResultCatalog } from '../src/lib/resultCatalog.ts'

type Data = Record<string, unknown>
const campaign = 'custom/10-16'
const scene = 'urban-investigation-extra-large'
const root = `${campaign}/main/${scene}`
const seeds = [401, 402, 403, 404, 405]
function catalog(entries: Data): ResultCatalog {
  return {
    name: 'mission',
    paths: () => Object.keys(entries).sort(),
    has: (path) => path in entries,
    getFile: async (path) =>
      path in entries
        ? new File(
            [
              typeof entries[path] === 'string'
                ? (entries[path] as string)
                : JSON.stringify(entries[path]),
            ],
            path
          )
        : null,
  }
}

function fixture(): Data {
  const rows = ['dynamic-balance', 'investigation'].flatMap((reward) =>
    ['standard', 'tuned'].map((comparison) => ({
      scene,
      mission: 'investigation',
      reward,
      comparison,
      profile: comparison === 'standard' ? 'standard' : 'wider',
    }))
  )
  const entries: Data = {
    [`${campaign}/final_models.json`]: rows,
    [`${root}/mission_scenario.json`]: { mission_scenario_version: 1, models: rows },
    [`${campaign}/validation/${scene}/wider/investigation/eval_manifest.json`]: {},
    [`${campaign}/adaptation-validation/${scene}/investigation/fast/online_manifest.json`]: {},
    [`${campaign}/preflight/${scene}/eval_manifest.json`]: {},
    [`${campaign}/baselines/${scene}/eval_manifest.json`]: {},
  }
  function episode(dir: string, seed: number) {
    entries[`${dir}/rl_episode.json`] = {
      status: 'completed',
      decisions: 600,
      reward_components_sum: { delivery_ratio: 500 },
    }
    entries[`${dir}/inputs/buildings.json`] = []
    entries[`${dir}/inputs/nodes.json`] = []
    entries[`${dir}/steps.jsonl`] = 'telemetry'
    for (const name of ['positions.csv', 'links.csv'])
      entries[`${dir}/seed-${seed}/${name}`] = 'csv'
  }
  for (const row of rows) {
    const fixed = `${campaign}/models/${scene}/${row.profile}/eval/${row.reward}/train-seed-101`
    entries[`${campaign}/models/${scene}/${row.profile}/experiment_plan.json`] = {}
    entries[
      `${campaign}/models/${scene}/${row.profile}/train/${row.reward}/train-seed-101/train_manifest.json`
    ] = { manifest_version: 7, hyperparameters: { learning_rate: 0.0003 } }
    entries[`${fixed}/eval_manifest.json`] = {
      eval_manifest_version: 7,
      label: row.reward,
      status: 'completed',
      episodes_expected: 15,
      episodes_completed: 15,
      seed_roles: { training_seed: 101, held_out: true, held_out_seeds: seeds },
      contract: { mission: { kind: 'investigation' } },
      reward_schema: {
        components:
          row.reward === 'investigation' ? ['investigation_complete'] : ['adaptive_movement_cost'],
      },
      bundle: {
        run_dir: `/old-host/${campaign}/models/${scene}/${row.profile}/train/${row.reward}/train-seed-101`,
      },
      policies: Object.fromEntries(
        ['model', 'hold', 'random_valid'].map((policy) => [
          policy,
          {
            episodes: seeds.map((seed, index) => {
              const dir = `${fixed}/${policy}/episode-000${index}`
              episode(dir, seed)
              return {
                seed,
                episode_dir: `/old-host/${policy}/episode-000${index}`,
                status: 'completed',
                metrics: { delivery_ratio: 0.8, investigation_success: 1 },
              }
            }),
          },
        ])
      ),
    }
    const operation = `${campaign}/operations/${scene}/${row.reward}/${row.comparison}`
    entries[`${operation}/online_manifest.json`] = {
      online_experiment_version: 2,
      status: 'completed',
      seeds,
      settings: { n_steps: 120 },
      episodes: ['fixed_sampled', 'online'].flatMap((mode) =>
        seeds.map((seed) => {
          const dir = `${operation}/${mode}/seed-${seed}/episode-0000`
          episode(dir, seed)
          return {
            seed,
            mode,
            episode_dir: '/old-host/episode-0000',
            metrics: { delivery_ratio: 0.9, investigation_success: 1 },
            update_cycles: mode === 'online' ? 5 : 0,
          }
        })
      ),
    }
  }
  return entries
}

test('screen indices support training seed 102, explicit objectives and no planned online for screening arms', async () => {
  const entries = fixture()
  const marker = entries[`${root}/mission_scenario.json`] as Record<string, unknown>
  marker.mission_scenario_version = 2
  marker.objective = 'jamming'
  const rows = marker.models as Array<Record<string, unknown>>
  for (const row of rows) {
    row.training_seed = 102
    row.operation_modes = ['fixed_deterministic']
    row.stage = 'screen'
    row.reward_label = 'Explicit reward'
    row.ppo_label = 'PPO gamma 0.995'
  }
  for (const [path, value] of Object.entries(entries)) {
    if (!path.includes('/train-seed-101')) continue
    delete entries[path]
    entries[path.replaceAll('/train-seed-101', '/train-seed-102')] = value
    const record = value as Record<string, unknown>
    if (record.seed_roles) (record.seed_roles as Record<string, unknown>).training_seed = 102
    if (record.bundle)
      (record.bundle as Record<string, unknown>).run_dir = String(
        (record.bundle as Record<string, unknown>).run_dir
      ).replaceAll('/train-seed-101', '/train-seed-102')
  }
  const experiment = await loadExperiment(catalog(entries), root)
  assert.equal(experiment.evaluations.length, 4)
  assert.ok(
    experiment.evaluations.every(
      (e) => e.trainingSeed === 102 && e.stage === 'screen' && e.missionKind === 'jamming'
    )
  )
  assert.ok(experiment.evaluations.every((e) => e.label.includes('PPO gamma 0.995')))
})

test('review diagnostics preserve zero sustained recovery and original episode files', async () => {
  const entries = fixture()
  const before = await loadExperiment(catalog(entries), root)
  const episode = before.evaluations[0].episodes.find((e) => e.policy === 'model')!
  entries[`${root}/mission_review.json`] = {
    mission_review_version: 1,
    episodes: {
      [episode.dir.slice(campaign.length + 1)]: {
        metrics: { recovery_sustained_final: 0, team_distance_remaining_m: 123 },
      },
    },
  }
  const after = await loadExperiment(catalog(entries), root)
  const updated = after.evaluations[0].episodes.find((e) => e.policy === 'model')!
  assert.equal(updated.metrics?.recovery_sustained_final, 0)
  assert.equal(updated.metrics?.team_distance_remaining_m, 123)
  assert.deepEqual(updated.files, episode.files)
})

test('shared baseline rewards require the same schema and seed before rescoring', async () => {
  const entries = fixture()
  const marker = entries[`${root}/mission_scenario.json`] as Record<string, unknown>
  marker.baseline_dir = `baselines/${scene}`
  const fixed = `${campaign}/models/${scene}/standard/eval/investigation/train-seed-101/eval_manifest.json`
  ;(entries[fixed] as Record<string, unknown>).reward_schema = {
    sha256: 'exact-schema',
    components: ['investigation_complete'],
  }
  entries[`${campaign}/baselines/${scene}/eval_manifest.json`] = {
    seeds: [401],
    policies: {
      scripted: {
        episodes: [
          { seed: 401, episode_dir: '/old/episode-0000', status: 'completed', return: 12 },
        ],
      },
    },
  }
  entries[`${campaign}/preflight/${scene}/reward_audit.json`] = {
    reward_audit_version: 1,
    results: {
      mission: {
        scripted: {
          episodes: [
            { seed: 402, reward_schema_sha256: 'exact-schema', return: 999 },
            { seed: 401, reward_schema_sha256: 'wrong-schema', return: 888 },
            {
              seed: 401,
              reward_schema_sha256: 'exact-schema',
              return: 42,
              reward_components_sum: { investigation_complete: 1 },
            },
          ],
        },
      },
    },
  }
  const original = JSON.stringify(entries[`${campaign}/baselines/${scene}/eval_manifest.json`])
  const loaded = await loadExperiment(catalog(entries), root)
  const evaluation = loaded.evaluations.find((e) => e.rewardSchema?.sha256 === 'exact-schema')!
  const scripted = evaluation.episodes.find((e) => e.policy === 'scripted')!
  assert.equal(scripted.return, 42)
  assert.equal(scripted.rewardRescored, true)
  assert.deepEqual(scripted.rewardComponentsSum, { investigation_complete: 1 })
  assert.equal(
    JSON.stringify(entries[`${campaign}/baselines/${scene}/eval_manifest.json`]),
    original
  )
})

test('mission campaign lists one Main project and hides training, validation and caches', () => {
  const c = catalog(fixture())
  const roots = discoverExperiments(c)
  assert.deepEqual(roots, [{ root, kind: 'campaign' }])
  const projects = groupProjects(groupExperimentRoots(roots), [])
  assert.equal(projects[0].title, '10-16')
  assert.equal(projects[0].experiments[0].short, 'Main')
  assert.equal(experimentLabel(scene), 'Urban UMa · Investigation · 9 peers')
  assert.equal(isMissionInternal(`${campaign}/models/${scene}`, missionScenarios(c.paths())), true)
  assert.equal(isMissionInternal('custom/other/models/scene', missionScenarios(c.paths())), false)
})

test('selecting just Main still discovers the scenario and reads referenced original files', async () => {
  const c = filterCatalog(catalog(fixture()), [`${campaign}/main`])
  assert.deepEqual(discoverExperiments(c), [{ root, kind: 'campaign' }])
  const experiment = await loadExperiment(c, root)
  assert.equal(experiment.evaluations.length, 12)
  assert.deepEqual(experiment.issues, [])
  for (const evaluation of experiment.evaluations) {
    assert.equal(evaluation.state, 'ok')
    assert.equal(evaluation.episodes.length, 15)
    assert.ok(evaluation.episodes.every((e) => e.playable && e.hasTelemetry && e.files.buildings))
  }
})

test('all rewards, PPO settings and modes are distinct, playable and correctly labelled', async () => {
  const experiment = await loadExperiment(catalog(fixture()), root)
  const evaluations = experiment.evaluations
  assert.equal(new Set(evaluations.map((e) => e.key)).size, 12)
  assert.equal(evaluations.filter((e) => e.provenance?.kind === 'online').length, 4)
  assert.equal(evaluations.filter((e) => e.provenance?.kind === 'fixed').length, 4)
  assert.ok(
    evaluations
      .filter((e) => e.provenance?.kind === 'online')
      .every((e) => !e.heldOut && e.heldOutSeeds.length === 0)
  )
  assert.ok(
    evaluations
      .filter((e) => e.provenance?.kind === 'fixed')
      .every((e) => e.heldOut && e.heldOutSeeds.length === 5)
  )
  assert.equal(rewardLabel(evaluations[0]), 'Dynamic Balance')
  assert.equal(rewardLabel(evaluations[6]), 'Connected investigation')
  const current = evaluations[0].episodes.find((e) => e.policy === 'model')!
  assert.equal(replayChoices(evaluations, current).length, 14)
  assert.ok(
    evaluations[1].episodes
      .find((e) => e.policy === 'model')!
      .dir.includes('/fixed_sampled/seed-401/')
  )
})

test('campaign also loads from its original final-model index before Main is generated', async () => {
  const entries = fixture()
  delete entries[`${root}/mission_scenario.json`]
  const c = catalog(entries)
  assert.deepEqual(discoverExperiments(c), [{ root, kind: 'campaign' }])
  assert.equal((await loadExperiment(c, root)).evaluations.length, 12)
})

test('unknown online schema is reported rather than silently presenting frozen data as online', async () => {
  const entries = fixture()
  const path = `${campaign}/operations/${scene}/dynamic-balance/standard/online_manifest.json`
  ;(entries[path] as Record<string, unknown>).online_experiment_version = 99
  const experiment = await loadExperiment(catalog(entries), root)
  assert.match(experiment.issues[0], /Unsupported online experiment version/)
  assert.equal(experiment.evaluations.length, 10)
})

test('pilot schemas load shared scripted baselines and preserve validation labels', async () => {
  const entries = fixture()
  const marker = entries[`${root}/mission_scenario.json`] as Record<string, unknown>
  marker.baseline_dir = `baselines/${scene}`
  const rows = marker.models as Array<Record<string, unknown>>
  for (const row of rows) row.seed_role = 'validation diagnostics'
  for (const [path, value] of Object.entries(entries)) {
    if (path.endsWith('/eval_manifest.json') && (value as Record<string, unknown>).policies) {
      const record = value as Record<string, unknown>
      record.eval_manifest_version = 8
      record.seed_roles = { training_seed: 101, held_out: false, held_out_seeds: [] }
      const policies = record.policies as Record<string, unknown>
      delete policies.hold
      delete policies.random_valid
    }
    if (path.endsWith('/online_manifest.json') && (value as Record<string, unknown>).episodes)
      (value as Record<string, unknown>).online_experiment_version = 3
  }
  const base = `${campaign}/baselines/${scene}`
  entries[`${base}/eval_manifest.json`] = {
    eval_manifest_version: 8,
    status: 'completed',
    seeds,
    policies: Object.fromEntries(
      ['hold', 'random_valid', 'scripted'].map((policy) => [
        policy,
        {
          episodes: seeds.map((seed, i) => {
            const dir = `${base}/${policy}/episode-000${i}`
            entries[`${dir}/rl_episode.json`] = { status: 'completed', decisions: 600 }
            entries[`${dir}/inputs/buildings.json`] = []
            entries[`${dir}/inputs/nodes.json`] = []
            entries[`${dir}/steps.jsonl`] = 'telemetry'
            for (const name of ['positions.csv', 'links.csv'])
              entries[`${dir}/seed-${seed}/${name}`] = 'csv'
            return {
              seed,
              episode_dir: `/old-host/episode-000${i}`,
              status: 'completed',
              metrics: { travel_m_total: 100, final_minute_coverage: 0.8 },
            }
          }),
        },
      ])
    ),
  }
  const experiment = await loadExperiment(catalog(entries), root)
  assert.equal(experiment.evaluations.length, 12)
  assert.deepEqual(experiment.issues, [])
  for (const evaluation of experiment.evaluations) {
    assert.equal(evaluation.heldOut, false)
    assert.ok(
      evaluation.episodes.some((e) => e.policy === 'scripted' && e.playable && e.hasTelemetry)
    )
    assert.equal(evaluation.episodes.length, 20)
  }
})

test('numbered weekly campaigns remain separate projects', () => {
  const roots = [
    { root: 'custom/10-16/main/urban-coverage-small' },
    { root: 'custom/10-16-2/main/urban-coverage-small' },
  ]
  assert.deepEqual(
    groupProjects(groupExperimentRoots(roots), [])
      .map((p) => p.title)
      .sort(),
    ['10-16', '10-16-2']
  )
})

test('saved training is visible before model comparisons exist', async () => {
  const entries = fixture()
  const marker = entries[`${root}/mission_scenario.json`] as Record<string, unknown>
  const rows = marker.models as Array<Record<string, unknown>>
  for (const row of rows) {
    const train = `${campaign}/models/${scene}/${row.profile}/train/${row.reward}/train-seed-101/train_manifest.json`
    entries[train] = {
      manifest_version: 7,
      status: 'completed',
      seed: 101,
      contract: { mission: { kind: 'investigation' } },
      reward_schema: {
        components:
          row.reward === 'investigation'
            ? ['team_arrival_fraction', 'investigation_complete']
            : ['adaptive_movement_cost'],
      },
      evaluation: { seeds: [401, 402] },
      hyperparameters: { ent_coef: 0 },
    }
    delete entries[
      `${campaign}/models/${scene}/${row.profile}/eval/${row.reward}/train-seed-101/eval_manifest.json`
    ]
    delete entries[
      `${campaign}/operations/${scene}/${row.reward}/${row.comparison}/online_manifest.json`
    ]
  }
  entries[`${campaign}/campaign_status.json`] = { status: 'failed' }
  const experiment = await loadExperiment(catalog(entries), root)
  assert.equal(experiment.evaluations.length, 12)
  assert.equal(experiment.campaignProgress?.trained, 4)
  assert.equal(experiment.campaignProgress?.status, 'failed')
  assert.ok(
    experiment.evaluations.every(
      (e) => e.state === 'incomplete' && e.trainingRunDir && e.episodesCompleted === 0
    )
  )
  assert.equal(
    experiment.evaluations.filter((e) => rewardLabel(e) === 'Team investigation').length,
    6
  )
  assert.ok(
    experiment.evaluations.every(
      (e) => e.message?.includes('pending') || e.message?.includes('not been saved')
    )
  )
  assert.deepEqual(experiment.issues, [])
})

test('sampled-only v4 controls create no online cards for saved or pending operation', async () => {
  for (const pending of [false, true]) {
    const entries = fixture()
    const marker = entries[`${root}/mission_scenario.json`] as Record<string, unknown>
    marker.mission_scenario_version = 2
    const rows = marker.models as Array<Record<string, unknown>>
    for (const row of rows) row.operation_modes = ['fixed_deterministic', 'fixed_sampled']
    for (const path of Object.keys(entries).filter((p) => p.endsWith('/online_manifest.json'))) {
      const data = entries[path] as Record<string, unknown>
      if (!Array.isArray(data.episodes)) continue
      if (pending) {
        delete entries[path]
        continue
      }
      data.online_experiment_version = 4
      data.modes = ['fixed_sampled']
      data.episodes = (data.episodes as Array<Record<string, unknown>>).filter(
        (e) => e.mode === 'fixed_sampled'
      )
    }
    const loaded = await loadExperiment(catalog(entries), root)
    assert.equal(loaded.evaluations.length, 8)
    assert.equal(loaded.evaluations.filter((e) => e.label.includes('Frozen sampled')).length, 4)
    assert.ok(loaded.evaluations.every((e) => !e.label.includes('Online learning')))
    for (const evaluation of loaded.evaluations.filter((e) => e.label.includes('Frozen sampled'))) {
      assert.equal(evaluation.state, pending ? 'incomplete' : 'ok')
      const modelEpisodes = evaluation.episodes.filter((e) => e.policy === 'model')
      assert.equal(modelEpisodes.length, pending ? 0 : 5)
      assert.ok(modelEpisodes.every((e) => e.metrics?.update_cycles === 0))
    }
  }
})

test('frozen exploration schedules display their actual execution label', async () => {
  const entries = fixture()
  const marker = entries[`${root}/mission_scenario.json`] as Record<string, unknown>
  const rows = marker.models as Array<Record<string, unknown>>
  for (const row of rows) {
    row.operation_modes = []
    row.execution_label = 'Sample briefly when progress stalls'
    row.execution_description = 'Frozen weights; temporary sampling; no reset.'
  }
  const loaded = await loadExperiment(catalog(entries), root)
  assert.equal(loaded.evaluations.length, rows.length)
  assert.ok(
    loaded.evaluations.every((e) => e.label.includes('Sample briefly when progress stalls'))
  )
  assert.ok(loaded.evaluations.every((e) => !e.label.includes('Frozen deterministic')))
  assert.ok(
    loaded.evaluations.every(
      (e) => e.provenance?.description === 'Frozen weights; temporary sampling; no reset.'
    )
  )
})
