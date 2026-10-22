# src/ Guide

## Component Hierarchy

```
App (router: page state + breadcrumbs, no router library)
├─ NavRail (Home / Simulation runs / RL experiments / Folders, open folder; hidden in the player)
├─ pages/HomePage          folder overview tiles, latest experiments and scenarios
├─ pages/RunsPage          scenarios per batch, one button per seed
├─ pages/ExperimentsPage   evaluations and training runs, in two sections
├─ pages/ExperimentGroupPage  one card per scenario; `-N-peers` siblings share a card (`lib/scenarioSizes.ts`) and ExperimentPage switches size in place
├─ pages/FoldersPage       checkbox tree choosing which subfolders the lists show
├─ pages/ExperimentPage    tabs: Results (leaderboard, per-seed dots, rl/EvaluationInsights) / Learning / Episodes (3D) / Details
├─ pages/TrainingRunPage   tabs: Learning (rl/TrainingInsights) / Episodes (3D) / Details
└─ pages/PlayerPage        breadcrumbs + 3D or Charts + playback, sidebar tabs Episode / Overview / Nodes / Log
   └─ NetworkCanvas → Scene → NodeObject, LinkObject, BuildingObject, SceneEnvironment
```

## State Flow

- `useSimData` — central hook: frames, playback (play/pause/seek/speed), file parsing, scene bounds
- `useSimLog` — event log buffer (max 500 entries); `usePlaybackLog` wraps it with load/playback/node/link events
- `useWorkspace` — the open outputs folder: runs, result catalog, experiment roots (dev server, cached FSA handle, or picker)
- `lib/folderFilter.ts` — which subfolders are shown (none until chosen; saved per outputs folder in localStorage). `workspace.catalog`/`runs`/roots are filtered; detail pages read `workspace.fullCatalog` so cross-folder references still resolve
- Selection state (`selectedNode`, `selectedLink`, `selectedFlow`) lives in PlayerPage

## RL data

- `lib/trainingRun.ts` reads a training folder (train_manifest.json, episode-*/rl_episode.json, evaluations.npz via `lib/npz.ts`); an eval links to it through `bundle.run_dir` (`matchTrainingRun`)
- `lib/rlStats.ts` holds the chart maths (rolling mean/SD, per-decision bands across seeds, action shares); charts live in `components/charts/RlCharts.tsx`
- Reward component sums in manifests are unweighted; multiply by the schema weights so they add up to the return
- A standalone eval with `training: null` is baseline-only (`trainingSeed === null`)
- `lib/campaignIndex.ts` assembles adaptive campaign profiles, previous-model references, and moving-jammer online operations into one page per physical scenario, using the existing reward cards and replay comparison. Shared baseline caches stay out of the experiment list.
- Hold diagnostics in `main/diagnostics` group action modes and rewards under small/large hold; standard and delayed-transfer setups remain separate. Date-version campaign folders such as `10-09-2` are distinct projects, with Main below each.
- `lib/missionCampaignIndex.ts` supports mission scenario index versions 1 and 2, explicit training seeds and stages, and shared baseline episodes. `operation_modes` suppresses online cards for screening arms. Versioned `mission_review.json` supplies derived diagnostics without rewriting original episodes.
- `lib/missionObjective.ts` chooses a single best reward/PPO/mode variant using each mission's outcome; seeds within that variant are averaged. Confirmation variants take precedence once available. Never average objectives across reward definitions for headline cards.
- `rl/MissionTimeline` shows service, active-pair LOS/SINR, coverage, arrival, target distance and actual travel from saved telemetry. Failed peers are excluded from radio pairs; LOS is not a delivery or jamming metric.
- `lib/scenarioInputs.ts`: an episode whose `inputs/` holds only run.ini gets nodes.json/buildings.json/jammers.json from the files run.ini names, matched by trailing path inside the catalog (host paths are never opened) and accepted only when the SHA-256 equals the manifest's `scenario_identity`; the Episode tab shows where each came from. Jammer routes use the episode’s seed-specific reference and the nearest archived phase plan’s input hash; the evaluation’s training-seed jammer hash is not reused. Missing hashes are marked unverified and mismatches are rejected. Used by `readPlaybackFiles` and the Compare view.
- Version-1 `main/<case>/phase_one_report.json`, `phase_two_report.json` and `phase_three_report.json` add scenario-check outcomes (`event_outage_s`, `post_event_delivery`, …) under their own names, never filling a manifest metric. Phase 3 reads nested variant, escape and baseline diagnostics; imported controls can use their episode-local version-1 `scenario_check_metrics.json`. Rows match by full episode path, seed and policy, and shared baselines remain deduplicated. Without `jammer_disruption_s` the jamming headline uses `event_outage_s` ("Outage after onset").
- Shared baseline reward returns/components may be read from `preflight/<scene>/reward_audit.json` only when both seed and exact reward schema SHA match. These are counterfactual scores of unchanged paths and are labeled as rescored; native episode files retain original rewards.

