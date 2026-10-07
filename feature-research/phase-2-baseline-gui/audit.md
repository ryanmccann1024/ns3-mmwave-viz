# Phase 2 — Baseline GUI consumer: implementation audit

Plan: `feature-research/phase-2-baseline-gui/plan.md`. Orchestrator: Fable 5.1 (wrote the shared foundation module, integrated, ran checks). Three Opus 5.5 slices implemented non-overlapping file sets (data layer; experiment index; UI). No git state-changing commands were run. Branch unchanged: `docs/rl-gui-integration`. Nothing staged or committed.

## Files changed

New
- `src/lib/baselineManifest.ts`
- `src/lib/baselineRuns.ts`
- `src/lib/scenarioGroups.ts`
- `src/components/pages/BaselineInfo.tsx`
- `tests/baselineManifest.test.ts`
- `tests/baselineRuns.test.ts`
- `tests/helpers/memoryCatalog.ts`
- `tests/helpers/baselineFixtures.ts`

Modified
- `src/lib/resultCatalog.ts`
- `src/lib/assembleRuns.ts`
- `src/lib/experimentIndex.ts`
- `src/lib/rlLabels.ts`
- `src/styles/tokens.ts`
- `src/hooks/useWorkspace.ts`
- `src/components/pages/shared.tsx`
- `src/components/pages/RunsPage.tsx`
- `src/components/pages/HomePage.tsx`
- `src/components/pages/PlayerPage.tsx`
- `src/components/pages/ExperimentPage.tsx`
- `src/components/EpisodeDetails.tsx`
- `src/App.tsx`
- `CLAUDE.md`
- `tests/assembleRuns.test.ts`
- `tests/resultCatalog.test.ts`
- `tests/outputsServer.test.ts`
- `tests/experimentIndex.test.ts`
- `tests/rlLabels.test.ts`
- `tests/comparisonView.test.ts`

Also present in the working tree but not part of the change: `feature-research/phase-2-baseline-gui/` (pre-existing untracked reports; must stay out of any commit — S7). `vite-plugin-outputs.ts` was verified and not edited.

This list equals the plan's §10 "Files touched" list exactly; no unlisted file was created or modified.

## Per-file changes

### Data layer
- **`src/lib/baselineManifest.ts`** (new, orchestrator) — types and parsers per plan §5: `parseBaselineManifest`, `parseBaselinePlan`, `resolveRef`, `sanitizeLabel`, `sanitizeText`, `numberOrNull`, `compareScenarioIdentity` (+ exported `IdentityCheck` type). Unknown enum strings → `'unknown'` with raw kept; numbers never coerced from strings; `planner_source.aggregate_sha256` and `rf.sha256` mapped; `eval_manifest`, `source_run_config_abs`, `origin`, logs/inputs ignored. `resolveRef` validates the reference and the joined path with `normalizeRelPath` and never prefixes `/`. Field names were checked against a real Phase 1 manifest found in the simulator's local test outputs.
- **`src/lib/resultCatalog.ts`** — only `'baseline_manifest.json'` and `'baseline-plan.json'` added to `READER_FILE_NAMES` (S3).
- **`src/lib/assembleRuns.ts`** — `RunEntry.runDir` (full catalog-relative timestamp dir from the file path) and optional `baseline?: BaselineRunMeta` (type-only import). Keys are `${runDir}[/point]/seed-N` so top-level keys are unchanged and nested copies stay distinct; shared `inputs/` files match by `runDir`. `parseRunsFromFileList` strips the picked folder name like `catalogFromFileList`. `isKnownFile`/`isLegacyRunPath` unchanged; manifests are never fetched as CSVs.
- **`src/lib/baselineRuns.ts`** (new) — `discoverBaselineRuns` (catalog-driven; rejects `episode-*` segments, `<method>/baseline/` dirs, and `mode:'evaluation'`; per-manifest errors → `manifestError`, thrown messages not surfaced), `attachBaselineMeta` (joins on `runDir`, skips point runs, shallow-copies, preserves length/order/keys), `unmatchedSeedRecords`, `BASELINE_MANIFEST_PATH_RE`.
- **`src/lib/scenarioGroups.ts`** (new) — pure `groupRuns` / `groupScenarios` / `unplayableForBatch` and `Scenario` (gains `runDir`, optional `baseline`, permits `runs: []`). Date groups with only unplayable baselines are kept; unplayable scenarios merge newest-first; a baseline whose run has playable seeds is not emitted twice.
- **`src/lib/rlLabels.ts`** — `geometric`/`optimization` policy labels; `objectiveLabel`; `baselineStatusLabel` (own-property lookups).
- **`src/styles/tokens.ts`** — `TRAIL_COLORS.geometric = '#0d9488'`, `TRAIL_COLORS.optimization = '#ca8a04'`.
- **`src/hooks/useWorkspace.ts`** — `baselineRuns`, `unplayableBaselines`, `baselineDiscoveryError` state; a source token ref drops stale async results; all three sources reconcile via `discoverBaselineRuns` + `attachBaselineMeta`; dev-server startup accepts a catalog with playable runs, experiment roots, or baseline manifests (D16); catalog-wide failure → generic nonfatal warning; `forgetFolder` clears all baseline state.
- **`src/lib/experimentIndex.ts`** — `EvalBaselineInfo` + `Evaluation.baselines` (`{}` for legacy). Per policy block with a plain-object `baseline`: resolve `manifest`/`plan` from `evalDir` (`'unresolvable reference'` / `'not in catalog'` / parse reason / `'unreadable'`), read only the referenced manifest, `plannerWallS` from it, `sourceIdentityCheck` only against `sourceScenarioIdentity` when both sides exist (D14). `POLICY_ORDER` extended (D15). Discovery markers unchanged.

