# Phase 2 — Baseline GUI consumer: implementation plan

Status: reviewed/corrected for implementation planning; awaiting human approval. No Phase 2 source code has been implemented, committed, or branched.

Inputs: approved Phase 2 brief + condensed Scout findings (supplied as text). No repository source was inspected by the Planner. Where this plan names a file the Implementer must confirm the exact path exists before editing; if a named file does not exist, stop and report rather than creating a parallel one.

---

## 1. Objective and user-visible outcome

**Objective.** Make Phase 1 baseline outputs (standalone `HH-MM-SS-baseline[-N]` runs and `geometric` / `optimization` evaluation policies) visible in the existing Runs, Home, experiment, comparison, and playback views with correct method/objective/status identity, measured timing/displacement, and collapsed provenance — without new pages, new statistics, or fabricated RL data.

**User-visible outcome.**

- Runs and Home: a baseline run whose `seed-N/` telemetry exists appears as the same playable seed entry, enriched with compact `Geometric` / `Coverage` / `Complete`-style badges and a one-line setup summary (`initial displacement 12.3 m (setup) · planner 4.2 s (wall)`). A baseline run that failed or was interrupted before producing telemetry appears as a non-clickable status row with a `Failed` / `Interrupted` badge and a concise error; there is no invented seed button.
- Player: opening a baseline seed shows `Baseline · Geometric · Coverage` identity, never "model trained with seed none", and a collapsed `Baseline provenance` disclosure.
- Experiment/comparison: `geometric` and `optimization` policies get proper labels and two distinct trail colours; episode details distinguish placement setup from genuine evaluation decisions/rewards, which remain visible when actually recorded; saved comparison statistics render unchanged.
- Legacy runs, legacy evals (no `policies[name].baseline`), and comparison v1 files behave exactly as before.

---

## 2. Current behaviour (from Scout)

- **Catalog.** `src/lib/resultCatalog.ts` — `ResultCatalog {name, truncated?, paths(), has(path), getFile(path)}`; relative paths only; `normalizeRelPath` rejects absolute, drive-letter, backslash, NUL, `..`. Three constructors: `catalogFromFileList` (classic picker), `catalogFromDirectoryHandle` (FSA), `catalogFromDevServer` (`GET /api/outputs`, lazy `GET /outputs/<encoded rel path>`). `isCatalogFile` / `READER_FILE_NAMES` exclude `baseline_manifest.json` and `baseline-plan.json`. `vite-plugin-outputs.ts` filters its bounded listing through `isCatalogFile` and rejects path/symlink escape.
- **Runs loader.** `src/lib/assembleRuns.ts` — `RunEntry {yearMonth, day, time, seed, point?, key, linksFile, posFile, optional …}`; both CSVs required. Groups `YYYY-MM/DD/time[/point]/seed-N/file`. `isLegacyRunPath`, `fetchRunsFromDevServer` (returns `null` with no matches), `parseRunsFromFileList`, `walkDirectory` (FSA, materialises only `isKnownFile`). `isKnownFile` excludes baseline manifests.
- **Workspace.** `src/hooks/useWorkspace.ts` — `runs`, `catalog`, `experimentRoots`. Dev-server startup accepts results only if playable runs or experiment roots exist; a manifest-only folder falls through.
- **Pages.** `src/components/pages/shared.tsx` — `groupRuns`, `groupScenarios`, `ScenarioRow {scenario, onOpen(run), showBatch?}` renders one button per playable seed; used by `RunsPage` and `HomePage`; `App.tsx` routes `onOpenRun` to the player. `Tag` tones: neutral/accent/good. `ui/Badge {label,colorClass}`, `ui/Disclosure` collapsed.
- **Evaluation.** `src/lib/experimentIndex.ts` — `SUPPORTED_VERSIONS.evalManifest = 2`; `Evaluation {trainingSeed, evalDir, state, contract, metricSource, policySummaries, policies, episodes}`; `loadExperiment` ignores `policies[name].baseline`; supports `training: null`. Episodes keep genuine status/metrics/playable/message; playback uses relative layout from `episode_dir` basename. Known-policy ordering: model, hold, random_valid first. `src/lib/comparisonView.ts` accepts comparison v1, baseline as free string, no recomputation.
- **Labels/colours.** `src/lib/rlLabels.ts` labels model/hold/random_valid, raw fallback otherwise. `src/styles/tokens.ts` `TRAIL_COLORS`: model `#2563eb`, hold `#ea580c`, random_valid `#c026d3`, fallback `#475569` via `trailColor` helper.
- **PlayerPage** says "model trained with seed none" for baseline episodes. **EpisodeDetails** shows RL identity/decision fields.
- **Tests.** `npm test` = `node --experimental-strip-types --test tests/*.test.ts` (Node runner, not Vitest). Existing: `tests/assembleRuns.test.ts`, `resultCatalog.test.ts`, `outputsServer.test.ts`, `experimentIndex.test.ts`, `rlLabels.test.ts`, `comparisonView.test.ts`.
- **Git.** GUI branch `docs/rl-gui-integration` @ `da925e8`, clean except untracked `feature-research/phase-2-baseline-gui/`. Phase 1 PR #15 (`feat/mesh-sim-baseline-adapter-phase1`, `6247a0d0`) CI/merge into `develop` **unverified**.

---

## 3. Producer contract consumed (Phase 1, authoritative)

