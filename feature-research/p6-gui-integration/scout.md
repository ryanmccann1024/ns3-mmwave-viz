# P6 GUI Integration: Scout Report

Date: 2026-09-19. Read-only exploration of:

- GUI: `/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave-viz` (branch `main`, clean)
- Simulator: `/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim` (called `MESH` below)

Labels: **Checked** means I read it in code or on disk. **Inferred** means it follows from reading the code but was not run. **Not verified** means it is an assumption or open question.

## 1. Summary

- The GUI is a single-run viewer. It shows seed-level CSVs (`links`, `positions`, `flows`, `routes`, `mcs`, `rx-power`) plus `nodes.json` and `buildings*.json`. It has 3D playback, a node/link panel, and per-link or per-flow time-series charts. **Checked.**
- It has **no command or process bridge**. The only server code is a read-only Vite dev-server plugin with two GET routes. **Checked.**
- It knows nothing about RL. It never reads `eval_manifest.json`, `comparison.json`, `episodes.csv`, `steps.jsonl`, `rl_episode.json`, `train_manifest.json`, `experiment_plan.json`, or `cluster/*`. **Checked.**
- The RL evaluation episodes do contain the same seed-level CSVs, under `…/<policy>/episode-NNNN/seed-S/`. The GUI's path parser still picks them up, but it mislabels them and can merge episodes from different rows (§4.3). **Inferred.**
- The simulator already owns validation, planning, runs, SLURM control, fetch, and statistics. Each lives in a Python CLI, and several have `--json` output (§6). The thinnest bridge is an allowlisted argv runner in the dev plugin that calls those CLIs unchanged.

## 2. Existing GUI user journey and file ownership

| Stage | File and lines | What it does (Checked) |
|---|---|---|
| Dev server and output serving | `vite.config.ts:1-7`, `vite-plugin-outputs.ts:13-96` | `GET /api/outputs` walks `../ns3-mmwave/scratch/mesh-sim/outputs` and returns relative paths filtered by filename (`:30-40`). `GET /outputs/<rel>` streams a file (`:58-89`). There are no write routes and no process spawning. |
| Discovery on mount | `src/components/FileLoader.tsx:76-104` | Tries the dev API first. If that fails, it falls back to a cached File System Access handle (`src/lib/directoryCache.ts`). |
| Manual open | `FileLoader.tsx:46-71`, `:109-122`, `:194-195` | FSA `showDirectoryPicker({mode:'read'})` or `<input webkitdirectory>`. |
| Run assembly | `src/lib/assembleRuns.ts:48-203` | Groups files by `YYYY-MM/DD/HH-MM-SS[/point-NNN]/seed-N`. Picks up shared `inputs/nodes.json` and `inputs/buildings*.json`. A run needs both `links.csv` and `positions.csv` (`:184`). |
| Dev fetch | `assembleRuns.ts:208-230` | **Eagerly downloads every listed file** as a Blob before any run is chosen. |
| Run list UI | `FileLoader.tsx:135-149` | Groups runs by `yearMonth/day` and calls `onLoad(run)` on selection. |
| Load | `src/App.tsx:134-148` then `src/hooks/useSimData.ts:217-226` | Reads the file text and calls `parseFiles` and `parseBuildings`. |
| Parsing | `src/lib/parseSimFiles.ts:19-23` (`#key=value` meta), `:153-290` (CSV to `SimFrame[]`) | Numeric `node_id`. Links use `sinr_db`, `capacity_mbps`, and similar columns. Flows and routes: routes `path` is split on `;` (`:256`). `nodes.json` supplies role overrides by array index (`:163-177`). |
| Playback | `useSimData.ts` and `src/components/PlaybackControls.tsx` | Play, pause, seek, and speed. `frameAlphaRef` interpolation, per `CLAUDE.md`. |
| 3D scene | `src/components/canvas/Scene.tsx` (compact scaling `:88-92`), `NodeObject.tsx`, `LinkObject.tsx`, `BuildingObject.tsx`, `TrafficLayer.tsx`, `TrafficFlow.tsx`, `RainEffect.tsx`, `SceneEnvironment.tsx`, `utils/coordinates.ts` | Draws nodes, links, buildings, flows, and a rain effect. Converts coordinates from Z-up (simulator) to Y-up (Three.js). |
| Charts | `src/components/charts/ChartsView.tsx:18-21`, `MetricChart.tsx`, `src/hooks/useMetricSeries.ts:4-19` | Metrics: `sinr`, `rxPower`, `capacity`, `throughput`, `latency`, `mcs`. Each chart is a time series for a single run. |
| Config controls | `src/components/StatsBar.tsx:13-81` | Only a view toggle (compact vs to-scale). There is **no simulator configuration editor**. |
| Types | `src/types.ts:1` | `NodeType` includes `'peer'`, which matches the simulator's `node_type=peer`. |

