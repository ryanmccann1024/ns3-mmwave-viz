// Playback and reporting regressions found in the 10-23 Phase 1 mission results: scenario
// inputs named only by run.ini, simulator node types in positions.csv, drones that fail
// mid-run, and jamming headlines whose disruption metric was never written.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listOutputs } from '../vite-plugin-outputs.ts'
import { memoryCatalog } from './helpers/memoryCatalog.ts'
import { csvNodeType, declaredNodeNames, parseFiles } from '../src/lib/parseSimFiles.ts'
import {
  recordedInputPaths,
  resolveRecordedPath,
  resolveScenarioInputs,
} from '../src/lib/scenarioInputs.ts'
import { visibleTrafficRoutes } from '../src/lib/trafficRoutes.ts'
import { nextOutageNotice, nodeOutages, outageNodeName } from '../src/lib/nodeOutages.ts'
import { slotAvailability } from '../src/lib/decisionExplorer.ts'
import { parseSteps } from '../src/lib/episodeTelemetry.ts'
import { mergeScenarioReport } from '../src/lib/missionCampaignIndex.ts'
import { missionObjective, missionSummary } from '../src/lib/missionObjective.ts'
import { episodeFiles, loadExperiment } from '../src/lib/experimentIndex.ts'
import type { Episode, Evaluation, Experiment } from '../src/lib/experimentIndex.ts'
import type { ResultCatalog } from '../src/lib/resultCatalog.ts'
import type { SimFrame } from '../src/types.ts'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

// ---------------------------------------------------------------------------
// Node types and original IDs
// ---------------------------------------------------------------------------

const HEADER =
  '# scenario=s\n# flowTopology=explicit_pairs\ntime_s,node_id,x,y,z,node_type,active\n'
const positions = (rows: string[]) => HEADER + rows.join('\n') + '\n'
const NODES = JSON.stringify([
  { id: 'ground-1', role: 'peer', node_type: 'pedestrian' },
  { id: 'drone-1', role: 'peer', node_type: 'drone', failure_at_s: 10 },
  { id: 'vehicle-1', role: 'peer', node_type: 'vehicle' },
])
// A stationary roster: motion inference would call a still pedestrian a base station
const STILL = positions([
  '0,0,50,200,1.5,pedestrian,1',
  '0,1,200,200,20,drone,1',
  '0,2,350,200,1.5,vehicle,1',
  '10,0,50,200,1.5,pedestrian,1',
  '10,1,200,200,20,drone,0',
  '10,2,350,200,1.5,vehicle,1',
])
// Every flow touches node 0, which flow-pattern guessing would call a gateway
const LINKS = 'time_s,node_a,node_b,dist_m,sinr_db,condition,capacity_mbps,delivered_mbps\n'
const FLOWS =
  'time_s,src,dst,demand_mbps,delivered_mbps,latency_ms,hop_count,routable\n' +
  '0,0,2,3,3,1,1,1\n0,1,0,1.5,1.5,1,1,1\n'

test('simulator node types map to viewer types without nodes.json and are never re-inferred', () => {
  assert.deepEqual(csvNodeType('drone'), { type: 'air', explicit: true })
  assert.deepEqual(csvNodeType(' pedestrian '), { type: 'ground', explicit: true })
  assert.deepEqual(csvNodeType('vehicle'), { type: 'vehicle', explicit: true })
  assert.deepEqual(csvNodeType('ground'), { type: 'ground', explicit: false })
  assert.deepEqual(csvNodeType('mystery'), { type: 'peer', explicit: false })
  const frames = parseFiles({ linksText: LINKS, posText: STILL, flowsText: FLOWS })
  assert.deepEqual(
    frames[0].nodes.map((n) => n.nodeType),
    ['ground', 'air', 'vehicle'],
    'no bs, no gateway and no unknown type'
  )
  assert.equal(frames[0].nodes[0].name, undefined, 'no names without a roster')
})