- Standalone run root: `outputs/YYYY-MM/DD/HH-MM-SS-baseline[-N]/`. Single `baseline_manifest.json` at the run root. Plan at `effective-inputs/baseline-plan.json`. Telemetry at `seed-N/{links.csv,positions.csv,…,summary.json}`. Run root may also hold `planner.log`, `sim.log`, `source-inputs/`, `effective-inputs/`. A preparation failure may leave only the manifest.
- `baseline_manifest_version: 1`. Fields as listed in the brief (`run_id`, `mode`, `requested_algorithm`, `method`, `objective`, `application`, `executor`, `started_at`, `ended_at`, `status`, `error`, `planner_seed`/`_status`, `max_iterations`/`_status`, `planner_source`, `rf`, `source_scenario_identity`, `effective_scenario_identity`, `package_versions`, `mapping_sha256`, `sim_binary_sha256`, `source_run_config_abs`, `fingerprint`, `origin`, `ground_datum`, `waypoint_policy`, `geofence`, `simulation_seeds`, `initial_displacement_m_total`, `planner_wall_s`, `plan`, `planner_log`, `sim_log`, `source_inputs`, `effective_inputs`, `eval_manifest`, `seeds[] {seed, status: complete|missing|failed, summary}`).
- `baseline_plan_version: 1` with `method`, `objective`, `nodes[] {id, roster_index, slot, role, platform, radios, selected, original{x,y,z}, planned{x,y,z}, displacement_m}`, `initial_displacement_m_total`, `planner_predictions`.
- Eval: `eval_manifest.json` stays v2; optional `policies[method].baseline` block whose `manifest` and `plan` are relative to the **evaluation root** (`geometric/baseline/baseline_manifest.json`). `planner_wall_s` is only in the referenced baseline manifest. `comparison.json` stays v1.

---

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Baseline **manifest** discovery is catalog-driven. Add `baseline_manifest.json` and `baseline-plan.json` to `READER_FILE_NAMES`; discover manifests via `catalog.paths()`. Keep the separate Runs loader for playable CSV pairs and reconcile afterward. | One manifest-reading path serves dev server, FSA, and classic picker. No eager manifest download through `isKnownFile` and no episode/CSV download for metadata. |
| D2 | Join key is the **full normalized catalog-relative run directory**, ending in `YYYY-MM/DD/<dirname>`, with optional leading directories. Add `runDir` to `RunEntry`, derived from its file path, and strip the picked-folder prefix in the classic loader so all three sources use the same coordinate system. Discover standalone manifests only where the parent directory has this dated suffix and is not under an experiment `episode-*` or `<method>/baseline/` subtree. | Preserves relocated/nested output folders and avoids conflating two nested runs with the same date/time. No invented ID. Selecting the single run directory itself (without dated parents) is outside the existing Runs loader contract and is not claimed as supported by this phase. |
| D3 | Playable baseline seeds are the **existing `RunEntry` objects** with a new optional `baseline` field attached. No new entries are emitted for them. | No duplicates; the existing CSV playback handoff remains unchanged, though Player receives additional display metadata. |
| D4 | A baseline with **zero** matched `RunEntry` becomes an *unplayable scenario*: `groupScenarios` emits a scenario with `runs: []` and `baseline` set. `ScenarioRow` renders it without buttons and without `onOpen`. | Explicit non-playable representation; no fake seed; no clickable playback. Same component on Runs and Home. |
| D5 | Manifests with `mode: "evaluation"` are excluded from Runs/Home regardless of path; evaluation-owned baseline directories are also excluded structurally from standalone discovery. | They belong to evaluation views; showing them as runs would duplicate eval episodes. |
| D6 | `resolveRef(root, ref)` validates `ref` independently with `normalizeRelPath`; it then joins to a validated `root` using `root ? root + '/' + ref : ref`, and validates the joined catalog path. It never prepends `/` for a catalog-root reference. `eval_manifest`, `source_run_config_abs`, `origin`, `planner_log`, `sim_log`, `source_inputs`, `effective_inputs` are not dereferenced. | Never dereference upward or absolute host paths; root-relative catalog references still work. |
| D7 | `baseline-plan.json` is parsed but **not loaded at discovery**. It is loaded lazily when an enriched standalone seed is opened, using the catalog passed from `App` to `PlayerPage`. Show a compact plan-derived original→planned **pre-run** placement preview (selected nodes only, labelled by plan `id`) and count/total displacement; it is explicitly a setup preview, not a replay frame, movement trajectory, or plan↔CSV index join. If the plan is missing/unsafe/invalid, show the manifest numbers and an unavailable preview, leaving playback intact. | Meets the brief's small placement-marker intent without inventing observed motion or assuming roster-index alignment. |
| D8 | `summary.json` is **not parsed** in Phase 2 (schema not supplied; standalone-window metrics must not be mixed with eval-window metrics). Seed status comes from `manifest.seeds[]`. | Brief: do not silently combine differing metric windows; existing CSV charts already show measured results. |
| D9 | Missing numeric values are `null` end-to-end and render as `unknown` in details or are **omitted** from the compact row line. Zero is never substituted. | Brief invariant. |
| D10 | Status/method/objective strings outside the known enums are preserved raw (trimmed, max 32 chars, non-printables stripped) and rendered with neutral tone; parsing never throws on them. | Forward compatibility. |
| D11 | `Tag` gains a `bad` tone (red) for `failed` / `interrupted`. Existing tones unchanged. | Reuses existing primitive; consistent with pages. |
| D12 | Trail colours: `geometric` `#0d9488` (teal-600), `optimization` `#ca8a04` (yellow-600). | Distinct from blue/orange/fuchsia/slate; same Tailwind-600 weight as existing entries. |
| D13 | `Evaluation` gains `baselines: Record<string, EvalBaselineInfo>`; legacy evals produce `{}`. `loadExperiment` reads the referenced baseline manifest (for `planner_wall_s` and provenance) only if the resolved path exists in the catalog; failures set `manifestError`, never throw. | Legacy unchanged; safe resolution from eval root. |
| D14 | To check that policies started from the same **source scenario**, compare same-named hashes in eval `scenario_identity` with the referenced baseline manifest's `source_scenario_identity`, never with its *effective* scenario identity: changed node/run.ini hashes are expected after placement. Per key: `match` / `mismatch` / `unknown`. A source mismatch is a warning; effective hashes are provenance for the deliberately prepared layout, not an automatic incompatibility warning. Do not claim duration/physics/warmup equality without corresponding evidence. | Avoids mislabelling the algorithm's intended placement as a scenario error. |
| D15 | Known-policy display order becomes `model, hold, random_valid, geometric, optimization`, then unknowns as today. | Deterministic, minimal. |
| D16 | **Dev-server auto-discovery** accepts the catalog if playable runs, experiment roots, or standalone baseline manifests exist. Explicit FSA/classic folder selection already accepts the chosen folder; both must populate the same reconciled state. | Manifest-only failures are discoverable without an unnecessary cached-folder fallback. |
| D17 | Implementer makes no branch, commit, push, or PR changes. The Git-PR stage must resolve the GUI repository's current stack/base with the human before opening a PR; `docs/rl-gui-integration` is the current checkout, and the locally visible GUI refs include `main` but no `develop`. The simulator's Phase 1 PR #15 is a separate repository dependency and must pass CI/land in its intended `develop` before this GUI consumer merges. | The original `target main` plus a branch from the docs stack was not verified as the desired GUI PR topology. Do not silently choose a base. |