### Already works; do not rebuild

- 3D playback of any directory shaped like `seed-S/{links,positions}.csv`, including RL episodes (§4.3 covers the labelling).
- Buildings and `nodes.json` loaded from a sibling `inputs/` directory. RL episodes have `episode-NNNN/inputs/`, which the current index logic matches (Inferred).
- Link, flow, route, MCS, and RX-power parsing and charts.
- Three ways to load: dev API, FSA picker, and `webkitdirectory`.

### Missing

- Trajectory trails. Nothing draws past positions: a grep for trail or trajectory in `src/` found nothing. **Checked.**
- Any display of RL policy, action, reward, or mask data.
- Aggregate views across seeds or policies, and confidence intervals.
- A run index that knows about experiment roots (`experiment_plan.json`, `train/`, `eval/`, `comparison/`).
- Any way to run or validate commands.
- Jammer display. The GUI has no jammer references at all. **Checked.**

## 3. Commands (GUI)

| Command | Source | Notes |
|---|---|---|
| `npm run dev` | `package.json:7` | Vite with the outputs plugin; this is the only mode with auto-discovery. |
| `npm run build` | `package.json:8` | `tsc && vite build`. |
| `npm run preview` | `package.json:9` | Vite preview. Whether the plugin runs here is **Not verified**: the plugin only registers `configureServer`, not `configurePreviewServer`, so discovery is probably absent. |
| `npm run lint` / `lint:fix` / `format` | `package.json:10-12` | ESLint and Prettier. |
| Tests | none | There is no test script or test runner in `package.json`. **Checked.** |

Simulator tests exist at `MESH/scripts/rl/tests/` (for example `test_policy_comparison.py`, `test_lifecycle_cli.py`, `test_ops_cluster.py`, with `fake_sim.py` and `fake_slurm.py`). The exact invocation (probably `.venv/bin/python -m pytest scripts/rl/tests`) is **Not verified**.

## 4. Simulator artifacts and schemas

### 4.1 Layouts on disk (Checked)

- **Legacy, non-RL:** `outputs/YYYY-MM/DD/HH-MM-SS/seed-N/…` (`MESH/CLAUDE.md:104`; `sim.cc:146` appends `/seed-<N>`). No timestamped runs exist in the local `outputs/` today: globs for `outputs/20*/…/seed-*` returned nothing.
- **RL experiment root** (for example `outputs/bypass-matrix/`):
  - `experiment_plan.json`
  - `train/<row>/train-seed-<T>/{train_manifest.json, maskable_ppo_mesh.zip, best_model.zip, evaluations.npz}`
  - `eval/<row>/train-seed-<T>/eval_manifest.json`
  - `eval/<row>/train-seed-<T>/<policy>/episode-NNNN/{rl_episode.json, steps.jsonl, run.log, sim_stderr.log, inputs/{run.ini,nodes.json,buildings.json}, seed-<S>/{links,positions,flows,routes,mcs,rx-power}.csv, seed-<S>/summary.json}`
  - `comparison/{comparison.json, episodes.csv}`
  - Policies seen on disk: `model`, `hold`, `random_valid`.
- **Ad-hoc RL dirs:** `outputs/p3-verification/bypass-eval-*/eval_manifest.json`, `outputs/one-seed/`, `outputs/one-seed-cmp/comparison.json`, and `outputs/missing-check/comparison.json` (an `incomplete` comparison).
- **Cluster layout:** documented in `MESH/scripts/rl/ops/README.md:227-238` (`cluster/tasks.json`, `receipts/NNNN.json`, `logs/`, `records/`). **No `cluster/` directory exists locally.** Fetched trees are expected under `outputs/fetched/<name>` (`README.md:401-455`).