### UI
- **`src/components/pages/BaselineInfo.tsx`** (new) — `BaselineBadges` (method accent / objective neutral / status good|bad|neutral; "manifest unreadable" tag keeps method/objective when present), `BaselineSetupLine` (omits missing values; null when both missing; never renders 0 for null), `BaselineProvenance` (collapsed `Disclosure`, all §7-10 rows with `unknown` for nulls, hashes shortened to 12 chars with full value in `title`, bounded labelled diagnostic lines, source-identity check with a warning only on a source mismatch, plan-only original→planned SVG preview with zero-span padding and nonfinite-point skipping, captioned as setup not movement).
- **`src/components/pages/shared.tsx`** — re-exports grouping from `scenarioGroups`; `Tag` gains `bad` tone; `ScenarioRow` renders badges/setup line/unmatched-seed tags for playable baseline scenarios and a separate button-less, click-less `UnplayableScenarioRow` (title, badges, truncated error, "No playable telemetry") for `runs: []` (F3).
- **`src/components/pages/RunsPage.tsx`, `HomePage.tsx`** — groups built once from `runs` + `unplayableBaselines` (`groupRuns` then `unplayableForBatch` per batch); filter matches unplayable baselines; subtitle/empty state/tile counts stay accurate with zero playable runs; amber nonfatal note for `baselineDiscoveryError`.
- **`src/App.tsx`, `src/components/pages/PlayerPage.tsx`** — optional `baseline: { meta, catalog }` prop passed for `playing.kind === 'run'` with `run.baseline`; header shows `Baseline · Method · Objective` + setup line; plan loaded lazily via the catalog (`loading` → plan | `unavailable`) and shown in a collapsed provenance disclosure. RL header: "model trained with seed N" only for `policy === 'model'`; other policies show "evaluation group training seed N" or nothing; policies with an eval baseline block show the baseline identity.
- **`src/components/pages/ExperimentPage.tsx`** — compact badges + setup line in Leaderboard tiles for baseline policies; per-policy collapsed provenance in evaluation details; source-mismatch `Note` only when a key is `mismatch`.
- **`src/components/EpisodeDetails.tsx`** — identity row relabelled "Evaluation group training seed" for baseline policies plus a placement-policy explanation; decisions/rewards/telemetry left visible; no "duration/physics/warmup match" wording.
- **`CLAUDE.md`** — one Data Format line for standalone baseline runs.

### Tests
- New `tests/baselineManifest.test.ts` (13 plan cases), `tests/baselineRuns.test.ts` (12 plan cases incl. the real three-source catalog test with a no-CSV-read spy, plus grouping cases), helpers `memoryCatalog.ts` / `baselineFixtures.ts`.
- Extended `assembleRuns`, `resultCatalog`, `outputsServer`, `experimentIndex`, `rlLabels`, `comparisonView` tests per §8; all prior assertions retained.

## Test results (Node v22.17.0)