---

## 5. Data types (exact)

### `src/lib/baselineManifest.ts` (new)

```ts
export const SUPPORTED_BASELINE_MANIFEST_VERSION = 1;
export const SUPPORTED_BASELINE_PLAN_VERSION = 1;

export type BaselineStatus =
  | 'preparing' | 'prepared' | 'running' | 'complete' | 'failed' | 'interrupted';
export type BaselineSeedStatus = 'complete' | 'missing' | 'failed';
export type BaselineMode = 'standalone' | 'evaluation';

export interface ScenarioIdentity {
  runIniSha256: string | null;
  nodesJsonSha256: string | null;
  buildingsJsonSha256: string | null;
  jammersJsonSha256: string | null;
}

export interface BaselineSeedRecord {
  seed: number;
  status: BaselineSeedStatus | 'unknown';
  rawStatus: string | null;
  summaryRef: string | null;   // validated run-relative path or null; never dereferenced in Phase 2
}

export interface BaselineManifest {
  version: 1;
  runId: string | null;
  mode: BaselineMode | 'unknown';
  requestedAlgorithm: string | null;
  method: string | null;          // raw, sanitized
  objective: string | null;       // raw, sanitized
  application: string | null;
  executor: string | null;
  startedAt: string | null;
  endedAt: string | null;
  status: BaselineStatus | 'unknown';
  rawStatus: string | null;
  error: string | null;
  plannerSeed: number | null;
  plannerSeedStatus: string | null;
  maxIterations: number | null;
  maxIterationsStatus: string | null;
  fingerprint: string | null;
  mappingSha256: string | null;
  simBinarySha256: string | null;
  plannerSourceSha256: string | null;   // from planner_source.aggregate_sha256, else null
  rfConfigSha256: string | null;        // from rf.sha256 if object has string sha256, else null
  sourceScenarioIdentity: ScenarioIdentity | null;
  effectiveScenarioIdentity: ScenarioIdentity | null;
  packageVersions: Record<string, string>;   // only string-valued entries kept
  simulationSeeds: number[] | null;
  initialDisplacementMTotal: number | null;
  plannerWallS: number | null;
  planRef: string | null;         // validated run-relative path (e.g. "effective-inputs/baseline-plan.json") or null
  seeds: BaselineSeedRecord[];
}

export interface BaselinePlanNode {
  id: string;
  rosterIndex: number | null;
  slot: number | null;
  role: string | null;
  platform: string | null;
  selected: boolean;
  original: { x: number; y: number; z: number } | null;
  planned:  { x: number; y: number; z: number } | null;
  displacementM: number | null;
}

export interface BaselinePlan {
  version: 1;
  method: string | null;
  objective: string | null;
  nodes: BaselinePlanNode[];
  initialDisplacementMTotal: number | null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function parseBaselineManifest(text: string): ParseResult<BaselineManifest>;
export function parseBaselinePlan(text: string): ParseResult<BaselinePlan>;
export function resolveRef(root: string, ref: unknown): string | null;
export function sanitizeLabel(v: unknown): string | null;   // string → trim, strip control chars, max 32; else null
export function numberOrNull(v: unknown): number | null;    // finite number → v; else null (strings are NOT coerced)
export function compareScenarioIdentity(a: ScenarioIdentity | null, b: ScenarioIdentity | null):
  Record<keyof ScenarioIdentity, 'match' | 'mismatch' | 'unknown'>;
```

Parser rules:
- Non-JSON or non-object → `{ok:false, reason:'invalid JSON'}` / `'not an object'`.
- `baseline_manifest_version !== 1` → `{ok:false, reason:'unsupported baseline_manifest_version: <v>'}`.
- `status` in enum → typed; otherwise `'unknown'` with `rawStatus`. Same pattern for `mode`, seed `status`.
- `seeds` not an array → `[]`; entries without finite `seed` number are dropped.
- `plan` → `resolveRef('', plan)` must be non-null to keep as `planRef` (root joined later by caller); reject otherwise.
- `source_scenario_identity` and `effective_scenario_identity` → objects with string values for the four hash keys; missing keys → `null`; non-objects → `null`. The producer also records a `run_config` path; it is not a hash and is not compared.
- `planner_predictions`, `radios`, `geofence`, `origin`, `ground_datum`, `waypoint_policy`, `eval_manifest`, `source_run_config_abs`, log/input refs: **ignored**.
- Plan: `baseline_plan_version !== 1` → error; `nodes` non-array → error; node without string `id` → dropped.

### `src/lib/baselineRuns.ts` (new)