### 4.2 Artifact table

| Artifact | Producer | GUI needs | Optional? | Load |
|---|---|---|---|---|
| `experiment_plan.json` | `scripts/rl/experiment.py plan/run` | `matrix.name`, `seeds.{training,model_selection,held_out}`, `rows[].{name,observation_preset,reward_components,reward_weights,run_config}`, `steps[].{id,kind,needs}` | Only for experiment roots | Eager (small); this is the index |
| `train_manifest.json` (v4) | `scripts/rl/train.py` | `status`, `seed`, `selection`, `hyperparameters`, `best_mean_reward`, `model_path`, `best_model_path`, `contract.slot_node_ids` | Yes | When selected |
| `eval_manifest.json` (v2) | `scripts/rl/evaluate.py` | `status`, `label`, `seed_roles` (`held_out`, `overlap`), `seeds`, `bundle.{model_selection,model_sha256}`, `contract.{node_ids,slot_node_ids,action_meanings,bounds,tick_s,decision_interval_s}`, `reward_schema.{components,weights,ranges}`, `policies.<p>.episodes[]` with `{seed,status,error,exit_code,decisions,return,reward_components_sum,metrics{…},mask_violations,revalidated_slots_total,episode_dir,summary_json}` | Needed for the RL views | Eager for the selected eval dir |
| `comparison/comparison.json` (`comparison_version` 1) | `scripts/rl/compare.py` (`policy/compare.py:203-236`) | `status`, `primary_metric`, `metrics` (direction and comparability), `inputs[]`, `missing_evaluations[]`, `evaluations[].comparisons[]` (paired), `groups[].comparisons[]` (across runs) | Yes | Eager for the selected root |
| `comparison/episodes.csv` | same | Columns in `policy/compare_inputs.py:20-24`. A flat table covering every policy and seed. | Yes | When the aggregate view opens |
| `<policy>/episode-NNNN/steps.jsonl` (`telemetry_version` 1) | env telemetry (`scripts/rl/env/telemetry.py`) | Header line: `contract`, `observation_schema`, `reward_schema`, `selection`. Step lines: `decision`, `tick`, `time_s`, `action_sent`, `mask`, `reward.{components,total,valid}`, `legacy_reward`, `revalidated_slots`, `facts.nodes`, `facts.links`, `facts.window` | Only present with `--telemetry steps` | Only when a single episode is selected |
| `rl_episode.json` (v3) | env episode (`scripts/rl/env/episode.py`) | `seed`, `status`, `exit_code`, `stop_reason`, `cumulative_reward`, `reward_components_sum` | Yes | With the episode |
| `seed-S/*.csv` | C++ `src/io/viz-writer.cc` | Existing GUI contract | links and positions are required | When selected (existing path) |
| `seed-S/summary.json` | C++ `src/io/metrics-writer.cc` | `network.*`, `per_flow`, `per_node`, `duration_s`, `seed` | Yes | With the episode. The dev plugin already lists it (`vite-plugin-outputs.ts:39`), but `assembleRuns` ignores it. |
| `evaluations.npz` | SB3 callback | Learning curve | Yes | Skip: binary NumPy, not browser-friendly |
| `*.zip` models | SB3 | Hash and path only | — | Never load |
| `cluster/tasks.json`, `receipts/*.json` | `scripts/rl/ops/cluster.py` | Task table and state. Prefer `cluster status --json` over re-implementing reconcile. | Yes | On demand via the CLI |
| `fetch_manifest.json` | `scripts/rl/ops/fetch.py` | `tasks[].state`, `comparison`, `snapshot_of_incomplete_run` | Only for fetched roots | Eager for a fetched root |

### 4.3 Units, identity, and failure handling