## Styling

- Tailwind utility classes for all UI styling
- Design tokens in `styles/tokens.ts` (NODE_COLORS, LINK_COLORS, NODE_BADGE_CLASSES, etc.)
- Use `Button` component for interactive buttons — variants: `primary`, `ghost`, `icon-round`, `link`
- Glass dashboard look (SubmitCue palette): semantic colours `ink`/`muted`/`faint`/`accent`/`hairline` in `tailwind.config.js`; surfaces are the `.glass` (card), `.glass-chip` (over the canvas) and `.tile` (inset) classes in `index.css`
- Cards use `ui/Panel` (title + count pill + actions); pill toggles use `ui/Segmented`; KPI tiles use `ui/StatItem`
- Sans for UI text, `font-mono tabular-nums` only for numbers, paths and ids
- No arrow glyphs on buttons and no gradients; secondary detail goes behind tabs or `ui/Disclosure` (Show/Hide)
- List-item buttons (file list, node list) use raw `<button>` with contextual styling

## Canvas Architecture

- `NetworkCanvas` is a thin `<Canvas>` wrapper with `frameloop="always"`
- `Scene` maps data to 3D objects, handles selection highlighting, camera positioning
- `NodeObject` / `LinkObject` use `useFrame` for imperative position updates every tick
- `frameAlphaRef` (mutable ref) provides smooth interpolation between frames without React re-renders
- Coordinate conversion: `simToThree()` in `canvas/utils/coordinates.ts`
- positions.csv physical types (pedestrian, drone, vehicle) are declared types, never re-inferred from motion; nodes carry `name` (the nodes.json id) only when the declared roster matches the CSV ids 0..N-1
- Offline nodes (`active=0`): links to them are not drawn or counted, traffic pulses show delivered flows on live paths only (`lib/trafficRoutes.ts`), and Decisions mark a slot whose node was unavailable in record n−1 as Offline (configured, not acting)

- Phase 4 additionally reads `phase_four_report.json` nested diagnostics and `phase-four.json` seed-specific jammer pins. The three new reward labels explain closeness, demanded-path signal margin and the terminal-corrected target potential. Historical report readers and schemas are retained.

- `missionComparison.ts` and `rl/MissionComparison` show common physical outcomes by complete reward/PPO/mode configuration. Short titles and source-phase/term/origin/execution filters preserve internal identities. `phase_comparison.json` version 1 adds recorded summaries (including Phase 1) when only a later campaign folder is open; source report hashes remain available in the file. The UI favors loaded episodes over duplicate summary rows; unavailable measurements stay blank, zero stays zero, and each metric has its own direction-aware shade. Summary-only entries do not offer replays. Phase 5 readers accept version-3 mission scenario indexes, `phase_five_report.json`, and seed-specific pins from `phase-five.json`.

- Phase 6 accepts `phase_six_report.json` and `phase-six.json`. Short titles distinguish fixed/adaptive mission priorities; phase remains a tag. Explicit source tags, full saved formulas, lower-tail service, isolation and peer-blocking filters preserve the experiment identities. Derived temporal facts are owned and audited by the simulator Python layer.

- Phase 7 reads `phase_seven_report.json` and `phase-seven.json`. Short titles and term tags distinguish whole-team radio support and sufficient-area rewards. Investigation curriculum changes training starts only; ordinary replay evaluations retain the original deployment. Imported shared baseline playback is copied into the selected campaign with explicit provenance; new reward scores are counterfactual replays, not new native evaluations.