```ts
import type { ResultCatalog } from './resultCatalog';
import type { RunEntry } from './assembleRuns';
import type { BaselineManifest, BaselineSeedRecord } from './baselineManifest';

export interface BaselineRun {
  runDir: string;          // full catalog-relative path ending "YYYY-MM/DD/<dirname>"
  yearMonth: string;
  day: string;
  time: string;            // full <dirname>, e.g. "12-00-00-baseline-2"
  manifestPath: string;    // runDir + "/baseline_manifest.json"
  manifest: BaselineManifest | null;
  manifestError: string | null;
  planPath: string | null; // resolveRef(runDir, manifest.planRef) or null
}

export interface BaselineRunMeta {
  runDir: string;
  manifest: BaselineManifest | null;
  manifestError: string | null;
  planPath: string | null;
  seedRecord: BaselineSeedRecord | null;   // manifest.seeds entry matching this RunEntry.seed, if any
}

export const BASELINE_MANIFEST_PATH_RE = /^(?:.*\/)?(\d{4}-\d{2})\/(\d{2})\/([^/]+)\/baseline_manifest\.json$/;

export function discoverBaselineRuns(catalog: ResultCatalog): Promise<BaselineRun[]>;
// - filters catalog.paths() by the dated run-directory suffix, retaining the FULL parent path as runDir
// - excludes episode-* and known evaluation-baseline subtrees, not arbitrary extra nesting above YYYY-MM
// - getFile → text → parseBaselineManifest; per-file errors captured into manifestError
// - excludes manifest.mode === 'evaluation'
// - sorted by runDir; an unexpected catalog-wide failure propagates to useWorkspace for a visible warning

export function attachBaselineMeta(runs: RunEntry[], baselines: BaselineRun[]):
  { runs: RunEntry[]; unplayable: BaselineRun[] };
// - join against RunEntry.runDir, not a reconstructed three-segment suffix; point runs do not match
// - matched entries are shallow-copied with baseline: BaselineRunMeta; unmatched runs untouched
// - unplayable = baselines with no matched RunEntry
// - result.runs.length === runs.length always (no additions, no removals)

export function unmatchedSeedRecords(baseline: BaselineRun, playableSeeds: number[]): BaselineSeedRecord[];
```

### `src/lib/assembleRuns.ts` (modify)

```ts
export interface RunEntry {
  /* existing fields unchanged */
  runDir: string;             // full normalized catalog-relative timestamp directory
  baseline?: BaselineRunMeta;
}
```
Type-only import from `./baselineRuns` (no runtime import to avoid cycles; `baselineRuns.ts` imports `RunEntry` as type only).

### `src/lib/experimentIndex.ts` (modify)

```ts
export interface EvalBaselineInfo {
  method: string | null;
  requestedAlgorithm: string | null;
  objective: string | null;
  executor: string | null;
  plannerSeed: number | null;
  maxIterations: number | null;
  fingerprint: string | null;
  initialDisplacementMTotal: number | null;
  effectiveScenarioIdentity: ScenarioIdentity | null;
  plannerSourceSha256: string | null;
  rfConfigSha256: string | null;
  mappingSha256: string | null;
  manifestPath: string | null;   // resolveRef(evalDir, block.manifest)
  planPath: string | null;       // resolveRef(evalDir, block.plan)
  manifest: BaselineManifest | null;     // loaded when manifestPath && catalog.has(manifestPath)
  manifestError: string | null;          // 'unresolvable reference' | 'not in catalog' | parse reason
  plannerWallS: number | null;           // manifest?.plannerWallS ?? null
  sourceIdentityCheck: ReturnType<typeof compareScenarioIdentity> | null;
  // null unless both eval scenario_identity and referenced manifest source_scenario_identity exist
}

export interface Evaluation { /* existing */ baselines: Record<string, EvalBaselineInfo>; }
```

### `src/lib/scenarioGroups.ts` and `src/components/pages/shared.tsx` (new pure grouping module, existing component modified)

- Move `groupRuns` / `groupScenarios` and the `Scenario` type to importable plain `.ts` module; `shared.tsx` re-exports them for existing callers. A scenario gains `baseline?: BaselineRun` and permits `runs: []`. Date/time/title for an unplayable scenario come from `BaselineRun.{yearMonth,day,time}`; key = full `runDir` (plus point suffix for point runs).
- `groupRuns(runs: RunEntry[], unplayable: BaselineRun[] = [])` includes dates with manifest-only failures. `groupScenarios(runs: RunEntry[], unplayable: BaselineRun[] = [])` reconciles by full `runDir` so a run with playable seeds gets badges but no extra scenario. The caller passes only that date group's unplayable baselines, never the entire list to every batch.
- `Tag` tone union: `'neutral' | 'accent' | 'good' | 'bad'`.

### `src/components/pages/BaselineInfo.tsx` (new)

```ts
export function BaselineBadges(props: {
  method: string | null; objective: string | null; status: BaselineStatus | 'unknown' | null;
  manifestError?: string | null; compact?: boolean;
}): JSX.Element;
// method (accent), objective (neutral), status (good/bad/neutral); a bad reference does not erase
// method/objective already present in an eval_manifest baseline block.

export function BaselineSetupLine(props: {
  initialDisplacementMTotal: number | null; plannerWallS: number | null;
}): JSX.Element | null;
// "initial displacement {x} m (setup) · planner {y} s (wall)"; omit missing items; null if both missing

export function BaselineProvenance(props: {
  manifest: BaselineManifest | null; evalInfo?: EvalBaselineInfo | null;
  plan?: BaselinePlan | 'unavailable' | 'loading';
  sourceIdentityCheck?: Record<string, 'match'|'mismatch'|'unknown'> | null;
}): JSX.Element;
// Disclosure, collapsed by default, title "Baseline provenance"
// When plan exists, also show a compact original→planned setup preview derived solely from plan coordinates/IDs.
```

---

## 6. Invariants