test('original node IDs come from nodes.json only when the roster lines up with the CSV', () => {
  const frames = parseFiles({ linksText: LINKS, posText: STILL, nodesJsonText: NODES })
  assert.deepEqual(
    frames[1].nodes.map((n) => [n.name, n.active]),
    [
      ['ground-1', true],
      ['drone-1', false],
      ['vehicle-1', true],
    ]
  )
  assert.equal(declaredNodeNames(NODES, new Set([0, 1])), null, 'roster size differs')
  assert.equal(declaredNodeNames(NODES, new Set([0, 1, 5])), null, 'ids are not 0..N-1')
  assert.equal(declaredNodeNames('[{"id":"a"},{"id":"a"}]', new Set([0, 1])), null)
  assert.equal(declaredNodeNames('not json', new Set([0])), null)
})

// ---------------------------------------------------------------------------
// Scenario inputs named by run.ini
// ---------------------------------------------------------------------------

const HOST = '/Users/someone/sim/outputs/custom/10-23/phase-1'
const CAMPAIGN = 'custom/10-23/phase-1'
const runIni = (scene: string) =>
  `[scenario]\nname = x\nnodes_file = ${HOST}/inputs/${scene}/nodes.json\n` +
  `buildings_file = ${HOST}/inputs/${scene}/buildings.json\njammers_file = \n`
const BUILDINGS = JSON.stringify([
  { id: 'b1', bounds: { x_min: 0, x_max: 10, y_min: 0, y_max: 10, z_min: 0, z_max: 9 } },
])

test('recordedInputPaths reads nodes_file and buildings_file and treats empty as absent', () => {
  assert.deepEqual(recordedInputPaths(runIni('urban-recovery-3-peers')), {
    nodes: `${HOST}/inputs/urban-recovery-3-peers/nodes.json`,
    buildings: `${HOST}/inputs/urban-recovery-3-peers/buildings.json`,
    jammers: null,
  })
  assert.deepEqual(recordedInputPaths('[scenario]\nnodes_file =\n'), {
    nodes: null,
    buildings: null,
    jammers: null,
  })
})

test('resolveRecordedPath matches trailing segments, prefers the nearest folder, refuses ties', () => {
  const paths = [
    `${CAMPAIGN}/inputs/urban-recovery-3-peers/nodes.json`,
    `${CAMPAIGN}/inputs/rural-recovery-3-peers/nodes.json`,
    `other/inputs/urban-recovery-3-peers/nodes.json`,
  ]
  const host = `${HOST}/inputs/urban-recovery-3-peers/nodes.json`
  assert.equal(
    resolveRecordedPath(host, paths, `${CAMPAIGN}/baselines/x/hold/episode-0000`),
    `${CAMPAIGN}/inputs/urban-recovery-3-peers/nodes.json`
  )
  assert.equal(
    resolveRecordedPath(host, paths, 'elsewhere'),
    `${CAMPAIGN}/inputs/urban-recovery-3-peers/nodes.json`,
    'more matching trailing segments beat proximity'
  )
  assert.equal(
    resolveRecordedPath(
      '/host/inputs/s/nodes.json',
      ['a/inputs/s/nodes.json', 'b/inputs/s/nodes.json'],
      'c'
    ),
    null,
    'two equal candidates'
  )
  assert.equal(resolveRecordedPath('C:\\sim\\nodes.json', paths, CAMPAIGN), null)
  assert.equal(resolveRecordedPath('nodes.json', paths, CAMPAIGN), null, 'a bare name is too vague')
})

