# GUI integration implementation plan

Status: revised for implementation, 2026-09-19. This is a local handoff plan, not a public product document.

## 1. Outcome and boundary

Make the existing ns3-mmwave-viz application a useful reader of completed or partially completed RL experiments. A user can open an experiment or fetched-results folder, compare saved policies and baselines, inspect one seed in the existing 3D player, and see controlled-node trajectories and optional per-decision telemetry.

The GUI is read-mostly. It must not train, evaluate, validate, submit/cancel SLURM jobs, fetch files, edit simulator configuration, write receipts, or become an alternative experiment runner. The simulator's existing Python CLI remains the authority for those actions. A displayed run configuration is evidence of what ran, not an editable configuration form. Cluster receipts and fetch manifests are saved snapshots, not live queue status. This explicitly narrows the earlier P6 proposal to match the user's latest direction; operations controls require a separate decision and phase.

Ship this week: the result-reading vertical slice, documentation, tests, and human verification. Preserve the legacy single-run viewer and its playback. Defer jammer graphics, binary model/NPZ inspection, live SLURM status, action arrows, and GUI experiment creation.

Success means that two experiment rows with otherwise identical seed and episode names remain separate; the numbers and intervals shown match the simulator's comparison file; a selected episode plays in the existing scene; missing data is explained rather than silently replaced; and a production build can open a user-selected folder without a command server.

## 2. Existing code and ownership

| Existing file | Responsibility and intended treatment |
|---|---|
| src/components/FileLoader.tsx | Existing dev/FSA/folder picker and legacy run list. Add a small experiment entry point; preserve existing legacy behaviour. Correct its outdated scratch/mmwave-sim path hint. |
| src/lib/assembleRuns.ts | Legacy run assembly and eager dev fetch. Keep legacy parser for legacy paths only; do not let RL episode paths collide across rows. Do not eagerly download all RL CSVs. |
| src/hooks/useSimData.ts | Existing File-based CSV parser/player. Reuse for the selected RL episode instead of creating a second CSV parser. |
| src/App.tsx | Owns displayed view and player state. Add a minimal experiment/episode selection path, not a new application shell. |
| src/components/canvas/Scene.tsx and coordinates utilities | Existing Z-up to Y-up mapping. Add optional trajectory rendering through a small component, leaving current node/link rendering intact. |
| vite-plugin-outputs.ts | Existing read-only dev GET server. Retain read-only behaviour; fix path containment, symlink escape, malformed URL handling and unbounded/eager RL discovery. No POST routes or process spawning. |
| Simulator artifacts | The simulator writes manifests, telemetry, CSVs and comparisons. Never recalculate its statistical comparisons in TypeScript. |

Source evidence: feature-research/p6-gui-integration/scout.md; simulator scripts/rl/policy/compare.py and compare_inputs.py; existing outputs/bypass-matrix. Before coding, the Implementer must verify the fields used below against the checked-in/current artifacts, because the two repositories may move independently.

## 3. Reader contract and loading policy

An experiment root contains experiment_plan.json, optional train and eval trees, and optional comparison/comparison.json. A fetched root may also contain fetch_manifest.json. An evaluation directory contains eval_manifest.json and policy/episode-NNNN directories. An episode contains optional rl_episode.json and steps.jsonl, an inputs directory, and seed-S CSVs plus summary.json.

| Artifact | Purpose | Read timing |
|---|---|---|
| experiment_plan.json | Row names, seed roles and declared experiment metadata | At root selection, if present |
| comparison/comparison.json | Authoritative model-vs-baseline metrics, exclusions and intervals | At root selection, if present |
| eval_manifest.json | Per-policy, episode and seed index; health/status; contract and reward schema | Indexing a selected experiment/evaluation |
| train_manifest.json | Model selection, training seed, hyperparameters and best mean reward | Only when training summary is opened |
| fetch_manifest.json | Fetched/not-fetched and snapshot completeness | At fetched-root selection, if present |
| comparison/episodes.csv | Optional detailed aggregate table | Only when table opens |
| rl_episode.json and seed-S/summary.json | Episode status, reward totals and run summary | Only when episode opens |
| seed-S CSVs and episode inputs | Existing playback and trajectories | Only when episode opens |
| steps.jsonl | Actions, masks, per-decision rewards and facts | Only when telemetry panel opens |
| model ZIP and evaluations.npz | Not read by browser | Never |

The primary file catalog is a map from normalized root-relative path to the selected browser File/handle. Support both File System Access directory picks and webkitdirectory FileList fallback. Do not dereference absolute host paths embedded in manifests, including paths from a remote cluster. Link a manifest episode to the catalog using its declared row, training seed, policy, episode identity and seed in the selected root; if the relative artifact is absent, show missing data. Never suffix-search the whole filesystem or silently choose a similarly named episode.

The dev server is a convenience read-only source for its configured simulator outputs directory. The production build must still work from a folder picker. Index only small manifest/metadata files on initial load; download CSV/JSONL bytes only for a selected episode or table. If a browser API cannot provide a directory handle, the FileList fallback still works. Keep memory bounded to the selected episode and release prior episode data on selection change.