- **Time:** CSV `time_s` is in seconds. The `positions.csv` header records `# tickMs=100` and `# simDuration=20000` (milliseconds, Inferred from `tickMs`). Telemetry has `tick`, `time_s`, and `decision`; `contract.tick_s = 0.1` and `decision_interval_s = 1.0` (**Checked** on `bypass-matrix`).
- **Position:** metres (Inferred: the values match `contract.bounds`, which is 0–250 m for x). Z is altitude.
- **Node identity mismatch:** the CSVs use integer `node_id` (0, 1…), while RL manifests use string ids (`node_ids: ["node-a","node-b"]`, `slot_node_ids: ["node-b"]`). The mapping integer = index in `contract.node_ids` fits the sample (node 1 moves; `node-b` is the controlled slot) but is **Not verified** in the C++ writer.
- **Seed identity:** the episode directory name is `episode-NNNN`, and the seed comes from its child `seed-<S>` directory or from `episodes[].seed`. Do not assume `episode-0000` corresponds to the first seed. Match on the `episode_dir` field.
- **Row and model identity:** `label` is the row name. `training_seed` and `bundle.model_sha256` identify a run. `bundle.model_selection` is `best` or `final`.
- **Absolute paths:** manifests and `episodes.csv` store absolute host paths (`episode_dir`, `summary_json`, `run_config`, `sim_binary`). The GUI must map these onto the served root by suffix. Fetch rewrites only the plan's `output_dir` (`ops/README.md:451-453`), so fetched manifests may still hold remote paths. **Risk.**
- **Partial or failed runs:** handled through the episode `status` (`completed` or another value, plus `error` and `exit_code`), the manifest `status`, `episodes_expected` vs `episodes_completed`, and comparison `status: incomplete` plus `missing_evaluations[].reason` (for example `"no eval_manifest.json"`, seen in `outputs/missing-check`). Exclusions are listed per pair as `excluded[].reasons` (for example `model:failed`, `hold:metric_null`) in `policy/compare.py:48-56`. Exit codes: 0 clean, 2 health counters or seed overlap, 1 incomplete (`compare.py:239-248`).
- **95% intervals** (`policy/compare.py:35-45`):
  - Paired kind `paired_t_across_evaluation_seeds` (model minus baseline, per eval dir, `fixed_model: true`).
  - Group kind `t_across_training_runs` (`fixed_model: false`).
  - Fields: `level, n, df, t, half_width, low, high`. With fewer than 2 values the output is `interval: null` plus `interval_omitted`.
  - Group comparisons cover only `GROUP_METRICS`, i.e. metrics comparable across reward definitions; `return` is excluded (`compare_inputs.py:14-17`).
  - `zero_variance` is flagged.
- **Reward components:**
  - Per step: `reward.components`, `reward.total`, and `reward.valid` (per-component validity flag).
  - Per episode: `reward_components_sum`.
  - Schema: `reward_schema.components`, `weights`, and `ranges`, with `zero_demand_rule: "masked"`.
  - `legacy_reward` is always present in steps.
  - Step 0 has `reward: null` and `action_sent: null` (**Checked**).
- **Metric source:** `{"kind":"telemetry_window","warmup_excluded":false}`. The GUI should show this caveat.
- **`comparison.json` name collision:** P0–P2 regression outputs (`outputs/p0-regression/**/comparison.json`) use a different schema (`atol`, `baseline`, `candidate`, `match`, `differences`). Tell them apart by the presence of `comparison_version`. **Checked.**

### 4.4 How the current GUI treats RL episode paths (Inferred)

For `bypass-matrix/eval/local-delivery/train-seed-101/model/episode-0000/seed-301/links.csv`, `assembleRuns.ts:83-95` assigns:

- `yearMonth=train-seed-101`
- `day=model`
- `time=episode-0000`

The resulting key is `train-seed-101/model/episode-0000/seed-301`. **The row name is dropped**, so `local-delivery` and `local-legacy` episodes with the same training seed, policy, episode, and seed get the same key. Their files overwrite each other in `byKey`. The list would group them under `train-seed-101/model`.

## 5. Operations, bridge, and security

### What exists (Checked)

- The only server behaviour is the read-only dev middleware (`vite-plugin-outputs.ts:47-94`). It runs only under `vite` dev. There is no `child_process`, no POST route, and no WebSocket.

### Security observations in `vite-plugin-outputs.ts`

