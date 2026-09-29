# GUI result reader: implementation audit

Date: 2026-09-19. Local only. No branch, stage, commit, push or PR. Simulator repository untouched.

## Files changed

Created
- `src/lib/resultCatalog.ts`
- `src/lib/experimentIndex.ts`
- `src/lib/comparisonView.ts`
- `src/lib/episodeTelemetry.ts`
- `src/lib/trajectory.ts`
- `src/hooks/useExperimentSession.ts`
- `src/components/ExperimentBrowser.tsx`
- `src/components/ComparisonTable.tsx`
- `src/components/ExperimentStatus.tsx`
- `src/components/EpisodeDetails.tsx`
- `src/components/canvas/TrajectoryLayer.tsx`
- `tests/resultCatalog.test.ts`, `tests/outputsServer.test.ts`, `tests/assembleRuns.test.ts`
- `tests/experimentIndex.test.ts`, `tests/comparisonView.test.ts`, `tests/episodeTelemetry.test.ts`, `tests/trajectory.test.ts`
- `feature-research/p6-gui-integration/interfaces.md`, `feature-research/p6-gui-integration/audit.md`
- Slice audits: `feature-research/p6-gui-integration-s1/audit.md`, `feature-research/p6-gui-integration-s2s3/audit.md`, `feature-research/p6-gui-integration-ui/audit.md`

Modified
- `vite-plugin-outputs.ts`
- `src/lib/assembleRuns.ts`
- `src/components/FileLoader.tsx`
- `src/App.tsx`
- `src/components/canvas/Scene.tsx`
- `src/components/canvas/NetworkCanvas.tsx`
- `src/styles/tokens.ts`
- `README.md`
- `package.json` (only the `test` script; no dependency or lockfile change)

## S0 contract check (both repositories, real root `outputs/bypass-matrix`)

- Versions confirmed: experiment_plan 1, eval_manifest 2, comparison 1, train manifest 4, rl_episode 3, telemetry 1, fetch_manifest 1.
- Identity: row `local-delivery` / training seed 101 / policies model, hold, random_valid / held-out seeds 301–303. Episode seed comes from
  the manifest (`episodes[].seed`) and `basename(episode_dir)`; all manifest paths are absolute host paths and are never dereferenced.
- Node mapping confirmed in C++: `viz-writer.cc` writes loop index `i` over `cfg.nodes`; `rl-bridge.cc` fills `node_ids` from the same
  order. CSV `node_id` i == `contract.node_ids[i]`; sample: `node-b` = index 1, the controlled slot.
- Regression `comparison.json` (p0) has no `comparison_version`; `outputs/missing-check` is an `incomplete` RL comparison.
- Fetch manifest task states are `completed|partial|missing|failed|not_fetched` (the plan lists four; `partial` is shown verbatim).
- No contract discrepancy requiring a simulator change. No fetched root or `cluster/` directory exists locally.

## What changed

- `resultCatalog.ts`: root-relative lazy catalog for FSA handles, `webkitdirectory` FileList and the dev listing; bytes are read only in
  `getFile()`; unsafe paths rejected; 50k entry cap with a `truncated` flag.
- `vite-plugin-outputs.ts`: still GET/HEAD only. Malformed URI → 400; `path.relative` plus realpath containment → 403; regular files
  only; query strings ignored; bounded listing that skips symlinked directories and training rollout episodes; helpers exported for tests.
- `assembleRuns.ts`: `isLegacyRunPath` excludes any path with an `episode-NNNN` segment from grouping and from the eager dev download.
- `experimentIndex.ts`: discovers roots from paths; reads only small manifests; version-checks each artifact; evaluations keyed by
  row + training seed with states ok / incomplete / failed / missing / not_fetched; episodes resolved inside the catalog by declared
  identity; `episodeFiles` materializes one episode for the existing `useSimData.loadFiles`.
- `comparisonView.ts`: passes simulator numbers and intervals through untouched; null interval stays null with its omitted reason;
  paired vs group scope labels; comparability flags; on-demand `episodes.csv`.
- `episodeTelemetry.ts` / `trajectory.ts`: JSONL parsing, decision at-or-before playback time, null step-zero reward, controlled-node
  index mapping, trail extraction, endpoint-preserving decimation.
- UI: experiment list in `FileLoader`; `ExperimentBrowser` (rows, seeds, policies, states, comparison tables, optional training summary,
  episodes table, fetch snapshot); `EpisodeDetails` (identity, status, lazy telemetry); `TrajectoryLayer` with opt-in overlays matched by
  evaluation + held-out seed and a legend. Legacy load path unchanged. README section added.

## Deviations from the plan