**Data**
- I1. `attachBaselineMeta` preserves `runs.length`, order, and every existing field; only adds `baseline`. The loader's new `runDir`/full-path key keeps two nested runs with the same dated suffix distinct, while existing top-level keys remain unchanged.
- I2. Every numeric field is `null` when absent, non-finite, or non-number. Strings are never coerced to numbers.
- I3. Unknown enum strings are preserved raw (sanitized) and never mapped to a known value.
- I4. A `RunEntry` is playable iff both CSVs exist — unchanged. Manifest `seeds[].status === 'complete'` does **not** create a playable entry.
- I5. Manifest `mode === 'evaluation'` never appears in Runs/Home.
- I6. `baseline-plan.json` nodes are never matched to CSV rows by index in Phase 2. The setup preview uses plan `id` and original/planned coordinates only, is labelled as preparation, and never appears as simulated movement. Any future plan↔CSV join must verify stable node identity.
- I7. Standalone `summary.json` is not read; eval-window metrics and standalone metrics are never combined.
- I8. Legacy `Evaluation` objects gain `baselines: {}`; all prior fields and behavior remain unchanged.
- I10. Source-scenario hash mismatches, not deliberate effective-layout changes, are the only input-identity warnings. Missing source provenance is unknown, not a match.
- I9. Comparison v1 parsing and rendering are unchanged; baseline remains a free string.

**Security**
- S1. Every path reference from any manifest passes `normalizeRelPath` as a *relative* string before joining, and the joined result passes `normalizeRelPath` again. `..`, absolute, drive, backslash, NUL → rejected → `null`.
- S2. `eval_manifest`, `source_run_config_abs`, `episode_dir` (absolute) are never resolved, stored as paths, or fetched. Existing `episode_dir` basename logic is untouched.
- S3. The only server-side change is two filenames added to `READER_FILE_NAMES`; the bounded listing, escape checks, and symlink checks are untouched.
- S4. New baseline reads use only catalog `getFile`; existing legacy CSV loading may continue through its bounded dev-server `/outputs/` route. No arbitrary URL fetches.
- S5. Rendered strings from manifests (`error`, `method`, etc.) are React text nodes only (auto-escaped). Keep row errors concise; do not put unredacted full errors in a tooltip because they may contain absolute local paths. The disclosure may show a bounded, visibly labelled diagnostic without turning it into a path or link.
- S6. No datasets, output bundles, logs, configs, weights, or screenshots are added to the repo; test fixtures are inline synthetic literals.
- S7. `feature-research/phase-2-baseline-gui/` is currently untracked and is **not** covered by this repository's `.gitignore`; the later Git-PR stage must explicitly exclude the working reports and inspect exact staged paths/content. No broad `git add .`.

**Failure**
- F1. Per-manifest failures become `manifestError` without losing other manifests. A catalog-wide failure is a visible nonfatal workspace warning rather than a silent empty result.
- F2. Eval baseline block failures (unresolvable ref, missing file, parse error) → `manifestError`, evaluation still loads.
- F3. An unplayable scenario row has no click handler and no `onOpen` invocation path.
- F4. A baseline run with `manifest === null` but playable seeds still plays normally, showing "manifest unreadable".
- F5. Catalog `truncated === true` continues to show the existing truncation warning; missing manifests due to truncation are not special-cased.

---

## 7. Implementation steps (in order)

1. **`src/lib/resultCatalog.ts`** — add `'baseline_manifest.json'` and `'baseline-plan.json'` to `READER_FILE_NAMES`. No other change. (Server listing picks this up through `isCatalogFile`; verify `vite-plugin-outputs.ts` needs no edit.)

2. **`src/lib/baselineManifest.ts`** — create types, `parseBaselineManifest`, `parseBaselinePlan`, `resolveRef`, `sanitizeLabel`, `numberOrNull`, `compareScenarioIdentity` per §5. Reuse `normalizeRelPath` from `resultCatalog.ts` inside `resolveRef`.

3. **`src/lib/assembleRuns.ts`** — add `runDir` (full catalog-relative timestamp directory) and optional `baseline` to `RunEntry`. The existing `isLegacyRunPath` already accepts `HH-MM-SS-baseline[-N]`; do not add a speculative time regex. Derive `runDir` from the original file path, not reconstructed year/day/time; use it in grouping/shared-input keys so nested runs do not collide, while keeping ordinary top-level keys stable. In `parseRunsFromFileList`, strip the selected folder's own prefix, matching `catalogFromFileList`. Do not add baseline manifests to `isKnownFile` or eagerly fetch them as CSVs.

4. **`src/lib/baselineRuns.ts`** — create `discoverBaselineRuns`, `attachBaselineMeta`, `unmatchedSeedRecords`, `BASELINE_MANIFEST_PATH_RE` per §5.

5. **`src/hooks/useWorkspace.ts`** — add `baselineRuns`, `unplayableBaselines`, and a nonfatal `baselineDiscoveryError` state. Reconcile the existing Runs loader result with `discoverBaselineRuns(catalog)` using one catalog-relative coordinate system; per-manifest errors stay attached to their run, catalog-wide errors show a warning without hiding playable legacy runs. Dev-server startup applies D16 before falling back to a cached folder. FSA and classic picker use the same reconciliation after their existing loaders/catalogs. Clear all three states on forget/reload and guard asynchronous source changes against stale results.

6. **`src/lib/rlLabels.ts`** — add labels `geometric → 'Geometric'`, `optimization → 'Optimization'`. Add `objectiveLabel(s: string | null): string` (`coverage → 'Coverage'`, `balanced → 'Balanced'`, `resilience → 'Resilience'`, null → `'unknown'`, other → sanitized raw). Add `baselineStatusLabel(s): string` for the six statuses plus unknown. Keep the policy ordering constant in `experimentIndex.ts`, where it already lives; extend that existing constant rather than creating a second one.