- **Prefix check** (`:63`): the path-traversal guard is `absPath.startsWith(outputsDir)` with no trailing separator. A sibling directory whose name starts with `outputs` (for example `mesh-sim/outputs-old/…` reached via `../outputs-old/x`) would pass. Should use `path.relative` or `outputsDir + path.sep`. Inferred; not exercised.
- **Symlinks** are followed (`fs.statSync` and `createReadStream`), so a symlink inside `outputs/` can expose any file.
- **Malformed URLs:** `decodeURIComponent` (`:59`) throws on a malformed escape, and nothing catches it inside the middleware. The resulting behaviour is **Not verified**.
- **Query strings:** `req.url === '/api/outputs'` (`:51`) is an exact match; a query string disables the route.
- **Hard-coded root** (`:15-16`): the outputs root is fixed. Fetched or cluster roots must live under `mesh-sim/outputs/`.
- **Unbounded walk:** `/api/outputs` walks the whole tree synchronously on every request, and the client then fetches every file (`assembleRuns.ts:216-224`). With RL roots (each eval episode has 6 CSVs plus a summary), this multiplies: `bypass-matrix` alone has more than 100 files per eval dir. **Scalability risk.**
- **Bind address:** Vite's default host setting is used, so no LAN exposure unless `--host` is passed. **Not verified** for this project's run habits.

### Browser-only production build

| Can do safely | Cannot do |
|---|---|
| Read user-picked directories (FSA or `webkitdirectory`) and parse every JSON, JSONL, and CSV artifact listed above | Spawn Python or the simulator, run validation, submit to SLURM, rsync, or read arbitrary paths |
| Show comparison, CI, and trajectory views from already-produced files | Resolve the absolute paths in manifests except by suffix-matching inside the picked tree |
| Display a copyable CLI command built from form inputs | Confirm that the command is valid without running it |

### Thinnest viable bridge (proposal for the Planner; not designed)

A dev-only (or separate local) endpoint that runs an **allowlisted module plus argv array** with `spawn(python, ['-m', module, ...args], {shell: false, cwd: MESH})`. Output is captured as JSON where supported. The GUI builds argv only; all logic stays in the simulator. Candidate allowlist:

| Purpose | Existing CLI | Machine-readable output |
|---|---|---|
| Validate config | `python -m scripts.rl.validate_config --sim-binary B --run-config R [--seed] [--output-dir] [--launch] --json` (`validate_config.py:198-246`) | Yes: `{status, checks[], launch}` |
| Plan or run a matrix locally | `python -m scripts.rl.experiment plan|run --matrix M --output-root R --sim-binary B [--rows]`, and `status --output-root R` (`experiment.py:417-431`) | Plan file on disk. `status` has no `--json`. |
| Train, evaluate, or compare one run | `train.py` (`:205-235`), `evaluate.py` (`:82-98`, has `--json`), `compare.py` (`:24-32`, has `--json`) | Partly |
| SLURM | `python -m scripts.rl.ops.cluster plan|submit|status|resume|cancel|compare` (`ops/README.md:137-151`) | `status --json`. `--dry-run` exists on submit, resume, and cancel. |
| Fetch | `python -m scripts.rl.ops.fetch --remote … --dest … --select … [--dry-run]` | `fetch_manifest.json` |

Constraints to preserve:

- `submit`, `resume`, and `cancel` are state-changing. The GUI should default to `--dry-run` and require an explicit human confirmation.
- Receipts and locks must never be written by the GUI; the CLI owns `cluster/`.
- SLURM commands must run on the cluster host (`sbatch` on `PATH`). From a laptop that means SSH, which no current tool wraps. **Open decision.**
- Validation needs the venv at `MESH/.venv` (`bootstrap_venv.py`). Its presence locally is **Not verified**.

## 6. Minimum useful P6 vertical slice (this week)

### Essential

1. **Configure and validate.** A form for `run.ini`, seed, observation preset, and reward components/weights, which calls `validate_config --json` through the bridge and renders `checks[]`. If there is no bridge, show the command to copy.
2. **Find a run.** Index experiment roots by `experiment_plan.json` and `eval_manifest.json`: row, training seed, policy, and seed. Load only manifests eagerly and load CSVs lazily. Key runs by full relative path so rows stay distinct.
3. **Explain one saved model vs `hold` and `random_valid`.** From `comparison.json` `evaluations[]`, show per metric: model mean, baseline mean, mean difference, and the 95% interval (or `interval_omitted`), with direction from `metrics.higher_is_better`. Show health counters, `held_out`, and `compatibility.note`.
4. **Single-seed inspection.** Open an episode's `seed-S` directory in the existing player. Add a step panel from `steps.jsonl`: action name via `action_meanings`, mask, reward components, and total per decision, synced to `time_s`.
5. **Aggregate results.** Render `groups[]` (across training runs) and the `episodes.csv` table, with `status` and exclusions visible.
6. **Controlled-node trajectories.** A trail polyline from `positions.csv` for the nodes named in `slot_node_ids`, optionally overlaid for model, hold, and random_valid on the same seed.