Recognize comparison files by comparison_version, not by filename alone: P0 regression comparisons also use comparison.json with a different schema. Reject an unsupported version with a clear message; allow an otherwise usable episode view when an optional manifest is absent. Status must distinguish incomplete, failed, missing, and not_fetched.

## 4. Meaning of what is displayed

Comparison view: show the simulator's primary metric, metric direction, policy/baseline names, means, model-minus-baseline difference, exact 95% interval low/high when present, sample count, interval_omitted reason, excluded seeds and health counters. Label paired intervals as across held-out evaluation seeds for a fixed model. Label group intervals as across training runs. A missing interval is not zero-width. An incomplete comparison is not a successful result.

Do not compare returns between rows with different reward definitions. Use the comparison schema's comparability flags. Keep summary.json statistics separate from comparison.json, because they may cover different time windows. Show the source and time-window caveat in the UI. No new CI computation in the GUI.

Training summary: show training seed, selected model (best/final), hyperparameters, selection metric, and best_mean_reward. Do not label best_mean_reward as a learning curve. Per-decision reward may be charted only when steps.jsonl exists, with step zero's null reward skipped or shown as “not yet awarded.” Do not parse evaluations.npz.

Episode drilldown: display policy, row, training seed, held-out/evaluation seed, status, controlled node IDs, action meanings, masks, action sent, reward components/total, and revalidated controlled-node slot IDs/count where available. “Revalidated” means the simulator checked the action against the current state; it does not by itself mean the node moved. If steps.jsonl is absent, keep 3D playback and explain that decision telemetry was not saved. Each saved record describes the action applied and reward earned in its ending interval; show it only when that interval contains the playback time. Sparse telemetry leaves gaps, which must be labelled rather than filled with an older action. Never interpolate discrete actions.

Trajectory overlay: use recorded positions from the chosen model episode and, when explicitly selected, hold/random_valid episodes for the same row, training run and held-out seed. Map integer CSV node_id to contract.node_ids array order, then identify controlled nodes via contract.slot_node_ids. This mapping was checked in the simulator's VizWriter and RL bridge; add a targeted invariant test. Use the scene's existing coordinate transform, distinct colours and a legend; decimate rendering for large position tables without changing endpoints. Never join trajectories merely by episode-NNNN.

Cluster/fetch view, if corresponding files exist: display saved task/receipt states and fetched/not-fetched status as historical snapshots, with source filename and snapshot caveat. Do not claim a current queue position or ETA.

## 5. Minimal module shape

Keep the new code small and responsibilities legible. Suggested additions (names may be adjusted to match existing conventions):

| Module | Single responsibility |
|---|---|
| src/lib/resultCatalog.ts | Build a safe, root-relative, lazy file catalog for picker and read-only dev sources. |
| src/lib/experimentIndex.ts | Parse/version-check manifests and resolve experiment/evaluation/episode identity. |
| src/lib/comparisonView.ts | Convert authoritative comparison fields into display-ready rows without recomputing metrics. |
| src/lib/episodeTelemetry.ts | Parse optional JSONL on demand and select a decision by playback time. |
| src/components/ExperimentBrowser.tsx | Experiment, row, policy, seed, comparison and status selection. |
| src/components/EpisodeDetails.tsx | Selected episode's status, configuration, summary and telemetry. |
| src/components/canvas/TrajectoryLayer.tsx | Optional, decimated controlled-node trail overlay. |

Prefer fewer modules if an existing file already has exactly that responsibility; do not pile parsers, statistics and server logic into App.tsx or FileLoader.tsx. Keep comments short and explain non-obvious invariants in the concise user-facing README. Avoid public “P6” labels, plan-section references, AI attribution, generated-by signatures, and large prose comments in runtime code.

No new server package, standalone Node service, command bridge, configuration editor, job state machine, or duplicated simulator validation logic. A tiny test runner for pure parser/index modules is reasonable; do not build an elaborate fixture framework.

## 6. Implementation slices and gates

Each slice should be reviewable independently. The Implementer orchestrates bounded implementation work, checks integration, and records a short local audit; the Reviewer reviews code and writes a targeted Tester handoff; the Tester runs only the relevant automated and human-path checks and reports back. The user's final sign-off precedes Git/PR. The plan and scratch reports remain local unless the user explicitly chooses to publish them.

### S0 — Contract check, no code

Read the current GUI files above and one complete simulator experiment root, plus an incomplete/fetched example if available. Record exact schema versions, required/optional keys, identity relationship, and a small fixture set in the local audit. Confirm the node index-to-contract ID mapping in C++ and one sample CSV. If the real artifacts contradict this plan, update the local plan first, then implement. Do not capture large outputs or models in Git.

Human check: identify one row, one training seed, model/hold/random_valid episodes and their held-out seed from the source manifests before touching the UI.

### S1 — Safe catalog and legacy isolation

Implement the lazy browser catalog and read-only dev indexing. Change legacy run assembly so RL-shaped paths are excluded from timestamp run grouping; full relative path is the RL identity. Fix GET file serving with decoded URL error handling, path.relative containment, symlink-aware root containment and a bounded/filtered file list; no writes or process launch. Preserve a legacy single-run load.

