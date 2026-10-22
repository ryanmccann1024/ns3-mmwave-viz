import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listOutputs } from '../vite-plugin-outputs.ts'
import { memoryCatalog } from './helpers/memoryCatalog.ts'
import { resolveScenarioInputs } from '../src/lib/scenarioInputs.ts'
import { loadExperiment, episodeFiles } from '../src/lib/experimentIndex.ts'
import { jammerActivity, jammerPositionAt, parseJammers } from '../src/lib/jammers.ts'
import type { ResultCatalog } from '../src/lib/resultCatalog.ts'

const root = 'custom/10-23-2'
const scene = 'urban-jamming-3-peers'
const source = `${root}/inputs/${scene}/seed-201/jammers.json`
const dir = `${root}/models/${scene}/p/eval/r/train-seed-101/model/episode-0000`
const ini = `${dir}/inputs/run.ini`
const route = JSON.stringify([
  {
    id: 'jammer',
    waypoints: [
      { t: 0, x: 0 },
      { t: 160, x: 200 },
    ],
    intervals: [{ start: 160, end: 601 }],
  },
])
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const files = () => ({
  nodesJson: 'nodes.json',
  buildings: 'buildings.json',
  jammersJson: null as string | null,
  runIni: ini,
})
const entries = (hash = digest(route)) => ({
  [ini]: `[scenario]\njammers_file = /old-host/outputs/${source}\n`,
  [source]: route,
  [`${root}/inputs/phase-three.json`]: JSON.stringify({
    phase_three_version: 1,
    input_hashes: { [`${scene}/seed-201/jammers.json`]: hash },
  }),
  [`${root}/inputs/${scene}/seed-101/jammers.json`]: JSON.stringify([
    { id: 'wrong training seed' },
  ]),
})

test('episode run.ini restores the exact seed-specific route, checked against its archive', async () => {
  const catalog = memoryCatalog(entries())
  const result = await resolveScenarioInputs(catalog, files(), dir)
  assert.equal(result.files.jammersJson, source)
  assert.deepEqual(result.sources.jammers, { path: source, check: 'verified' })
  assert.deepEqual(result.sources.rejected, [])
  assert.equal(catalog.reads.includes(`${root}/inputs/${scene}/seed-101/jammers.json`), false)
})

test('a changed jammer file is rejected instead of silently animating a different route', async () => {
  const result = await resolveScenarioInputs(memoryCatalog(entries('0'.repeat(64))), files(), dir)
  assert.equal(result.files.jammersJson, null)
  assert.equal(result.sources.jammers, null)
  assert.match(result.sources.rejected.join(' '), /does not match/)
})

test('direct archived or effective motion inputs take precedence over run.ini', async () => {
  const catalog = memoryCatalog(entries())
  const direct = `${dir}/motion-inputs/jammers.json`
  const result = await resolveScenarioInputs(catalog, { ...files(), jammersJson: direct }, dir)
  assert.equal(result.files.jammersJson, direct)
  assert.equal(result.sources.jammers?.check, 'archived')
  assert.equal(catalog.reads.length, 0)
})

test('missing archive hashes remain explicit and a blank jammer reference adds none', async () => {
  const data = entries()
  delete data[`${root}/inputs/phase-three.json`]
  const result = await resolveScenarioInputs(memoryCatalog(data), files(), dir)
  assert.equal(result.sources.jammers?.check, 'unverified')
  const empty = await resolveScenarioInputs(
    memoryCatalog({ [ini]: '[scenario]\njammers_file = \n' }),
    files(),
    dir
  )
  assert.equal(empty.files.jammersJson, null)
  assert.deepEqual(empty.sources.rejected, [])
})

const outputs = '/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim/outputs'
const phase = join(outputs, root)
test(
  'every saved Phase 3 jamming replay resolves its route and restores approach and stationary emission',
  { skip: !existsSync(join(phase, 'campaign_status.json')) },
  async () => {
    const paths = listOutputs(phase).paths.map((p) => `${root}/${p}`)
    const known = new Set(paths)
    const catalog: ResultCatalog = {
      name: 'outputs',
      paths: () => paths,
      has: (p) => known.has(p),
      getFile: async (p) => (known.has(p) ? new File([readFileSync(join(outputs, p))], p) : null),
    }
    const seen = new Set<string>()
    for (const environment of ['urban', 'rural'])
      for (const peers of [3, 6, 9]) {
        const scenario = `${environment}-jamming-${peers}-peers`
        const loaded = await loadExperiment(catalog, `${root}/main/${scenario}`)
        let playerChecked = false
        for (const evaluation of loaded.evaluations)
          for (const episode of evaluation.episodes) {
            if (episode.status !== 'completed' || seen.has(episode.dir)) continue
            seen.add(episode.dir)
            // The same shared resolver is used by the Compare view and main player.
            const result = await resolveScenarioInputs(catalog, episode.files, episode.dir)
            const where = `${scenario} ${evaluation.label} ${episode.policy} seed ${episode.seed}`
            assert.ok(result.files.jammersJson, where)
            assert.ok(['verified', 'archived'].includes(result.sources.jammers?.check ?? ''), where)
            assert.deepEqual(result.sources.rejected, [], where)
            const savedPath = `${root}/inputs/${scenario}/seed-${episode.seed}/jammers.json`
            const text = await (await catalog.getFile(result.files.jammersJson!))!.text()
            assert.equal(text, readFileSync(join(outputs, savedPath), 'utf8'), where)
            const [jammer] = parseJammers(text)
            assert.ok(jammer.enabled, where)
            const start = jammer.waypoints[1],
              end = jammer.waypoints[2]
            const halfway = jammerPositionAt(jammer, (start.t + end.t) / 2)
            assert.notDeepEqual(
              jammerPositionAt(jammer, start.t),
              jammerPositionAt(jammer, end.t),
              where
            )
            assert.equal(halfway.x, (start.x + end.x) / 2, where)
            assert.equal(halfway.y, (start.y + end.y) / 2, where)
            assert.deepEqual(jammerPositionAt(jammer, 600), jammerPositionAt(jammer, end.t), where)
            assert.equal(jammerActivity(jammer, end.t - 1, 5.8e9), 'off', where)
            assert.equal(jammerActivity(jammer, end.t, 5.8e9), 'on', where)
            assert.equal(jammerActivity(jammer, 600, 5.8e9), 'on', where)
            if (!playerChecked) {
              const player = await episodeFiles(catalog, episode)
              assert.ok(player.ok, where)
              if (player.ok) assert.equal(await player.files.jammersJsonFile?.text(), text, where)
              playerChecked = true
            }
          }
      }
    assert.ok(seen.size > 100, `${seen.size} distinct replay episodes checked`)
  }
)