1. Test runner is Node's built-in (`node --experimental-strip-types --test`), not a package: installing Vitest fails on a pre-existing
   `@eslint/js@10` vs `eslint@9` peer conflict. Consequence: value imports between tested lib modules carry a `.ts` extension.
2. Legacy isolation excludes `episode-NNNN` paths rather than requiring a `YYYY-MM/DD/HH-MM-SS` shape. A date-only predicate (first
   attempt) dropped the existing `calfex/…` and `p0-*` runs from the legacy list.
3. Plan-less comparison roots are discovered only when `episodes.csv` sits beside `comparison.json`; otherwise ~30 `p0-regression`
   folders appeared as experiments. A regression file opened directly is still identified by the missing `comparison_version`.
4. Two extra small components (`ComparisonTable`, `ExperimentStatus`) and one hook beyond the suggested module list;
   `experimentIndex.ts` (~640 lines, largely types) and `comparisonView.ts` (~320) exceed the size aim.
5. Interval level is shown verbatim (`level 0.95`) rather than as "95%". JSON `1.0` renders as `1` (JS number parsing).
6. README links to the simulator's `scratch/mesh-sim/README.md` and `scripts/rl/ops/README.md`; `scripts/rl/README.md` does not exist.
7. Optional per-decision reward chart not built. Trails render with depth test off so they stay visible behind buildings.
8. Dev auto-discovery is accepted when either legacy runs or experiment roots exist (previously runs only).

## Test results

- Initial implementation: `npm test` 30 pass, 0 fail (includes a real `bypass-matrix` smoke test that skips when the directory is absent).
- `npx tsc --noEmit`: clean. `npm run build`: succeeds (pre-existing chunk-size warning). `npm run lint`: clean.
- Dev server smoke (started and stopped): page and modules 200; `/api/outputs` lists 2795 paths, not truncated, no training rollouts.
- Data-path check against real outputs: 2 rows × training seeds 101/102 × 3 policies, all `ok`; `decisionAt(steps, 1.0)` → `west`
  (index 0) on `node-b`; controlled CSV index `[1]`; 201 trail points.

## Not verified (human verification paths pending)

No browser session was available, so nothing visual or interactive has been exercised: loader and experiment list rendering, comparison
tables against `comparison.json`, episode playback, telemetry panel at two decisions, trail and overlay legend, `missing-check`
incomplete view, legacy run load, and the production preview with a picked folder. The plan's human checklist (§6, items 1–6) is
entirely outstanding apart from build/lint/tests.

## Review follow-up (2026-09-19)

The Reviewer found four blocking cases in the first charter. All four were fixed without changing
the simulator or adding command-running GUI behaviour:

1. Telemetry now matches the saved record to its ending time window using `ticks_in_step` and
   `contract.tick_s`. Sparse saves leave an explicit gap instead of showing a stale action. The
   panel labels action/reward as belonging to that interval and the mask as observed at its end.
2. A cpp-style reward with `total` and `source` but no `components` renders safely.
3. A standalone v2 evaluation with `label: null` gets an explicit “unlabelled evaluation” identity.
   The local real `outputs/one-seed` check found 3 policies and 3 playable episodes.
4. Folder and dev catalogs share the reader filename and training-rollout filters. Folder scans count
   only relevant files toward the limit and warn at the loader if truncated. The legacy FSA walk
   skips episode directories instead of materializing their CSVs.

Focused tests were added for those cases. A real bypass-matrix telemetry check selected decision 1
at t=0.5 and t=1.0, decision 2 at t=1.5, and decision 3 at t=2.5, with the expected ending
windows. The full outputs dev listing contains 2,795 reader files and is not truncated. After the
fixes: `npm test` 34 pass, 0 fail; `npm run lint` and `npm run build` pass using Node 22.17.
The build retains only its chunk-size warning.
The README and local plan now describe saved telemetry-window timing. No browser/human verification
has been done yet; a fresh Reviewer must re-check the diff and then hand off the charter.

## Open risks

- Middleware 405/HEAD/header handling is untested automatically; only the pure helpers are.
- `vite-plugin-outputs.ts` and `tests/` are outside `tsconfig` include and the lint script.
- The fetch snapshot view has only been exercised with a synthetic manifest.
- The dev loader requests `/api/outputs` twice, and a picked folder is walked twice (legacy + catalog).
- Legacy-shaped runs outside `episode-*` (e.g. `p0-*`) are still eagerly downloaded in dev, as before.
- Declared evaluations are located by the standard `eval/<row>/train-seed-<T>` layout; a custom layout shows as `missing`.
- An overlay toggled off mid-read keeps its points until the episode changes. `sim.loadFiles` has no error path (as in legacy).
- Two side panels at narrow widths are untested.
