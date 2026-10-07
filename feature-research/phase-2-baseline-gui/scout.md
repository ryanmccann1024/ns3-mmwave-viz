# Phase 2 Scout: Baseline runs in the existing GUI

Scope: `ns3-mmwave-viz`. This is a read-only exploration. The only write is this file. Written 2026-09-30.

## 1. Repository state

| Item | Value | Source |
|---|---|---|
| GUI branch | `docs/rl-gui-integration` | Session Git snapshot at start |
| GUI dirty state | Scout began clean; reviewer live check found only this untracked `feature-research/phase-2-baseline-gui/` directory | Scout session snapshot; reviewer ran `git status --short --branch` on 2026-09-30. No tracked GUI source edits were present. |
| GUI HEAD | `da925e8 docs: document RL GUI integration, update README and CLAUDE.md` | Session Git snapshot |
| Phase 1 source | `/Users/ryanmccann/Documents/Codex/2026-09-29/hell/work/phase1-pr-checkout/scratch/mesh-sim` (PR #15) | Read directly |
| Phase 1 CI and merge into `develop` | **Not verified** | PR/CI status was not checked |
| Plan | `.../hell/outputs/mesh-sim-baseline-integration-plan.html`, section `#phase2` (lines 196-212) | Read |

**Dependency:** Phase 2 must not merge until PR #15 passes CI and lands in `develop`. The plan says Phase 1 must land before Phase 2 consumes its outputs (plan line 432).

## 2. Phase 1 output contract (verified from PR #15 source)

### Standalone run (`scripts/baselines/runner.py`)

- Default root: `outputs/YYYY-MM/DD/HH-MM-SS-baseline[-N]/`, from `automatic_output_root` (runner.py:35-45, `OUTPUT_LABEL = "baseline"`).
- The simulator writes into this root: `seed-N/{links,positions,...}.csv` and `seed-N/summary.json`.
- Baseline artifacts in the root:
  - `baseline_manifest.json`
  - `planner.log`
  - `sim.log`
  - `source-inputs/`
  - `effective-inputs/`

  The plan is **inside** `effective-inputs/baseline-plan.json`, not at the run root (`adapter.py:459-465`; confirmed by `test_runner.py:73`). A failed preparation may have a manifest but no plan or seed CSVs. Artifact names come from artifacts.py:11-14 and effective_inputs.py:14-15.
- Seed records are `{seed, status: complete|missing|failed, summary: "seed-N/summary.json" | null}` (runner.py:86-95, artifacts.py:153-157).

### Evaluation run (`scripts/rl/evaluate.py`, `scripts/rl/policy/evaluate.py`)

- Policy names are `geometric` and `optimization` (`PLACEMENT_POLICIES`, evaluate.py:24). Each one runs as `HoldPolicy` on a prepared layout (evaluate.py:65-69).
- Baseline artifacts go to `<eval_out>/<method>/baseline/` (evaluate.py:80-83).
- Episodes follow the existing layout, `<eval_out>/<policy>/<episode_dir basename>/seed-N/...`. `episode_dir` is recorded as an absolute host path (policy/evaluate.py:101, 115).
- `eval_manifest.json` keeps `eval_manifest_version = 2` (policy/evaluate.py:17). Each placement policy block gains an optional `policies[<name>].baseline` object (policy/evaluate.py:323-324). That object comes from `eval_metadata` (artifacts.py:203-221) and contains:
  - `method`, `requested_algorithm`, `objective`, `executor`
  - `planner_seed`, `max_iterations`, `fingerprint`
  - `initial_displacement_m_total`
  - `effective_scenario_identity`: the four `*_sha256` keys
  - `planner_source_sha256`, `rf_config_sha256`, `mapping_sha256`
  - `manifest` and `plan`: relative paths
- `comparison.json` keeps `comparison_version = 1`. By default, every non-model policy is a baseline (policy/compare.py:211-213). Grouping adds `baseline_<policy>_fingerprint` to the group key (policy/compare.py:131-134). No new comparison fields are consumed by the GUI.

### Manifest schema (`baseline_manifest_version = 1`, artifacts.py:80-123)

- Identity fields: `run_id` (UUID), `mode` (standalone or evaluation), `method`, `objective`, `requested_algorithm`, `executor`.
- Status is one of `preparing`, `prepared`, `running`, `complete`, `failed`, `interrupted`. Terminal statuses set `ended_at`; evaluation preparation also finalizes a `prepared` manifest. Errors, when present, are recorded in `error` (artifacts.py:18-24, 136-150; adapter.py:474).
- Timing and setup fields: `planner_wall_s` and `initial_displacement_m_total`.
- Provenance fields:
  - `fingerprint`, `planner_source`, `rf`, `mapping_sha256`, `sim_binary_sha256`
  - `source_scenario_identity`, `effective_scenario_identity`
  - `package_versions`
  - `source_run_config_abs`, which is an absolute host path. Do not display it by default.
- Path fields: `plan`, `planner_log`, `sim_log`, `source_inputs`, `effective_inputs`, `eval_manifest`. Most are relative to the baseline run directory; `eval_manifest` is formed separately with `os.path.relpath` (`adapter.py:469-474`).
  `eval_manifest` in an evaluation-mode baseline manifest can point upward from its `<method>/baseline/` directory to the evaluation root, so it can contain `..`; the GUI must not feed that field to `normalizeRelPath` or fetch it as a catalog path. The evaluation manifest's own `policies[name].baseline.manifest` and `.plan` fields are instead relative to the **evaluation root** (`adapter.py:469-479`).

### Plan schema (`baseline_plan_version = 1`, artifacts.py:182-193)

- Top-level fields: `method`, `objective`, `nodes[]`, `initial_displacement_m_total`, `planner_predictions`.
- Each node entry has `id`, `roster_index`, `slot`, `role`, `platform`, `radios`, `selected`, `original{x,y,z}`, `planned{x,y,z}`, and `displacement_m` (adapter.py:260-282). **Stable node identity is `id`**, with `roster_index` as a secondary key.

## 3. What the GUI already accepts

| Artifact | Current behaviour | Evidence |
|---|---|---|
| Standalone `seed-N/*.csv` | Accepted as a legacy run. `time` becomes `HH-MM-SS-baseline`. No method or status is shown. | `isLegacyRunPath`, `assembleRuns` (src/lib/assembleRuns.ts:57-64, 66-234) |
| Eval manifest v2 with `geometric`/`optimization` policies | Accepted. Policies, summaries, and episodes are read generically. | `loadExperiment` (src/lib/experimentIndex.ts:517-526), `SUPPORTED_VERSIONS.evalManifest = 2` (line 8) |
| Placement episodes (`<eval>/<method>/episode-N/seed-N`) | Playable through `buildEpisode`. The directory is resolved from the relative layout, not the absolute path. | experimentIndex.ts:278-344, `hostBasename` 165-168 |
| Baseline-only eval (`training: null`) | Supported for the standalone root `eval_manifest.json` | experimentIndex.ts:477-486 |
| `comparison.json` v1 with new baseline names | Accepted. `baseline` is a free string. | src/lib/comparisonView.ts:30-46, 226-270 |
| Missing metrics | Kept as `null` (`metrics: Record<string, number \| null>`) | experimentIndex.ts:69, 336 |

## 4. Gaps

| Gap | Location |
|---|---|
| `baseline_manifest.json` and `baseline-plan.json` are **not in the catalog allowlist**. The catalog's folder-picker/FSA paths and the dev server's `listOutputs` therefore drop them. Separately, the Runs loaders use `isKnownFile` / `isLegacyRunPath` filters rather than the catalog allowlist; those filters also exclude baseline manifests, and `assembleRuns` only emits entries with both links and positions. Merely extending `READER_FILE_NAMES` will not enrich Runs or show pre-CSV failures. | `READER_FILE_NAMES`, src/lib/resultCatalog.ts:15-34; vite-plugin-outputs.ts:38; `assembleRuns.ts:27-64, 66-234, 237-304`; `useWorkspace.ts:45-105` |
| The `policies[name].baseline` block is ignored. Only `summary` and `episodes` are read. | experimentIndex.ts:517-526; `Evaluation` type lines 79-111 has no baseline metadata field |
| `policyLabel` has no `geometric` or `optimization` label. They fall back to the raw names. | src/lib/rlLabels.ts:28-33 |
| Sort order puts the new policies last, alphabetically. | `POLICY_ORDER`, experimentIndex.ts:637 |
| Both new policies get the same default grey trail colour, so their overlays and legends cannot be told apart. | `TRAIL_COLORS`, src/styles/tokens.ts:66-72 |
| The Player header says "model trained with seed none" for baseline episodes. | src/components/pages/PlayerPage.tsx:141-145 |
| Standalone runs have no method, objective, or status, and there is no failed or incomplete state. A run that failed before any seed CSVs exist is invisible. | `RunEntry`, assembleRuns.ts:4-20; src/components/pages/RunsPage.tsx |
| The Runs view does not read `summary.json` for legacy runs. | assembleRuns.ts:27-37 (`SEED_LEVEL_FILES`) |
| Scenario/seed buttons are rendered by shared `ScenarioRow`, also used on Home; a manifest-only status cannot be represented by the current required-CSV `RunEntry` or navigated through its existing `onOpenRun` callback. | src/components/pages/shared.tsx:46-115; HomePage.tsx:143; App.tsx:28,57 |
| Dev-server startup accepts an auto-discovered folder only when at least one playable legacy run or experiment root exists; a folder with only a failed standalone baseline manifest currently falls through. | src/hooks/useWorkspace.ts:72-99 |

### Label consumers to update through `policyLabel` only (no per-site edits needed)

- `src/App.tsx:141`
- `src/components/rl/ReplayPicker.tsx:74,111`
- `src/components/EpisodeDetails.tsx:77,384,525`
- `src/components/pages/PlayerPage.tsx:143,219`
- `src/components/pages/ExperimentPage.tsx:142,321`

## 5. Identity, duplicates, paths, legacy

- **Node identity:** trail overlays map contract `slot_node_ids` to CSV row indices within one evaluation (src/hooks/useExperimentSession.ts:33-45, `TrajectoryLayer` key `${policy}-${nodeIndex}`). This is safe inside one evaluation because the contract is shared, and placement keeps `roster_index`. **Not verified:** that the effective `nodes.json` keeps roster order, so CSV index equals `roster_index`, for every scenario. Planner should match the plan's `id` to the contract `slot_node_ids` and should not assume position.
- **Flow identity:** no cross-run flow matching exists today, and Phase 2 does not need any.
- **Duplicate discovery:** a standalone baseline root has no `eval_manifest.json`, so it is only a legacy run and never an experiment root (`discoverExperiments`, experimentIndex.ts:190-213). If Phase 2 adds manifest-based discovery, it must key on the run directory (`YYYY-MM/DD/HH-MM-SS-baseline`) and attach metadata to existing playable seed entries while showing at most one additional manifest-only status row when no seed is playable. In evaluations, `<method>/baseline/effective-inputs/nodes.json` is catalogued because `nodes.json` is allowlisted. It is not a legacy run, because its parent is not `seed-*` or `inputs`.
- **Safe paths:** anchor paths by their producer contract: standalone manifest `plan` and seed-record `summary` are relative to the standalone run root; `policies[name].baseline.manifest` and `.plan` are relative to the evaluation root. Normalize each field before joining to the catalog path, and reject traversal/absolute paths (resultCatalog.ts:61-72). The evaluation-mode baseline manifest's `eval_manifest` may legitimately contain `..`; do not dereference it through the catalog. Treat absolute fields (`source_run_config_abs`, `episode_dir`) as display-only or basename-only.
- **Legacy compatibility:** old manifests have no `baseline` block, so the new field must be optional (`null`). Existing tests cover old RL and ordinary runs: `tests/experimentIndex.test.ts`, `tests/assembleRuns.test.ts`, `tests/resultCatalog.test.ts`, `tests/outputsServer.test.ts`, `tests/rlLabels.test.ts`, `tests/comparisonView.test.ts`.

## 6. Proposed Planner scope (smallest change set)

| File | Change |
|---|---|
| `src/lib/resultCatalog.ts` | Add `baseline_manifest.json` and `baseline-plan.json` to `READER_FILE_NAMES`. This covers catalog discovery through the picker, FSA, and dev server, but not the separate Runs file loaders. |
| `src/lib/baselineRuns.ts` (new) | Pure parser: `parseBaselineManifest` (version check = 1, status enum, optional fields become `null`, safe relative paths), plus a small plan reader (per-node `id` and `displacement_m`, total). Returns `{state: ok\|incomplete\|failed\|unsupported, message}`. |
| `src/lib/assembleRuns.ts` and `src/hooks/useWorkspace.ts` | Reconcile catalog-discovered standalone manifests with the existing Runs pipeline by canonical run directory; attach metadata to playable seed runs without duplicating them. Because `RunEntry` currently requires both CSV `File`s, use an explicit non-playable run/status representation for a manifest-only failed or incomplete run. Freeze how this works for dev-server, FSA, and classic folder-picker paths; the current Runs loaders do not read catalogued manifest files. |
| `src/lib/experimentIndex.ts` | Read the optional `policies[name].baseline` into `Evaluation.baselineMeta: Record<string, BaselineMeta>`. Extend `POLICY_ORDER` with `geometric` and `optimization`. |
| `src/lib/rlLabels.ts` | Add `policyLabel` entries (for example "Geometric placement" and "Optimization placement") and a helper that returns a short objective label. |
| `src/styles/tokens.ts` | Two distinct `TRAIL_COLORS` entries |
| `src/components/pages/PlayerPage.tsx` | Replace the "model trained with seed none" text for non-model policies. Add a method/objective `Badge`. |
| `src/components/pages/ExperimentPage.tsx`, `src/components/EpisodeDetails.tsx` | Compact method/objective badge. Add a collapsed `ui/Disclosure` with provenance: fingerprint, planner seed, displacement total, planner wall time, and hashes. `planner_wall_s` is in `baseline_manifest.json`, **not** the eval manifest's `baseline` block, so any eval timing display must safely read the referenced manifest. Do not imply an absent value is zero. |
| `src/components/pages/RunsPage.tsx`, `src/components/pages/shared.tsx`, and possibly `HomePage.tsx` / `App.tsx` | Method and status badges; non-playable manifest-only rows need a distinct render/navigation path because `ScenarioRow` is shared with Home. Planner must freeze the smallest consistent consumer change. |

Out of scope:

- A new Compare page
- The Phase 3 decision/WHY inspector
- Phase 4 motion
- Any PPO change
- A fake action chart for placement runs
- A new statistics path. Keep `comparisonView.ts` as is.

### Tests and fixtures

- Add `tests/baselineRuns.test.ts` with synthetic JSON only. Cover:
  - v1 manifest
  - unknown version
  - every status
  - missing plan
  - unsafe `../` and absolute paths
  - `null` metrics that stay unavailable
- Extend `tests/resultCatalog.test.ts` and `tests/outputsServer.test.ts`: the new names appear through both loading paths.
- Extend `tests/assembleRuns.test.ts`: the `HH-MM-SS-baseline` run appears exactly once with metadata attached, and a relocated root still works.
- Cover manifest-only failed/incomplete discovery through all three loading paths, including dev-server startup when there are zero playable CSV runs; verify non-playable rows cannot invoke playback.
- Extend `tests/experimentIndex.test.ts`: an eval with `geometric`/`optimization` blocks, and a legacy eval with no `baseline` block that is unchanged.
- Extend `tests/rlLabels.test.ts`: the new labels.
- Fixtures should be hand-written, minimal, and synthetic, shaped from artifacts.py. Do not copy private scenarios or generated bundles.

## 7. Open questions

1. The Phase 2 brief requires failed/incomplete discovery; Planner should show manifest-only failed/interrupted/preparing/running runs in Runs as non-playable status rows, without a fake seed or telemetry. Freeze how these rows coexist with playable seed entries and how stale/in-progress status is labelled.
2. `objective` is the enumerated set `coverage | balanced | resilience` (`scripts/baselines/config.py:14`). The label helper should also fall back safely for unknown historical/future strings.
3. The GUI does not currently read `summary.json` in Runs. Should the "method timing / setup displacement" summary use only the manifest (`planner_wall_s`, `initial_displacement_m_total`)? The recommendation is yes.
4. Warning labels for input, duration, physics, or warmup differences need comparable source fields. Eval `scenario_identity` and baseline `effective_scenario_identity` hashes can support only the corresponding input-identity check; they do **not** prove duration, physics, or warmup equality. The eval manifest has `metric_source.warmup_excluded`; only show other mismatch badges if matching fields are actually present and parsed. Missing provenance must be labelled unknown, not equal.
5. The plan table names `EpisodeDetails.tsx`. Confirm that badges in the header and details are enough and no new panels are needed.

## 8. Risks

- The allowlist change also affects the dev-server listing size. It is small: two files per run.
- The absolute `source_run_config_abs` could leak host paths into screenshots. Keep it hidden or basename-only.
- Placement trails at t=0 show a jump from the original to the planned position only if the CSVs start at the original position. **Not verified**. The plan applies the layout through the effective `run.ini`, so the CSVs likely start at the planned layout. A "placement marker" may therefore need `baseline-plan.json` `original` coordinates.
- Two policies share a colour until the tokens are extended.

## 9. Not verified

- PR #15 CI status and merge into `develop`
- That the effective `nodes.json` keeps roster order for CSV node indices
- Whether the CSVs start at the planned or original positions
- The real-binary output layout. Only the source was read; no generated bundles were inspected, as instructed.