7. **`src/styles/tokens.ts`** — add `TRAIL_COLORS.geometric = '#0d9488'`, `TRAIL_COLORS.optimization = '#ca8a04'`. `trailColor` helper unchanged (it already reads the map).

8. **`src/lib/scenarioGroups.ts` and `src/components/pages/shared.tsx`** —
   - `Tag`: add `bad` tone using the existing red utility classes consistent with tokens (e.g. `bg-red-500/10 text-red-700`).
   - Move pure grouping to `scenarioGroups.ts` for Node-runner tests. `groupScenarios(runs, unplayable = [])` emits unplayable scenarios per D4 and keeps full-path identities; `groupRuns` must include dates represented only by unplayable baselines. Sort with playable scenarios by the existing date/time ordering.
   - `ScenarioRow`: if `scenario.runs.length > 0 && scenario.runs[0].baseline` → render `<BaselineBadges compact>` after the title and `<BaselineSetupLine>` beneath the seed buttons; render `unmatchedSeedRecords(...)` as neutral text tags `seed N · <status>` (manifest `complete` with no CSV → `seed N · telemetry not found`). If `scenario.runs.length === 0` → render title, `<BaselineBadges compact>`, a neutral line `No playable telemetry`, and `manifest.error` (truncated per S5). No button, no `onClick`, no `onOpen`. Keep row height/typography identical to existing rows.

9. **`src/components/pages/RunsPage.tsx`** and **`HomePage.tsx`** — build their scenario/date groups from playable runs plus manifest-only baselines exactly once each; do not pass the whole unplayable array into every already-grouped date batch. Keep search, recent counts, empty states, and navigation accurate when there are no playable runs. Surface `workspace.baselineDiscoveryError` nonfatally. They already receive `workspace` from `App.tsx`, so no additional page props are needed for this step.

10. **`src/components/pages/BaselineInfo.tsx`** — create `BaselineBadges`, `BaselineSetupLine`, `BaselineProvenance` per §5. For standalone, derive display fields from the manifest; for evaluations, prefer the available `policies[name].baseline` block even if its referenced manifest is missing, and supplement from that manifest only when present. Provenance rows (each `unknown` when null): Run ID, Requested algorithm, Method, Objective, Executor, Planner seed (+ status), Max iterations (+ status), Fingerprint, Mapping SHA-256, Sim binary SHA-256, Planner source SHA-256, RF config SHA-256, Source and effective input hashes, Started, Ended, Package versions, Plan (`N nodes, K selected` / `unavailable` / `loading`), and source identity check when available. Show a compact plan-only original→planned setup preview; handle zero coordinate span and missing/nonfinite points without a broken graphic. No scene/CSV join. Hashes may be shortened visually with full value accessible on demand; do not expose unredacted local paths or errors in titles.

11. **`src/App.tsx` and `PlayerPage.tsx`** — `App` knows `playing.kind === 'run'` and `workspace.catalog`; pass an explicit optional standalone-baseline context (metadata plus catalog) to `PlayerPage`. Its current props have neither, so this wiring is mandatory. When present, show `Baseline · {methodLabel} · {objectiveLabel}`, setup line and collapsed provenance; lazily read/parse the plan through the catalog. For evaluation episodes, use the corresponding `evaluation.baselines[episode.policy]` context. Replace "model trained with seed none": only the `model` policy should be described as a trained model; other policies may show the evaluation-group seed without implying they themselves were trained.

12. **`src/lib/experimentIndex.ts`** — in `loadExperiment`, for each policy block with a plain-object `baseline`, build `EvalBaselineInfo` per §5. Resolve `manifest`/`plan` against `evalDir`; read the referenced manifest safely and nonfatally for wall time/source identity. Compare eval `scenario_identity` only with the referenced manifest's `sourceScenarioIdentity` when both exist; never flag effective-layout hash changes as an input mismatch. Do not add baseline manifests as experiment-root markers. Extend the existing `POLICY_ORDER` used by `matchingEpisodes`; do not reorder the manifest's `policies` array or saved comparison data.

13. **`src/components/pages/ExperimentPage.tsx` and `src/components/EpisodeDetails.tsx`** — show compact method/objective/status in the existing experiment/episode surfaces; add collapsed provenance and source-mismatch warnings only where source hashes actually differ. Do not hide genuinely recorded evaluation decisions, rewards, or telemetry for placement policies: they are HoldPolicy-on-prepared-layout observations, not the planner's decision trace. Label their provenance clearly; avoid model-training wording for those policies. Never render "duration/physics/warmup match" without evidence.

14. **`CLAUDE.md`** — in *Data Format*, add one line: standalone baseline runs at `outputs/YYYY-MM/DD/HH-MM-SS-baseline[-N]/baseline_manifest.json` (+ `effective-inputs/baseline-plan.json`); manifest-only runs list as non-playable.

15. Run authorized checks (§8) and fix only failures caused by this change.

---

## 8. Tests authorized (exact)

