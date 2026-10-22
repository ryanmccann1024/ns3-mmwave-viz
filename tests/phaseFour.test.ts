import { rewardLabel } from '../src/lib/rlLabels.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mergeScenarioReport } from '../src/lib/missionCampaignIndex.ts'
import { isCatalogFile } from '../src/lib/resultCatalog.ts'
import { resolveScenarioInputs } from '../src/lib/scenarioInputs.ts'
import { rewardComponentLabel, gradedRewardExplanation } from '../src/lib/rlLabels.ts'
import { memoryCatalog } from './helpers/memoryCatalog.ts'
import type { Experiment } from '../src/lib/experimentIndex.ts'

const campaign = 'custom/10-23-3'
const scene = 'urban-jamming-3-peers'

test('Phase 4 report and plan are discoverable without indexing training telemetry', () => {
  for (const name of ['phase_four_report.json', 'phase-four.json']) {
    assert.equal(isCatalogFile(`${campaign}/inputs/${name}`.split('/')), true)
    assert.equal(
      isCatalogFile(
        `${campaign}/models/${scene}/p/train/r/train-seed-101/episode-0000/${name}`.split('/')
      ),
      false
    )
  }
})

test('Phase 4 measured model and baseline diagnostics join by full episode identity', () => {
  const model = `${campaign}/operations/${scene}/r/r/online/seed-201/episode-0000`
  const base = `${campaign}/baselines/${scene}/scripted/episode-0000`
  const exp = {
    evaluations: [
      {
        episodes: [
          { policy: 'model', seed: 201, dir: model, status: 'completed', metrics: {} },
          { policy: 'scripted', seed: 201, dir: base, status: 'completed', metrics: {} },
        ],
      },
    ],
  } as unknown as Experiment
  const row = (dir: string, policy: string, value: number) => ({
    episode_dir: `/saved/outputs/${dir}`,
    seed: 201,
    policy,
    event_outage_s: value,
    post_event_delivery: 1,
  })
  mergeScenarioReport(exp, campaign, {
    phase_four_report_version: 1,
    variants: [
      {
        diagnostics: [row(model, 'online', 11), row(model.replace(scene, 'wrong'), 'online', 999)],
      },
    ],
    baselines: [row(base, 'scripted', 0)],
  })
  assert.deepEqual(
    exp.evaluations[0].episodes.map((e) => e.metrics?.event_outage_s),
    [11, 0]
  )
})

test('Phase 4 archive verifies the seed-specific jammer route', async () => {
  const episode = `${campaign}/models/${scene}/p/eval/r/train-seed-101/model/episode-0000`
  const route = `${campaign}/inputs/${scene}/seed-202/jammers.json`
  const text = '[{"id":"seed202","intervals":[{"start":180,"end":601}]}]'
  const catalog = memoryCatalog({
    [`${episode}/inputs/run.ini`]: `[scenario]\njammers_file = /saved/outputs/${route}\n`,
    [route]: text,
    [`${campaign}/inputs/phase-four.json`]: JSON.stringify({
      phase_four_version: 1,
      input_hashes: {
        [`${scene}/seed-202/jammers.json`]: createHash('sha256').update(text).digest('hex'),
      },
    }),
  })
  const result = await resolveScenarioInputs(
    catalog,
    { nodesJson: null, buildings: null, jammersJson: null, runIni: `${episode}/inputs/run.ini` },
    episode
  )
  assert.equal(result.files.jammersJson, route)
  assert.equal(result.sources.jammers?.check, 'verified')
})

test('new reward names and explanations expose the actual calculation', () => {
  for (const component of [
    'available_team_closeness_v1',
    'demanded_path_sinr_margin_v1',
    'target_proximity_potential_v1',
  ]) {
    assert.notEqual(rewardComponentLabel(component), component)
    assert.ok(gradedRewardExplanation(component)?.calculation)
  }
  assert.match(gradedRewardExplanation('target_proximity_potential_v1')!.calculation, /final step/)
  assert.match(
    gradedRewardExplanation('demanded_path_sinr_margin_v1')!.calculation,
    /not delivered traffic/
  )
})

test('mixed reward labels retain the actual coefficients and human names', () => {
  const label = rewardLabel({
    rewardSchema: {
      components: ['survivor_critical_delivery_fraction_v1', 'available_team_closeness_v1'],
      weights: [0.9, 0.1],
    },
  } as unknown as import('../src/lib/experimentIndex.ts').Evaluation)
  assert.match(label, /0.9.*Survivor delivery/)
  assert.match(label, /0.1.*Team closeness/)
  assert.doesNotMatch(label, /_v1/)
})