function inputsCatalog(nodes = NODES) {
  const dir = `${CAMPAIGN}/models/urban-recovery-3-peers/eval/model/episode-0000`
  return {
    dir,
    catalog: memoryCatalog({
      [`${dir}/inputs/run.ini`]: runIni('urban-recovery-3-peers'),
      [`${CAMPAIGN}/inputs/urban-recovery-3-peers/nodes.json`]: nodes,
      [`${CAMPAIGN}/inputs/urban-recovery-3-peers/buildings.json`]: BUILDINGS,
    }),
  }
}
const episodePaths = (
  dir: string,
  hashes?: { nodesJson: string | null; buildings: string | null }
) => ({
  nodesJson: null as string | null,
  buildings: null as string | null,
  runIni: `${dir}/inputs/run.ini`,
  ...(hashes ? { inputHashes: hashes } : {}),
})

test('run.ini inputs are used when their SHA-256 matches the manifest', async () => {
  const { dir, catalog } = inputsCatalog()
  const { files, sources } = await resolveScenarioInputs(
    catalog,
    episodePaths(dir, { nodesJson: sha(NODES), buildings: sha(BUILDINGS) }),
    dir
  )
  assert.equal(files.nodesJson, `${CAMPAIGN}/inputs/urban-recovery-3-peers/nodes.json`)
  assert.equal(files.buildings, `${CAMPAIGN}/inputs/urban-recovery-3-peers/buildings.json`)
  assert.equal(sources.nodes?.check, 'verified')
  assert.equal(sources.buildings?.check, 'verified')
  assert.deepEqual(sources.rejected, [])
})