Automated checks: path traversal and symlink escape are denied; malformed URI does not crash server; two rows with otherwise identical episode names remain distinct; no RL CSV fetch occurs before episode selection; legacy path grouping still works.

Human check: open a legacy run and an experiment root in dev mode; the legacy run is unchanged, while experiment rows do not merge. Open a user-picked root in a production preview.

Stop if a change to the existing File-based player would be needed to index results; adapt the catalog instead.

### S2 — Experiment and comparison reader

Add versioned manifest parsing and the experiment list/comparison screen. Use exact simulator-provided comparison numbers and interval fields. Show held-out labels, sample counts, missing/incomplete/excluded states and reward-comparability caveat. Add optional training summary and static fetch/cluster snapshot display only if corresponding metadata exists; no job controls.

Automated checks: comparison_version separates RL and regression schemas; paired and group intervals display exact low/high and n; null interval and incomplete comparison have explicit states; remote absolute paths do not resolve outside the selected catalog; missing/not_fetched remain distinguishable.

Human check: compare one visible model-vs-hold row in outputs/bypass-matrix with comparison/comparison.json character for character for selected numeric fields. Open an incomplete example and verify the missing reason.

### S3 — Episode playback, telemetry and trails

From a selected manifest episode, lazily materialize only its inputs and seed CSVs as Files for the existing useSimData path. Add optional summary and steps.jsonl drilldown synchronized to playback time. Add controlled-node trajectory layer with model/hold/random_valid overlay only for matching row, training run and held-out seed.

Automated checks: seed and episode mapping does not rely on ordinal position; integer-to-string node mapping is correct; no telemetry remains a valid episode; step-zero null reward is handled; decision selection at time boundaries is stable; trajectory endpoints survive decimation; a missing required CSV gives an actionable message.

Human check: open a saved model episode, seek the existing playback, inspect its action/reward at two decisions and compare to JSONL; verify the controlled node's trail follows positions.csv. Toggle hold/random_valid overlay on the same held-out seed and verify the legend.

### S4 — Proportionate verification and handoff

Run npm run build and npm run lint. Add a small automated test command for the pure catalog/index/comparison/telemetry logic, using tiny synthetic fixtures and one or two small real-artifact excerpts only if needed. No duplicate broad simulator test suite or new huge snapshots. Check both dev auto-discovery and static production folder-pick pathways. Check a missing telemetry file, a partial experiment, and the legacy viewer.

Write or update one concise GUI README section, linking to simulator RL/ops documentation rather than copying it. Include: what the GUI reads; how to obtain/fetch results using the simulator CLI; how to open a result folder in dev and production; what paired/group intervals mean; why a comparison or trajectory may be unavailable; and the fact that the GUI does not run jobs. Keep the implementation audit and tester evidence local. Reviewer and Tester exchange a short risk/results handoff, not an excessive test inventory.

Human completion checklist:

1. Open a legacy seed run; links, positions and controls still behave as before.
2. Open outputs/bypass-matrix; distinct rows, training seeds, policies and held-out seeds appear.
3. Compare a model/baseline metric and 95% interval directly with comparison.json.
4. Inspect one episode's configuration, summary, telemetry and controlled-node trail; missing telemetry degrades cleanly.
5. Open an incomplete/fetched root and read a precise status, not a made-up live queue state.
6. Build, lint and focused tests pass; production preview can read a picked folder without the Vite outputs middleware.

## 7. Examples of the end-to-end path

Existing CLI path: simulator Python experiment command creates an experiment root; evaluation creates eval_manifest.json, per-policy episodes and CSVs; comparison creates comparison/comparison.json. If run on a cluster, existing CLI fetch copies selected artifacts to a local fetched root. The GUI does not execute any of these steps.

GUI path: user opens the local root or fetched root → small manifests index rows/training seeds/policies → comparison page shows the saved model-minus-baseline estimate and interval → user chooses one held-out seed → only that episode's CSVs load into the existing 3D player → optional JSONL drives the decision panel → optional matching-policy trails overlay.

Legacy path: user opens a timestamp/seed-N output → the existing run list and player work exactly as before. RL episode directories are not misclassified as legacy timestamp runs.

Failure path: comparison is incomplete, an episode was not fetched, or telemetry was disabled → GUI shows source status and what is missing, while preserving any usable episode playback. No silent baseline substitution and no invented reward curve.

## 8. Scope, dependencies and repository hygiene

Target only the GUI repository. Simulator changes are out of scope unless a verified contract defect blocks the reader, in which case stop and report it rather than modifying both repositories ad hoc. Keep package changes minimal and versions recorded by the lockfile. Do not commit outputs, cluster data, model ZIPs, NPZ files, large CSVs, or this local planning/audit material unless the user requests it.

No Git branch, commit, push or PR during implementation/review/testing unless the user gives the Git/PR go-ahead. The commit author and sign-off belong to the human user; no AI attribution in commit or PR text.

Open decision for the user: if they later want configuration editing or SLURM controls in the GUI, that is a separate operations integration with an explicit trust and deployment design. Do not quietly add it to this reader phase.