Validation commands the Implementer may run: `npm test`, `npm run build`, `npm run lint` using Node 22.6+ (the current shell's Node 14 is insufficient). Read-only repository inspection is permitted. No branch/PR operations, dev server, browser automation, or unrelated scripts in this stage.

Fixture helper (new): `tests/helpers/memoryCatalog.ts` — `memoryCatalog(files: Record<string,string>, opts?: {name?: string; truncated?: boolean}): ResultCatalog` backed by a `Map`, `getFile` returning `new File([text], basename)`. Manifest factory `makeBaselineManifest(overrides = {})` and `makeBaselinePlan(overrides = {})` in `tests/helpers/baselineFixtures.ts` producing minimal valid v1 objects with all nullable fields `null` by default.

### `tests/baselineManifest.test.ts` (new)
1. parses a full v1 standalone manifest → all fields mapped; `plannerWallS`, `initialDisplacementMTotal` numbers preserved.
2. `baseline_manifest_version: 2` → `ok:false`, reason mentions version. Missing version → `ok:false`.
3. invalid JSON / array / string → `ok:false`.
4. each lifecycle status (`preparing, prepared, running, complete, failed, interrupted`) parses to itself; `'exploded'` → `status:'unknown', rawStatus:'exploded'`.
5. objective `'coverage'|'balanced'|'resilience'` retained; `'zeta'` retained raw; 200-char objective truncated to 32; control chars stripped.
6. numeric coercion: `"12"` (string) → `null`; `NaN`/`Infinity` → `null`; `0` → `0`.
7. `seeds` parsing: valid records mapped; record without numeric seed dropped; `summary` with `..` → `summaryRef:null`.
8. `plan: "effective-inputs/baseline-plan.json"` → `planRef` kept; `plan: "../x.json"`, `"/abs"`, `"C:\\x"` → `null`.
9. `eval_manifest`, `source_run_config_abs` present in input → absent from output object (assert `!('evalManifest' in v)`).
10. `effective_scenario_identity` partial object → missing keys null; non-object → null.
    Also verify `source_scenario_identity` and `planner_source.aggregate_sha256` are mapped; do not read a nonexistent `planner_source.sha256` field.
11. `parseBaselinePlan`: valid v1 → nodes with ids; version 0 → error; node without id dropped; `selected` non-boolean → `false`.
12. `resolveRef('2026-09/30/12-00-00-baseline', 'effective-inputs/baseline-plan.json')` → `'2026-09/30/12-00-00-baseline/effective-inputs/baseline-plan.json'`; `resolveRef(root, '../eval_manifest.json')` → null; `resolveRef(root, '/etc/passwd')` → null; `resolveRef(root, 'a\\b')` → null; `resolveRef(root, null)` → null.
13. `compareScenarioIdentity`: equal hashes → `match`; differing → `mismatch`; null on either side → `unknown`; both null objects → all `unknown`.

### `tests/baselineRuns.test.ts` (new)
1. `discoverBaselineRuns` finds `2026-09/30/12-00-00-baseline/baseline_manifest.json`, its `-2` sibling, and `relocated/outputs/2026-09/30/12-00-00-baseline/baseline_manifest.json` as distinct full-path identities; ignores evaluation baseline manifests and paths without the dated run-directory suffix.
2. manifest with `mode:'evaluation'` at run-root depth is excluded.
3. malformed manifest → `BaselineRun` with `manifest:null`, `manifestError` set; discovery still returns the other valid run.
4. `getFile` throwing for one path → that run has `manifestError`; others unaffected; promise resolves.
5. `attachBaselineMeta`: two `RunEntry`s (seed 1, 2) under `12-00-00-baseline` + manifest with seeds [1,2,3] → both entries get `baseline` with matching `seedRecord`; `unplayable` is empty; `runs.length === 2`; entries are not the same object references but have identical CSV `File` references.
6. `attachBaselineMeta` with a `RunEntry` that has `point` set under the same time → not matched.
7. manifest-only failed run (no seeds in catalog) → `unplayable.length === 1`, `runs` unchanged.
8. legacy run without manifest → `baseline` undefined; `unplayable` empty.
9. `unmatchedSeedRecords` returns seed 3 only for case 5.
10. relocated/nested root: full catalog-relative `runDir` matches its seed's `RunEntry.runDir`; two different prefixes with the same date/time never merge. Catalog display `name` has no effect.
11. no duplicate: `attachBaselineMeta` output has unique `key`s equal to input keys.
12. all three loading paths: construct actual `catalogFromFileList`, `catalogFromDirectoryHandle`, and mocked `catalogFromDevServer` catalogs with the same synthetic manifest tree; each discovers the same baseline, including a manifest-only failed run. Spy that baseline discovery reads no CSV. A memoryCatalog helper may cover parser/reconciliation edge cases, but merely changing its `name` is **not** a three-source test.

### `tests/assembleRuns.test.ts` (extend)
- `2026-09/30/12-00-00-baseline/seed-1/{links.csv,positions.csv}` → one entry with `time === '12-00-00-baseline'`.
- `…/12-00-00-baseline-2/seed-1/…` → `time === '12-00-00-baseline-2'`, distinct `key` from `12-00-00-baseline`.
- `isLegacyRunPath` accepts the above and still rejects `episode-*`.
- existing legacy fixtures unchanged (regression).
- a run dir containing only `baseline_manifest.json` yields zero entries from `assembleRuns`.
- classic picker path with its `webkitRelativePath` folder prefix matches the catalog-relative manifest path after prefix stripping.
- two nested dated runs with identical date/time but distinct prefixes retain distinct full `runDir` and keys.

### `tests/resultCatalog.test.ts` (extend)
- `isCatalogFile(['baseline_manifest.json']) === true`, `isCatalogFile(['effective-inputs','baseline-plan.json']) === true`, `isCatalogFile(['planner.log']) === false`; `summary.json` behavior is unchanged. (`isCatalogFile` takes path segments, not a string.)
- `normalizeRelPath` still rejects `..`, absolute, backslash (regression).

### `tests/outputsServer.test.ts` (extend)
- listing includes `…/baseline_manifest.json` and `…/effective-inputs/baseline-plan.json` from a synthetic tree; excludes `planner.log`, `sim.log`.
- path escape and symlink escape rejection tests unchanged (regression).

### `tests/experimentIndex.test.ts` (extend)
- legacy eval manifest v2 without `baseline` blocks → `evaluation.baselines` deep-equals `{}` and every other field equals previous expectation.
- eval with `policies.geometric.baseline` (manifest ref `geometric/baseline/baseline_manifest.json` present in catalog) → `baselines.geometric.plannerWallS` equals the referenced manifest's value; `objective`, `initialDisplacementMTotal` from block.
- same with manifest ref missing from catalog → `manifest:null`, `manifestError:'not in catalog'`, `plannerWallS:null`, evaluation still loads.
- manifest ref `../../outside/baseline_manifest.json` → `manifestPath:null`, `manifestError:'unresolvable reference'`, no `getFile` call for it (spy).
- referenced baseline manifest containing `eval_manifest: "../../eval_manifest.json"` → no `getFile` for that path (spy asserts only the manifest path was fetched).
- baseline-only eval (`training:null`) with `geometric` and `optimization` → both `baselines` entries; `trainingSeed:null`.
- eval `scenario_identity` with one differing hash versus referenced manifest `source_scenario_identity` → `sourceIdentityCheck.nodesJsonSha256 === 'mismatch'`; equal/absent keys produce match/unknown as appropriate. Deliberately different `effective_scenario_identity.nodes_json_sha256` alone produces **no mismatch warning**. Missing referenced manifest or eval identity → `sourceIdentityCheck:null`.
- policy order: `['optimization','model','geometric','hold']` input → ordered `model, hold, geometric, optimization`.
- episodes for baseline policies retain `playable`, `status`, `metrics` with nulls unchanged; no metric becomes `0`.

### `tests/rlLabels.test.ts` (extend)
- `geometric → 'Geometric'`, `optimization → 'Optimization'`, unknown raw fallback unchanged.
- `objectiveLabel` for three known values, `null → 'unknown'`, unknown raw.
- `baselineStatusLabel` for all six statuses and `'unknown'`.
- `trailColor('geometric') === '#0d9488'`, `trailColor('optimization') === '#ca8a04'`, `trailColor('zzz') === '#475569'`, and the five known colours are pairwise distinct.

### `tests/comparisonView.test.ts` (extend)
- comparison v1 with baseline `'geometric'` and `'optimization'` strings renders the saved statistics unchanged; no field recomputed (regression of existing expectations plus the new baseline names).

### Non-playable navigation (unit-level, no DOM)
- In `tests/baselineRuns.test.ts`, import pure `groupRuns`/`groupScenarios` from `src/lib/scenarioGroups.ts`: an unplayable scenario has `runs: []`, `baseline` set, key `runDir`, and a date group even with zero playable runs; a playable baseline still produces one scenario. React `ScenarioRow` must render no seed button for `runs: []`; verify this in the later manual exit gate because the Node test runner has no DOM renderer.

Build/lint: `npm run build` must pass typecheck; `npm run lint` clean.

---

## 9. Explicit exclusions

- No new Compare page, no comparison statistics computation or rewrite (`comparisonView.ts` logic untouched).
- No PPO/model changes; no invented actions, rewards, training seeds, or telemetry for baseline runs.
- No Phase 3 WHY inspector, per-decision attribution, or plan↔CSV node joining. The small plan-only original→planned setup preview is not an observed node trajectory.
- No Phase 4 animation of initial placement; displacement is labelled as setup, never simulated travel.
- No parsing of `summary.json`, `planner.log`, `sim.log`, `source-inputs/`, `effective-inputs/` other than `baseline-plan.json`.
- No dereferencing of `eval_manifest`, `source_run_config_abs`, `origin`, absolute `episode_dir`.
- No server changes beyond two allowlisted filenames.
- No "duration / physics / warmup match" labels; `metric_source.warmup_excluded` display unchanged.
- No `baseline_manifest.json` as an experiment-root marker.
- No datasets, bundles, logs, configs, weights, screenshots, or local `feature-research/` reports in the PR.
- No branch switching, commits, pushes, or PR creation by the Implementer. The later Git-PR agent handles the approved GUI stack/base after human review.

---

## 10. Files touched

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
- `src/App.tsx` — required to pass the standalone run and catalog context to Player
- `CLAUDE.md`
- `tests/assembleRuns.test.ts`
- `tests/resultCatalog.test.ts`
- `tests/outputsServer.test.ts`
- `tests/experimentIndex.test.ts`
- `tests/rlLabels.test.ts`
- `tests/comparisonView.test.ts`

Not touched
- `vite-plugin-outputs.ts` (verify only), `src/lib/comparisonView.ts`, all `components/canvas/*`, `hooks/useSimData.ts`, `hooks/useSimLog.ts`, any CSV parsing.

---

## 11. PR stack/base and dependency (for human review)

- Current GUI checkout: `docs/rl-gui-integration` @ `da925e8`. Local GUI refs include `main`, `feat/rl-data-layer`, `feat/rl-gui-pages`, and `docs/rl-gui-integration`; no local `develop` ref was found. Do not create or switch branches in this stage. The Git-PR agent must resolve with the human whether Phase 2 is stacked on the docs branch and which GUI base PR should target; do not silently target `main` or assume the simulator repo's `develop` is a GUI branch.
- Dependency: Phase 1 PR #15 (`feat/mesh-sim-baseline-adapter-phase1`, `6247a0d0`) must pass CI and land in `develop`. **Not verified by Scout; not assumed here.** Implementation may proceed against the contract in §3; the PR must not merge until a human confirms PR #15's status and, ideally, exercises one real Phase 1 output through the three loading paths (exit gate).
- Exit gate check (manual, human): real Phase 1 standalone run and eval appear in Runs/Home/experiment/player; displayed values match saved files; legacy outputs unchanged. If satisfying this requires a materially new comparison page, stop for scope approval.

## 12. Residual items (non-blocking, flagged rather than guessed)

- The current `isLegacyRunPath` already accepts timestamp suffixes; no time-regex change is needed.
- The selected single run directory without its dated parents is outside the current Runs loader contract. The Phase 2 exit gate exercises the normal outputs tree and relocated/nested copies of that tree; direct single-run-folder support would be a separate scope decision.
- The plan-only placement preview does not assert that the simulator's first CSV frame starts at the original location. It is preparation provenance, not telemetry.