test('a run.ini input whose hash differs is rejected and reported, not loaded', async () => {
  const { dir, catalog } = inputsCatalog('[{"id":"changed"}]')
  const { files, sources } = await resolveScenarioInputs(
    catalog,
    episodePaths(dir, { nodesJson: sha(NODES), buildings: sha(BUILDINGS) }),
    dir
  )
  assert.equal(files.nodesJson, null)
  assert.equal(sources.nodes, null)
  assert.equal(sources.buildings?.check, 'verified')
  assert.equal(sources.rejected.length, 1)
  assert.match(sources.rejected[0], /does not match the manifest's nodes\.json hash/)
})

test('without a manifest hash the input is loaded but marked unverified', async () => {
  const { dir, catalog } = inputsCatalog()
  const { sources } = await resolveScenarioInputs(catalog, episodePaths(dir), dir)
  assert.equal(sources.nodes?.check, 'unverified')
})

test('files archived in the episode win and run.ini is not read', async () => {
  const { dir, catalog } = inputsCatalog()
  const own = { nodesJson: `${dir}/inputs/nodes.json`, buildings: `${dir}/inputs/b.json` }
  const { files, sources } = await resolveScenarioInputs(
    catalog,
    { ...episodePaths(dir), ...own },
    dir
  )
  assert.deepEqual([files.nodesJson, files.buildings], [own.nodesJson, own.buildings])
  assert.equal(sources.nodes?.check, 'archived')
  assert.deepEqual(catalog.reads, [])
})

// ---------------------------------------------------------------------------
// Failed nodes
// ---------------------------------------------------------------------------

function frame(active: boolean[], routes: [number, number, number[], number][]): SimFrame {
  return {
    time: 10,
    nodes: active.map((a, id) => ({ id, x: 0, y: 0, z: 0, nodeType: 'ground', active: a })),
    links: [],
    flows: routes.map(([src, dst, , delivered]) => ({
      src,
      dst,
      demandMbps: 3,
      deliveredMbps: delivered,
      latencyMs: 1,
      hopCount: 1,
      routable: true,
    })),
    routes: routes.map(([src, dst, path]) => ({
      src,
      dst,
      path,
      bottleneckMbps: 1,
      hopCount: path.length - 1,
      routable: true,
    })),
    mcs: [],
    rxPower: [],
  }
}

test('traffic pulses show delivered traffic only and never pass an offline node', () => {
  const f = frame(
    [true, false, true],
    [
      [0, 2, [0, 2], 1.6],
      [2, 0, [2, 1, 0], 2], // routed through the offline drone: not drawn
      [1, 0, [1, 0], 0], // offered demand only: not drawn
    ]
  )
  assert.deepEqual(
    visibleTrafficRoutes(f, null).map((r) => `${r.src}-${r.dst}`),
    ['0-2']
  )
  assert.deepEqual(visibleTrafficRoutes(f, { src: 1, dst: 0 }), [])
})

test('the outage notice is raised going forward and withdrawn going back before the failure', () => {
  const frames = parseFiles({ linksText: LINKS, posText: STILL, nodesJsonText: NODES })
  const outages = nodeOutages(frames)
  assert.equal(outages.length, 1)
  assert.equal(outageNodeName(outages[0]), 'drone-1')
  const raised = nextOutageNotice([], outages, 0, 1)
  assert.deepEqual(raised, outages)
  assert.equal(nextOutageNotice(raised, outages, 1, 1), raised, 'no change keeps the notice')
  assert.deepEqual(nextOutageNotice(raised, outages, 1, 0), [], 'seeking back withdraws it')
  assert.deepEqual(nextOutageNotice([], outages, 1, 0), [], 'seeking back never raises one')
})

test('slotAvailability reads node_available in contract order, null when not recorded', () => {
  const contract = {
    node_ids: ['ground-1', 'drone-1', 'vehicle-1'],
    slot_node_ids: ['vehicle-1', 'drone-1', null],
  }
  const record = (facts: unknown) =>
    ({
      type: 'step',
      decision: 11,
      tick: 22,
      time_s: 11,
      ticks_in_step: 2,
      action_sent: [4, 4, 4],
      mask: [],
      reward: null,
      revalidated_slots: [],
      facts,
    }) as const
  assert.deepEqual(slotAvailability(contract, record({ node_available: [true, false, true] })), [
    true,
    false,
    null,
  ])
  assert.deepEqual(slotAvailability(contract, record({})), [null, null, null])
  assert.deepEqual(slotAvailability(contract, null), [null, null, null])
})

// ---------------------------------------------------------------------------
// Jamming headline from the phase report
// ---------------------------------------------------------------------------

function jammingExperiment(): Experiment {
  const episode = (policy: string, seed: number, dir: string): Episode =>
    ({
      policy,
      seed,
      dir,
      status: 'completed',
      metrics: { jammer_disruption_s: null, travel_m_total: 0 },
    }) as unknown as Episode
  const evaluation = {
    label: 'Level 0 · Reference PPO · Frozen deterministic',
    key: 'k',
    missionKind: 'jamming',
    contract: null,
    policies: ['model', 'hold', 'scripted'],
    episodes: [
      episode('model', 201, `${CAMPAIGN}/models/s/eval/model/episode-0000`),
      episode('hold', 201, `${CAMPAIGN}/baselines/s/hold/episode-0000`),
      episode('scripted', 201, `${CAMPAIGN}/baselines/s/scripted/episode-0000`),
    ],
  } as unknown as Evaluation
  return { evaluations: [evaluation] } as unknown as Experiment
}
const diag = (policy: string, dir: string, outage: number) => ({
  policy,
  seed: 201,
  episode_dir: `${HOST}/${dir}`,
  event_outage_s: outage,
  post_event_delivery: 0.5,
  event_completed_ever: false,
})

test('the jamming headline uses the report outage under its own name, never as disruption', () => {
  const experiment = jammingExperiment()
  mergeScenarioReport(experiment, CAMPAIGN, {
    phase_one_report_version: 1,
    diagnostics: [
      diag('frozen_deterministic', 'models/s/eval/model/episode-0000', 440),
      diag('hold', 'baselines/s/hold/episode-0000', 420),
      diag('scripted', 'baselines/s/scripted/episode-0000', 45),
      diag('hold', 'baselines/other/hold/episode-0000', 1), // another scene: ignored
    ],
  })
  const [model, hold, scripted] = experiment.evaluations[0].episodes
  assert.equal(model.metrics?.event_outage_s, 440)
  assert.equal(model.metrics?.jammer_disruption_s, null, 'the manifest value is untouched')
  assert.equal(model.metrics?.event_completed_ever, 0)
  assert.deepEqual(model.reportMetrics?.sort(), [
    'event_completed_ever',
    'event_outage_s',
    'post_event_delivery',
  ])
  assert.equal(hold.metrics?.event_outage_s, 420)
  assert.equal(scripted.metrics?.event_outage_s, 45)
  const objective = missionObjective(experiment.evaluations[0])
  assert.equal(objective?.metric, 'event_outage_s')
  assert.equal(objective?.label, 'Outage after onset')
  const summary = missionSummary(experiment)
  assert.equal(summary?.model?.value, 440)
  assert.deepEqual(summary?.baseline, { label: 'scripted', value: 45 })
})

test('an unknown report version or a policy mismatch adds nothing', () => {
  const experiment = jammingExperiment()
  mergeScenarioReport(experiment, CAMPAIGN, {
    phase_one_report_version: 2,
    diagnostics: [diag('hold', 'baselines/s/hold/episode-0000', 1)],
  })
  mergeScenarioReport(experiment, CAMPAIGN, {
    phase_one_report_version: 1,
    diagnostics: [diag('scripted', 'baselines/s/hold/episode-0000', 1)],
  })
  assert.ok(
    experiment.evaluations[0].episodes.every((e) => !('event_outage_s' in (e.metrics ?? {})))
  )
  assert.equal(missionObjective(experiment.evaluations[0])?.metric, 'jammer_disruption_s')
})

// ---------------------------------------------------------------------------
// The saved 10-23 Phase 1 results, when present on this machine
// ---------------------------------------------------------------------------

const OUTPUTS = '/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim/outputs'
const PHASE = join(OUTPUTS, CAMPAIGN)

/** The same paths the dev server lists for the outputs folder, limited to this campaign */
function phaseCatalog(): ResultCatalog {
  const paths = listOutputs(PHASE).paths.map((p) => `${CAMPAIGN}/${p}`)
  const known = new Set(paths)
  return {
    name: 'outputs',
    paths: () => paths,
    has: (p) => known.has(p),
    getFile: async (p) =>
      known.has(p) ? new File([readFileSync(join(OUTPUTS, p))], p.split('/').pop()!) : null,
  }
}

const RECOVERY = ['urban', 'rural'].flatMap((env) =>
  [3, 6, 9].map((peers) => ({ scene: `${env}-recovery-${peers}-peers`, env, peers }))
)

test(
  'Phase 1 recovery replays: verified inputs, named peers, drones offline from 10 s',
  {
    skip: !existsSync(PHASE),
  },
  async () => {
    const catalog = phaseCatalog()
    for (const { scene, env, peers } of RECOVERY) {
      const experiment = await loadExperiment(catalog, `${CAMPAIGN}/main/${scene}`)
      const labels = experiment.evaluations.map((e) => e.label)
      assert.ok(
        labels.some((l) => l.endsWith('Frozen deterministic')),
        scene
      )
      assert.ok(
        labels.some((l) => l.endsWith('Frozen sampled')),
        scene
      )
      const declared = JSON.parse(readFileSync(join(PHASE, `inputs/${scene}/nodes.json`), 'utf8'))
      const ids = declared.map((n: { id: string }) => n.id)
      const drones = declared
        .map((n: { node_type: string; failure_at_s?: number }, i: number) => ({ ...n, i }))
        .filter((n: { failure_at_s?: number }) => n.failure_at_s === 10)
        .map((n: { i: number }) => n.i)
      assert.equal(drones.length, peers / 3, `${scene}: one failing drone per three peers`)
      for (const evaluation of experiment.evaluations) {
        assert.match(evaluation.provenance?.description ?? '', /final model/, scene)
        for (const episode of evaluation.episodes) {
          const where = `${scene} ${evaluation.label} ${episode.policy} ${episode.seed}`
          const result = await episodeFiles(catalog, episode)
          assert.ok(result.ok, where)
          if (!result.ok) continue
          const { inputSources } = result.files
          assert.equal(inputSources?.nodes?.path, `${CAMPAIGN}/inputs/${scene}/nodes.json`, where)
          assert.equal(inputSources?.nodes?.check, 'verified', where)
          assert.equal(inputSources?.buildings?.check, 'verified', where)
          assert.deepEqual(inputSources?.rejected, [], where)
          if (env === 'urban') {
            const buildings = JSON.parse(await result.files.buildingsFile!.text())
            assert.equal(buildings.length, 55, where)
          }
          const frames = parseFiles({
            linksText: await result.files.linksFile.text(),
            posText: await result.files.positionsFile.text(),
            flowsText: await result.files.flowsFile?.text(),
            routesText: await result.files.routesFile?.text(),
            nodesJsonText: await result.files.nodesJsonFile?.text(),
          })
          const at = (t: number) => frames.find((f) => f.time === t)!
          assert.deepEqual(
            at(0).nodes.map((n) => n.name),
            ids,
            `${where}: exactly the declared peers`
          )
          assert.ok(
            at(0).nodes.every((n) => ['ground', 'air', 'vehicle'].includes(n.nodeType)),
            where
          )
          assert.ok(
            at(9).nodes.every((n) => n.active),
            `${where}: all up before failure`
          )
          assert.deepEqual(
            at(10)
              .nodes.filter((n) => !n.active)
              .map((n) => n.id),
            drones,
            `${where}: the drones fail at 10 s`
          )
          assert.deepEqual(
            nodeOutages(frames).map((o) => [o.name, o.downAt]),
            drones.map((i: number) => [ids[i], 10]),
            where
          )
          for (const f of frames) {
            const down = new Set(f.nodes.filter((n) => !n.active).map((n) => n.id))
            for (const route of visibleTrafficRoutes(f, null)) {
              assert.ok(!route.path.some((id) => down.has(id)), `${where} at ${f.time} s`)
            }
          }
        }
      }
    }
  }
)

test(
  'Phase 1 decisions: failed drone slots stay configured but cannot act',
  {
    skip: !existsSync(PHASE),
  },
  async () => {
    const dir = join(
      PHASE,
      'models/urban-recovery-9-peers/reference-ppo/eval/level-0/train-seed-101/model/episode-0000'
    )
    const parsed = parseSteps(readFileSync(join(dir, 'steps.jsonl'), 'utf8'))
    assert.ok(parsed.ok)
    if (!parsed.ok) return
    const contract = parsed.header.contract
    const before = parsed.steps.find((s) => s.decision === 9)!
    const after = parsed.steps.find((s) => s.decision === 10)!
    assert.ok(slotAvailability(contract, before).every((a) => a === true))
    const slots = slotAvailability(contract, after)
    assert.equal(slots.length, 9)
    assert.deepEqual(
      contract.slot_node_ids.filter((_, i) => slots[i] === false),
      ['drone-1', 'drone-2', 'drone-3']
    )
  }
)

test(
  'Phase 1 jamming headlines are filled from the scenario reports',
  {
    skip: !existsSync(PHASE),
  },
  async () => {
    const catalog = phaseCatalog()
    for (const env of ['urban', 'rural'])
      for (const peers of [3, 6, 9]) {
        const scene = `${env}-jamming-${peers}-peers`
        const experiment = await loadExperiment(catalog, `${CAMPAIGN}/main/${scene}`)
        const summary = missionSummary(experiment)
        assert.equal(summary?.objective.metric, 'event_outage_s', scene)
        assert.equal(typeof summary?.model?.value, 'number', scene)
        assert.equal(typeof summary?.baseline?.value, 'number', scene)
        for (const evaluation of experiment.evaluations)
          for (const episode of evaluation.episodes)
            assert.equal(
              typeof episode.metrics?.event_outage_s,
              'number',
              `${scene} ${episode.dir}`
            )
      }
  }
)
