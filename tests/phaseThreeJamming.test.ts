import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listOutputs } from '../vite-plugin-outputs.ts'
import { mergeScenarioReport } from '../src/lib/missionCampaignIndex.ts'
import { missionObjective, missionSummary } from '../src/lib/missionObjective.ts'
import { loadExperiment, type Experiment, type Evaluation } from '../src/lib/experimentIndex.ts'
import { isCatalogFile, type ResultCatalog } from '../src/lib/resultCatalog.ts'

const campaign = 'custom/10-23-2'
const scene = 'urban-jamming-3-peers'
const dir = `${campaign}/models/${scene}/profile/eval/reward/train-seed-101/model/episode-0000`
const entry = (path = dir, policy = 'frozen_deterministic', value = 0) => ({
  policy,
  seed: 201,
  episode_dir: `/saved-host/outputs/${path}`,
  event_outage_s: value,
  post_event_delivery: 1,
})
const experiment = () =>
  ({
    evaluations: [
      {
        missionKind: 'jamming',
        label: 'test',
        episodes: [
          {
            policy: 'model',
            seed: 201,
            dir,
            status: 'completed',
            metrics: { jammer_disruption_s: null },
          },
        ],
      },
    ],
  }) as unknown as Experiment

test('new phase reports enter the catalog without indexing training telemetry', () => {
  for (const file of [
    'phase_two_report.json',
    'phase_three_report.json',
    'scenario_check_metrics.json',
  ]) {
    assert.equal(isCatalogFile(`${campaign}/main/${scene}/${file}`.split('/')), true)
    assert.equal(
      isCatalogFile(
        `${campaign}/models/${scene}/p/train/r/train-seed-101/episode-0001/${file}`.split('/')
      ),
      false
    )
  }
})

test('Phase 2 reads its own diagnostics without renaming missing disruption', () => {
  const result = experiment()
  mergeScenarioReport(result, campaign, { phase_two_report_version: 1, diagnostics: [entry()] })
  assert.equal(result.evaluations[0].episodes[0].metrics?.event_outage_s, 0)
  assert.equal(result.evaluations[0].episodes[0].metrics?.jammer_disruption_s, null)
  assert.equal(missionObjective(result.evaluations[0])?.label, 'Outage after onset')
})

test('Phase 3 nested variants, online, schedules and baselines join only matching episodes', () => {
  const result = experiment()
  const base = result.evaluations[0].episodes[0]
  const onlineDir = `${campaign}/operations/${scene}/r/c/online/seed-201/episode-0000`
  const escapeDir = `${campaign}/models/${scene}/stall-burst/eval/level-1/train-seed-101/model/episode-0000`
  const baselineDir = `${campaign}/baselines/${scene}/scripted/episode-0000`
  result.evaluations[0].episodes.push(
    { ...base, dir: onlineDir },
    { ...base, dir: escapeDir },
    { ...base, policy: 'scripted', dir: baselineDir }
  )
  mergeScenarioReport(result, campaign, {
    phase_three_report_version: 1,
    variants: [
      {
        diagnostics: [
          entry(),
          entry(onlineDir, 'online', 12),
          entry(dir.replace(scene, 'other-scene'), 'frozen_deterministic', 999),
        ],
      },
    ],
    escape: [{ diagnostics: [entry(escapeDir, 'stall-burst', 7)] }],
    baselines: [entry(baselineDir, 'scripted', 0)],
  })
  assert.deepEqual(
    result.evaluations[0].episodes.map((e) => e.metrics?.event_outage_s),
    [0, 12, 7, 0]
  )
  assert.equal(missionSummary(result)?.baseline?.value, 0)
  const unknown = experiment()
  mergeScenarioReport(unknown, campaign, {
    phase_three_report_version: 2,
    variants: [{ diagnostics: [entry()] }],
  })
  assert.equal(unknown.evaluations[0].episodes[0].metrics?.event_outage_s, undefined)
})

const outputs = '/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim/outputs'
const phase = join(outputs, campaign)

test(
  'all six saved Phase 3 jamming scenarios show measured model and best-baseline outage',
  { skip: !existsSync(join(phase, 'campaign_status.json')) },
  async () => {
    const paths = listOutputs(phase).paths.map((p) => `${campaign}/${p}`)
    const known = new Set(paths)
    const catalog: ResultCatalog = {
      name: 'outputs',
      paths: () => paths,
      has: (p) => known.has(p),
      getFile: async (p) => (known.has(p) ? new File([readFileSync(join(outputs, p))], p) : null),
    }
    for (const environment of ['urban', 'rural'])
      for (const peers of [3, 6, 9]) {
        const scenario = `${environment}-jamming-${peers}-peers`
        const loaded = await loadExperiment(catalog, `${campaign}/main/${scenario}`)
        assert.equal(loaded.issues.length, 0, `${scenario}: ${loaded.issues.join('; ')}`)
        const controls = new Map<string, Map<string, number>>()
        for (const evaluation of loaded.evaluations) {
          assert.equal(missionObjective(evaluation)?.metric, 'event_outage_s', evaluation.label)
          for (const episode of evaluation.episodes) {
            if (episode.status !== 'completed') continue
            const where = `${scenario} ${evaluation.label} ${episode.policy} ${episode.seed}`
            const checked = JSON.parse(
              readFileSync(join(outputs, episode.dir, 'scenario_check_metrics.json'), 'utf8')
            )
            assert.equal(episode.metrics?.event_outage_s, checked.event_outage_s, where)
            if (episode.policy !== 'model') {
              const values = controls.get(episode.policy) ?? new Map<string, number>()
              values.set(episode.dir, checked.event_outage_s)
              controls.set(episode.policy, values)
            }
          }
          const card = missionSummary({ evaluations: [evaluation] })!
          assert.equal(
            typeof card.model?.value,
            'number',
            `${scenario}: ${evaluation.label} model is blank`
          )
          assert.equal(
            typeof card.baseline?.value,
            'number',
            `${scenario}: ${evaluation.label} baseline is blank`
          )
        }
        const best = Math.min(
          ...[...controls.values()].map((byDir) => {
            const values = [...byDir.values()]
            return values.reduce((a, b) => a + b, 0) / values.length
          })
        )
        const summary = missionSummary(loaded)!
        assert.equal(summary.baseline?.value, best, `${scenario} best baseline`)
        assert.ok(
          loaded.evaluations.some((e: Evaluation) => e.label.includes('saved Phase 2 control'))
        )
      }
  }
)
