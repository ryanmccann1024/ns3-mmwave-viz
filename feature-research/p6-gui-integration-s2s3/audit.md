# Audit: S2/S3 pure library modules

## Files changed
- src/lib/experimentIndex.ts (created)
- src/lib/comparisonView.ts (created)
- src/lib/episodeTelemetry.ts (created)
- src/lib/trajectory.ts (created)
- tests/experimentIndex.test.ts (created)
- tests/comparisonView.test.ts (created)
- tests/episodeTelemetry.test.ts (created)
- tests/trajectory.test.ts (created)
- feature-research/p6-gui-integration-s2s3/audit.md (this file)

No other file was created or modified. No git state changes. Simulator repo was only read.

## What changed per file
- experimentIndex.ts: `discoverExperiments` (paths only), `loadExperiment` (plan, comparison, fetch manifest, eval
  manifests; version-checked, per-artifact messages, never throws on bad/missing/unsupported manifests), evaluation
  states ok/incomplete/failed/missing/not_fetched with simulator status strings kept, episodes resolved as
  `<evalDir>/<policy>/<basename(episode_dir)>/seed-<seed>` inside the catalog only, `episodeFiles`, `matchingEpisodes`
  (by seed value), `loadTrainingSummary`, `parseFetchManifest`, `hostBasename`.
- comparisonView.ts: raw comparison types, `checkComparison` (rl / regression / unsupported / invalid),
  `buildComparisonView` (paired + group rows, pass-through numbers, null interval stays null), `formatNumber`,
  `parseEpisodesCsv` (PapaParse, string cells).
- episodeTelemetry.ts: `parseSteps`, `decisionAt` (binary search, 1e-9 epsilon), `slotActions`, `maskBySlot`,
  `rewardState`, `rewardSeries`.
- trajectory.ts: `controlledNodeIndices`, `extractTrails`, `decimate`.

## Deviations from the plan
- experimentIndex.ts (~640 lines after Prettier) and comparisonView.ts (~320) exceed the ~250-line aim; most of it is
  exported types and Prettier's one-field-per-line expansion. Not split because only the listed files were allowed.
- experimentIndex.ts does not value-import `readJson` from resultCatalog.ts; it uses a private reader that turns bad
  JSON into a per-artifact message instead of a throw. Only `import type { ResultCatalog }` is used.
- `discoverExperiments` is synchronous and reads nothing; a regression `comparison.json` directory is still listed as a
  `comparison` root, and `loadExperiment` reports "not an RL policy comparison" for it.
- An eval manifest that is present but unreadable / unsupported version marks its declared evaluation `failed` with
  the version message (the five-state set has no separate "unsupported" state); it is also in `issues` and `artifacts`.
- Paths in `Episode`/`Evaluation` are catalog-relative (they include the root prefix) so they can be passed straight to
  `catalog.getFile`.
- Ran Prettier on my eight files only (not repo-wide).

## Test results
- `node --experimental-strip-types --test tests/experimentIndex.test.ts tests/comparisonView.test.ts tests/episodeTelemetry.test.ts tests/trajectory.test.ts`: 22 pass, 0 fail (includes the real bypass-matrix smoke test, which skips when the directory is absent).
- `npx eslint` on the four src files: clean.
- `npx tsc --noEmit`: clean.

## Open risks
- Declared evaluations are located by layout convention `eval/<label>/train-seed-<T>`; a plan with a custom eval
  layout would show `missing` (manifests found elsewhere under `eval/**` are still indexed by their own identity, with
  a directory-mismatch issue).
- `decisionAt` assumes steps are in time order as written by the simulator.
- `extractTrails` splits on commas without quote handling (positions.csv has no quoted fields).
- Fetch view is verified against a synthetic manifest only; no real fetched root exists locally.
- JSON `1.0` renders as `1` via `formatNumber` (documented in code).