| Check | Result |
|---|---|
| `npm test` | PASS — 106 tests, 105 pass, 0 fail, 1 skip (pre-existing `smoke: real bypass-matrix root`, real-root absent) |
| `npm run build` (`tsc && vite build`) | PASS — typecheck clean; only the pre-existing >500 kB chunk-size warning |
| `npm run lint` (`eslint src`) | PASS — clean |
| Manual real-output exit gate (§11) | **NOT PASSED / no evidence** — no dated `outputs/YYYY-MM/DD/HH-MM-SS-baseline` run exists on this machine (the simulator's `phase-1-local-check/{real,pure}-baseline` folders contain only pytest fixture dirs). No dev server or browser was run (not authorized for this stage). |

## Deviations from the plan (and why)

1. `baselineManifest.ts` exports an extra `sanitizeText` (longer cap for errors/ids/hashes) and `IdentityCheck` type alias; `sanitizeLabel` still caps at 32 as specified. Manifest `error` is capped at 512 chars in the parser and truncated further (120/300 chars) at render.
2. `Scenario` gained a `runDir` field (needed for full-path identity and de-duplication in `groupScenarios`); playable scenario keys are now `${runDir}/${point ?? ''}` rather than `${batch}/${time}/${point}` (identical for top-level runs; distinct for nested copies).
3. `groupRuns` keeps its `[string, RunEntry[]][]` return shape and exposes `unplayableForBatch` so pages pass only a batch's baselines to `groupScenarios` (plan §7-9 intent, different helper shape).
4. `experimentIndex.ts` treats an empty `scenario_identity: {}` (no hashes at all) as absent → `sourceIdentityCheck: null` rather than four `unknown`s; a `getFile` null after `has()` true reports `'not in catalog'`.
5. `BaselineProvenance` takes optional `manifestError` and `title` props (needed by the standalone player and to distinguish several policies' disclosures in one evaluation).
6. `useWorkspace`: FSA path now applies runs only after the catalog walk and baseline discovery finish (avoids a brief flash of runs without badges); `beginSource` also resets `loadingDir` to prevent a stuck spinner when a folder is forgotten mid-load.
7. `parseRunsFromFileList` now also accepts `File[]` (test convenience; production call site unchanged).
8. Experiment fixtures for the eval-baseline tests are inline in `tests/experimentIndex.test.ts` (its owner did not share the helper files), consistent with S6.

## Open risks

- **Manual exit gate not exercised.** Unplayable-row layout, badge wrapping in Leaderboard tiles, the SVG plan preview, and the three loading paths against a real Phase 1 output tree remain unverified in a browser.
- `shared.tsx` ↔ `BaselineInfo.tsx` import each other (`Tag` one way, badges the other). Both are used only at render time, so ESM/Vite resolve it; React Fast Refresh may full-reload on edits to either.
- Dev-server startup accepts a folder whose only baseline manifest is unreadable (it still counts as a discovered baseline), so it will not fall through to a cached FSA handle in that case.
- Newest-first merge of unplayable scenarios sorts by `batch/name`; ordering among nested-prefix copies with identical dates is approximate.
- Classic picker: selecting the `YYYY-MM` folder itself (rather than its parent) no longer yields runs because its name is stripped — now consistent with FSA/catalog behaviour and plan §12.
- `tsconfig` covers `src` only; test files are executed but not typechecked by `npm run build`.
- Phase 1 PR #15 CI/merge status remains unverified (plan D17/§11); the GUI PR base/stack decision is deferred to the human and the Git-PR stage.

## Reviewer-blocker repair (2026-09-30, Codex)

The independent review returned **fix first** for one producer-contract mismatch. This addendum records the repair without changing the original Implementer audit above. The other reviewer observations were non-blocking and were not silently folded into this narrow fix.

Files changed for this repair (already present in the audit's Files changed list):
- `src/lib/experimentIndex.ts` — read the flat `policies[name].baseline.planner_source_sha256` and `rf_config_sha256` fields emitted by Phase 1, not nonexistent nested `planner_source`/`rf` objects.
- `tests/experimentIndex.test.ts` — make `baselineBlock()` match the producer's flat schema and assert both hashes remain available when the referenced `baseline_manifest.json` is absent.

Checks run with Node v22.17.0:
- `node --experimental-strip-types --test tests/experimentIndex.test.ts`: PASS, 21 passed, 1 pre-existing skip.
- `npm test`: PASS, 105 passed, 1 pre-existing skip.
- `tsc --noEmit`: PASS.
- `npm run lint`: PASS.

`npm run build` was not repeated for this narrow repair; the earlier Implementer build remains the only full-bundle evidence. The manual real-output/browser exit gate, Phase 1 PR #15 state, and GUI PR base remain unverified. Request a fresh independent review before writing the Tester charter.