### Visual enhancements (defer)

- Jammer visualisation (needs `jammers.json` schema work; `jammers_json_sha256` is `null` in the sample).
- Learning curves from `evaluations.npz`.
- SLURM submit and resume buttons. Keep only `status --json` and `--dry-run` this week.
- Animated action arrows, mask heatmaps, and theme polish.

## 7. Compatibility risks

- The run key collision across rows (§4.4) silently shows the wrong episode.
- Mapping integer CSV ids to string RL ids is unverified.
- Absolute paths in manifests break when roots move (fetch, cluster).
- The two `comparison.json` schemas need a discriminator.
- Eager dev discovery will get slow on large experiment roots.
- `steps.jsonl` exists only with `--telemetry steps`, so views must degrade gracefully when it is absent.
- The `positions.csv` header has no units; units are inferred.
- Schema versions to pin: `eval_manifest_version` 2, `comparison_version` 1, `manifest_version` 4 (train), `manifest_version` 3 (`rl_episode`), `telemetry_version` 1, `experiment_plan_version` 1. The GUI should refuse unknown versions.
- `return` and `legacy_reward` are not comparable across reward definitions (`METRICS` flags).
- No GUI test harness exists.

## 8. Open decisions for the Planner

1. Bridge or no bridge this week: a dev-plugin argv runner vs copy-a-command only.
2. Where SLURM commands run (on the cluster over SSH, vs only reading fetched roots locally).
3. How to make the served outputs root configurable (fetched trees, cluster mounts), and whether to fix the prefix and symlink checks first.
4. Whether to replace eager `/api/outputs` downloading with a manifest-first index.
5. Whether to add a GUI test runner (for example Vitest) for the new parsers.
6. How to confirm the node-id mapping: read `viz-writer.cc` or ask the simulator owner.
7. Which metric is primary in the UI: the simulator declares `delivery_ratio` (`policy/compare.py:20`).

## 9. Proposed human verification path

1. Run `npm run dev` and open `http://localhost:5173`. Confirm that the existing loader lists the `bypass-matrix` episodes, and see the label collision described in §4.4.
2. After P6: open `outputs/bypass-matrix`. Check that the rows `local-delivery` and `local-legacy` appear separately, with training seeds 101 and 102 and policies `model`, `hold`, and `random_valid`.
3. Open model vs hold for `local-delivery/train-seed-101`. Check the means and interval against `comparison/comparison.json`, and check the per-seed values against `episodes.csv` (for example seed 301: `delivery_ratio 1.0`, `los_fraction 0.735`).
4. Open episode seed 301. Confirm that `node-b` (integer id 1) moves from x = 200 toward x = 0, that the step panel shows `action_sent [0]` (west), and that `reward.components.delivery_ratio = 1.0`.
5. Open `outputs/missing-check` and confirm that the GUI shows `incomplete`, the missing reason, and `interval_omitted`.
6. Run `npm run build` and `npm run lint`. If a bridge exists, run validate on `inputs/baselines/building-bypass-smoke/run.ini` and compare the output to the CLI's `--json` output.

## 10. Not verified

- The `npm run preview` behaviour of the outputs plugin.
- The exact pytest command for `MESH/scripts/rl/tests`.
- The mapping from integer `node_id` to `contract.node_ids`.
- Units in `positions.csv` (metres) and `simDuration` (milliseconds).
- The runtime effect of a malformed URI or a sibling-prefix path on the dev plugin.
- Whether `MESH/.venv` exists locally.
- Real SLURM behaviour (the simulator README states only fake-scheduler coverage).
- Whether any legacy timestamped `seed-N` run still exists elsewhere (none under the local `outputs/`).
