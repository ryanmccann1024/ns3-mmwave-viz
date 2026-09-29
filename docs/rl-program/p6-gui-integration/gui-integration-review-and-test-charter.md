# GUI result reader: review and test charter

Date: 2026-09-19. Local only. Reviewer read the plan, scout, interfaces and audit, the scoped diff, every new file,
and the simulator writers (`scripts/rl/policy/compare.py`, `scripts/rl/env/telemetry.py`, `scripts/rl/env/episode.py`,
`scripts/rl/ops/fetch.py`, `src/io/viz-writer.cc`, `src/rl/rl-bridge.cc`). Also ran the reader libraries against every
root in the real `mesh-sim/outputs` tree.

**Status: READY_FOR_TEST** (re-review, 2026-09-19). The first review returned four blocking findings. All four (B1–B4)
are now fixed and tested; see "Re-review of B1–B4" below. The original findings are kept for the record.

## Scope

- The plan has no literal "Files touched" list. Its §2 existing-file table and §5 suggested-module table serve as the scope.
- The audit also touches `src/lib/trajectory.ts`, `src/hooks/useExperimentSession.ts`, `src/components/ComparisonTable.tsx`,
  `src/components/ExperimentStatus.tsx`, `src/components/canvas/NetworkCanvas.tsx`, `src/styles/tokens.ts`, `package.json`
  and `tests/`. All are declared deviations, and none adds behaviour outside the plan: §5 allows module names to change,
  and NetworkCanvas/tokens only carry trail plumbing. **Non-blocking.** Future plans should include a literal list.
- `useSimData.ts` and `coordinates.ts` are unchanged, as the plan intended.

## Verified independently (not taken from the audit)

- `npm test` 30/30, `tsc --noEmit` clean, `npm run lint` clean.
- Real tree: the dev listing returns 2,795 paths (not truncated) in about 200 ms. Discovery finds 11 roots.
  - `bypass-matrix` has 4 separate evaluations (`local-delivery`/`local-legacy` × 101/102), each with 3 policies and 9 playable
    episodes that have telemetry.
  - `missing-check` shows `incomplete`.
  - The seven `p3-verification/*` roots (eval manifest v1) are rejected with a clear version message.
  - 1,005 legacy files still group, including `2026-05`, `2026-09`, `calfex` and `p0-*`.
- Node mapping confirmed: `VizWriter::WritePositions` writes loop index `i` over `mobs`, and `rl-bridge.cc` builds `m_nodeIds`
  from `cfg.nodes` in the same order. The trail and the nodes use the same `simToThree(..., posScale)`.
- Server: GET/HEAD only. It uses `path.relative` and realpath containment, decode errors return 400, and symlinked
  directories are skipped in the listing. The tests cover sibling-prefix, encoded `..`, absolute paths and both symlink
  cases. There are no write routes and no process spawning.
- Comparison view passes simulator fields through untouched. A null interval stays null with `interval_omitted`. Scope
  labels match `compare.py` (`paired_t_across_evaluation_seeds` / `t_across_training_runs`). `return` and `legacy_reward`
  carry the not-comparable flag. `best_mean_reward` is labelled as a single value, not a curve.

## Blocking findings

### B1 — Major: the decision panel shows the previous interval's action as if it were current

- **Where:** `src/lib/episodeTelemetry.ts:94-112` (`decisionAt`); `src/components/EpisodeDetails.tsx:216-223, 259-269, 333-335`.
- **Evidence:** `episode.py` `_append_record` writes `self._last_action` into `action_sent`, and the record at decision k
  carries the reward for the window that just ended (`ticks_in_step`: 10).
  - In `bypass-matrix/eval/local-delivery/train-seed-101/model/episode-0000`, decision 0 (t=0) has `action_sent: null`, and
    decision 1 (t=1.0) has `action_sent [0]` with node-b at x=180.
  - `positions.csv` shows node-b already moving by t=0.1 (x=198).
  - So during t ∈ [0, 1) the panel says "none sent yet" while the node visibly moves west. During t ∈ [1, 2) it shows
    decision 1's action and reward, which describe (0, 1], not the motion on screen.
  - With `--telemetry-every k` > 1, the at-or-before rule also silently shows a record up to k intervals old.
- **Smallest fix:**
  - Select the record whose window contains t: the first record with `time_s ≥ t` and
    `time_s − ticks_in_step·tick_s < t`; decision 0 applies only at t = 0.
  - Label it "action applied and reward earned over (t₀, t₁] s". If no saved record covers t, say "not saved (telemetry
    every k decisions)".
  - Keep the mask labelled as the mask observed at that record's time.
  - Update the boundary test in `tests/episodeTelemetry.test.ts` to these semantics.
  - This departs from the plan's literal "at or before" wording. The plan's intent was no invented interpolation, and that
    still holds.

### B2 — Major: a telemetry v1 reward without `components` crashes the whole app

- **Where:** `src/components/EpisodeDetails.tsx:262`; the type is at `src/lib/episodeTelemetry.ts:22-26`.
- **Evidence:** `telemetry.py` `_reward_field` writes `{"total": x, "source": "cpp"}` when there is no reward breakdown. Real
  examples exist (`outputs/p3-verification/bypass-eval-a/random_valid/episode-0000/steps.jsonl`, `telemetry_version` 1).
  - `Object.entries(undefined)` throws during render.
  - There is no error boundary in `src/`, so the whole UI unmounts.
  - It is not reachable from local v2 roots today, but the writer path is live.
- **Smallest fix:**
  - Make `components` optional in `StepReward`.
  - Render `Object.entries(step.reward.components ?? {})` and show `source` when present.
  - Add one parse-plus-view-model test with a cpp-style record.

### B3 — Major: a standard unlabelled standalone evaluation is rejected as unusable

- **Where:** `src/lib/experimentIndex.ts:461-468` (`identityIssue`), with a knock-on effect at `src/components/ComparisonTable.tsx:102`.
- **Evidence:** `evaluate.py:90` defaults `--label` to `None`. `outputs/one-seed/eval_manifest.json` is a completed v2
  manifest with `training_seed` 101, held-out seed 301 and 3 policies. The reader reports "does not record label and
  training seed", which is wrong because the seed is recorded, and it hides every episode. `one-seed-cmp/comparison.json`
  has `label: null`, so its paired table header is blank.
- **Smallest fix:**
  - For the standalone `<root>/eval_manifest.json` only, accept `label: null`. Key it as, for example,
    `(unlabelled)#<seed>` and display "unlabelled evaluation".
  - Keep requiring a label for manifests under `eval/` that must match plan rows.
  - Render a null comparison label as "unlabelled".
  - Add one test.

### B4 — Major: picking the real outputs folder in production can silently drop experiments

- **Where:** `src/lib/resultCatalog.ts:83-111`; `src/components/FileLoader.tsx:76, 232`; `README.md:106`.
- **Evidence:** The FSA catalog counts every file, with no name filter and no train-rollout skip, against a 50,000-entry cap,
  and walks directories depth-first (LIFO).
  - The real `mesh-sim/outputs` holds 65,800 files, 30,885 of them in `tuning-venv/`. The cap is therefore reached, and
    which experiments survive depends on directory iteration order.
  - `truncated` is shown only inside `ExperimentBrowser`. A root dropped from the loader list gives no warning.
  - The README tells users to pick "the outputs folder".
  - The dev listing is unaffected, because it filters by name.
- **Smallest fix:**
  - Reuse one shared reader-relevant filename predicate: export it from `resultCatalog.ts` and have the plugin import or
    mirror it. Apply it, together with the train-rollout skip, in `catalogFromDirectoryHandle` and `catalogFromFileList`.
    That brings the real tree to about 2.8k entries.
  - Show the truncated note in `FileLoader` when `catalog.truncated`.

## Non-blocking findings

| # | Sev | Where | Evidence | Smallest fix |
|---|---|---|---|---|
| N1 | Minor | `vite-plugin-outputs.ts:42-45` | `isTrainRollout` matches any ancestor named `train`, so a row or root literally named `train` hides its eval episodes in dev | Skip only `…/train/<row>/train-seed-*/episode-*` (or require no `eval` ancestor) |
| N2 | Minor | `src/lib/assembleRuns.ts:261-279`, `FileLoader.tsx:73-76` | The legacy FSA walk calls `getFile()` on every known file, including all RL episode CSVs, then the catalog walks the tree again | Skip `episode-*` directories in `walkDirectory` |
| N3 | Minor | `EpisodeDetails.tsx:431,444`; `App.tsx:266` | Below `lg`, and always in split view, telemetry and overlay toggles are unreachable, while the trail legend still shows | Tester to confirm; later show a compact toggle or note |
| N4 | Minor | `ComparisonTable.tsx:159-168` | Non-zero health counters render in neutral grey, but `compare.py` `exit_code` treats them (and `held_out: false`) as not clean | Use warn tone when any counter > 0 |
| N5 | Minor | `experimentIndex.ts:488` | Duplicate-manifest detection relies on `simulatorStatus !== null`, so a duplicate with no `status` overwrites silently | Track a `manifestPath` and compare that |
| N6 | Minor | `ExperimentBrowser.tsx:246-250` | `await loadTrainingSummary` has no catch; a dev fetch or FSA permission error is an unhandled rejection | try/catch into a warn note |
| N7 | Minor | `useExperimentSession.ts:56,118-124` | Trails are keyed by policy, and a read still in flight after toggle-off repopulates (the audit notes this) | Acceptable this phase |
| N8 | Info | `comparisonView.ts:301-304` | `String(n)` differs from Python `repr` for `1.0`→`1` and `1e-05`→`0.00001` | Keep as is; the Tester compares by value, not glyph |
| N9 | Info | `README.md` test line | `--experimental-strip-types` needs Node ≥ 22.6 | Say 22.6+ |
| N10 | Info | `experimentIndex.ts` (647 lines), `comparisonView.ts` (324) | Mostly types. Discovery, manifest parse and episode materialisation are cohesive; no cosmetic rewrite needed. If it grows, move `episodeFiles`, `matchingEpisodes` and `loadTrainingSummary` into an `episodeIndex.ts` | None now |
| N11 | Info | `package.json` lint script, `tsconfig` | `vite-plugin-outputs.ts` and `tests/` are not linted or typechecked (the audit notes this) | Optional: add them to the lint glob |

## Test adequacy

The existing tests target the right risks: containment, row separation, lazy fetch, version gating, null intervals, node
mapping and decimation. They are missing exactly the B1–B4 cases. Add one small test per blocking fix and nothing more:

- window selection including a sparse `every` case;
- a cpp-style reward record;
- an unlabelled standalone manifest;
- a catalog that ignores non-reader files and stays under the cap.

The README section is accurate apart from B4's "pick the outputs folder" guidance and N9.

## Re-review of B1–B4 (fresh Reviewer, 2026-09-19)

Scope was limited to the B1–B4 fixes, the legacy folder scan, comparison values and the read-only boundary. Every item was
checked against the code and the real `mesh-sim/outputs` tree. None of it was taken from the audit.

**Commands run with Node 22.17:**

- `npm test`: 34 pass, 0 fail.
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm run build`: succeeds. The only warning is the chunk-size warning that was already there.

**Real-tree checks:** a scratch script ran the reader libraries against the real tree. It used a fake
`FileSystemDirectoryHandle` backed by `fs` to exercise the production folder walk.

| Fix | Code | Evidence | Result |
|---|---|---|---|
| B1 | `episodeTelemetry.ts:96-139` `decisionWindow`/`decisionAt` picks the first record with `time_s ≥ t` and keeps it only if t is in `(time_s − ticks_in_step·tick_s, time_s]`. Decision 0 is used only at t = 0. `EpisodeDetails.tsx:213-235` shows "No saved decision covers t=…" and the row "Action applied and reward earned over (a, b] s". The mask label reads "observed at decision time". | Real `bypass-matrix/…/train-seed-101/model/episode-0000`, `tick_s` 0.1: t=0 → d0, nothing sent. t=0.05/0.5/1.0 → d1 `[0]` west. t=1.05/1.5/2.0 → d2. t=2.5 → d3. t=19.95/20.0 → d20 `[4]`. t=20.05 → gap. The test covers sparse `[d0, d3]`: t=0.5 → gap, t=2.5 → d3. A missing `tick_s` also → gap. | Fixed |
| B2 | `StepReward.components` is optional. The panel uses `rewardComponents()` (`?? {}`) and shows `source`. `rewardSeries` also defaults to `{}`. | Real `p3-verification/bypass-eval-a/random_valid/episode-0000` d1 reward `{"source":"cpp","total":-1}` is selected and handled. A test covers the lib path. | Fixed |
| B3 | `experimentIndex.ts:461-463` accepts `label: null` only for `<root>/eval_manifest.json`. Manifests under `eval/` still need a label. `comparisonView.ts:236` and `ComparisonTable.tsx:103` fall back to "unlabelled evaluation". | Real `one-seed`: evaluation `unlabelled evaluation#101`, state `ok`, model/hold/random_valid × seed 301, all playable, no issues. Real `one-seed-cmp` view labels show "unlabelled evaluation". Tests exist for both. | Fixed |
| B4 | `resultCatalog.ts` exports `isReaderFileName`/`isTrainRolloutDirectory`, and `vite-plugin-outputs.ts:4,36-38` imports them. Both folder catalogs filter by name and skip rollouts, and only reader files count toward the cap. `FileLoader.tsx:221-226` warns when `catalog.truncated`. | Full real tree: 65,806 files on disk → folder catalog of 2,795 entries, the same count as the dev listing. Not truncated, 0 training rollouts, the same 11 roots. The rollout predicate now also needs `train/<row>/train-seed-*/…/episode-*` (this closes N1). | Fixed |

**Other checks:**

- **Legacy scan.** `walkDirectory` no longer descends into `episode-*` or dot-directories. `parseRunsFromFileList` drops
  `episode-*` paths, and `assembleRuns` gates on `isLegacyRunPath`. RL episode CSVs are therefore never opened by the
  legacy path. This closes N2.
- **Comparison values.** Every number the view emits appears in the raw file for `bypass-matrix` and `one-seed-cmp` (no
  view-only values). The raw values the view omits are the interval `t` critical values and per-seed identifiers, which
  were already omitted in the first review. The fixes touched only the label fallback in `comparisonView.ts`.
- **Read-only boundary.** The plugin still allows only GET and HEAD. There are no write, spawn or `child_process` calls,
  and `src/` makes no non-GET fetch and uses no writable file handles.
- **README.** The "Decision timing" paragraph matches B1. The file-limit caveat matches B4, and Node 22.6+ is stated
  (N9).

**New non-blocking notes (none needs a fix before test):**

- R1 (Info). The literal label `unlabelled evaluation` doubles as the key text, so a real row with that exact label would
  collide in the key. This is unlikely.
- R2 (Info). The legacy walk and the catalog walk now also skip dot-directories. This is harmless, but it is a small
  behaviour change the audit does not mention.
- R3 (Info). The folder walk still enumerates non-reader trees such as `tuning-venv/` (6,665 directories visited, about
  320 ms on local `fs`). Chrome FSA will be slower. The Tester should note the time in item 7.
- R4 (Info). The B2 test covers the lib helpers, not a render. The component uses the same helper.
- N3–N8, N10 and N11 are unchanged.

## Tester handoff

### Automated, in order

1. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. All must pass, including the new B1–B4 tests.
2. Run `npm run dev` and use curl:
   - `curl -i -X POST localhost:5173/api/outputs` → 405 with `Allow: GET, HEAD`.
   - `curl -I localhost:5173/api/outputs` → 200 with no body.
   - `curl -i localhost:5173/outputs/%E0%A4%A` → 400.
   - `curl -i --path-as-is localhost:5173/outputs/../package.json` → 403 or 404, never file contents.
   - `curl -i 'localhost:5173/api/outputs?x=1'` → JSON.
   - Stop the server afterwards.
3. Re-run the reader against the real tree with a scratch script like the Reviewer's (listOutputs → catalog → discover →
   loadExperiment on every root). `one-seed` must show `unlabelled evaluation` / 101 with 3 policies × seed 301, all
   playable. A folder catalog of the full tree must show 2,795 entries, not truncated.

### Browser, human paths still outstanding from the audit

1. **Legacy.** Load a `2026-09/…/seed-N` run. Playback, links, charts and reset behave as before.
2. **Rows.** Open `bypass-matrix`. Check `local-delivery` and `local-legacy` × training seeds 101/102 × model/hold/random_valid,
   held-out seeds 301–303, all `ok`, with no merging.
3. **Numbers.** For `local-delivery` / 101, compare model vs hold `delivery_ratio` against
   `comparison/comparison.json`: `model_mean`, `baseline_mean`, `mean_difference`, `interval.low`, `interval.high`,
   `interval.n`, and the group row's interval. Compare by value (N8).
4. **Episode.**
   - Open model seed 301.
   - Seek to t = 0, 0.5, 1.0, 1.5 and 2.5. The expected panels are:
     - t = 0: decision 0, "none sent yet", reward "not yet awarded".
     - t = 0.5 and 1.0: decision 1, west, interval (0, 1] s.
     - t = 1.5: decision 2, interval (1, 2] s.
     - t = 2.5: decision 3, interval (2, 3] s.
     - Reward totals must match `steps.jsonl`.
   - The node-b trail must run 200 → 120 in x, then to y = 40.
   - Toggle hold and random_valid overlays and check the legend colours.
5. **Unlabelled.** Open `one-seed`. It shows "unlabelled evaluation" / training seed 101 and 3 playable episodes. Open
   `one-seed-cmp`. The paired table header reads "unlabelled evaluation", not blank.
6. **Incomplete.** In `missing-check`, check the "incomplete — not a complete result" badge, the missing reason and the
   omitted-interval text.
7. **Degraded data.** Copy `bypass-matrix` to a scratch location outside both repos. Delete one `steps.jsonl` and one
   `positions.csv`, and add a synthetic `fetch_manifest.json` with `selection: ["comparison"]`. In one remaining
   `steps.jsonl`, make two edits for B2 and sparse B1:
   - Replace decision 1's `reward` with `{"total": -1.0, "source": "cpp"}`.
   - Delete the decision 2 line.
   - The missing-telemetry episode still plays.
   - The episode without positions shows an actionable message.
   - Evaluations show `not fetched`.
   - The fetch snapshot is labelled as a saved snapshot, not live status.
   - In the edited episode, t = 1.0 shows total −1 and source `cpp` without crashing.
   - t = 1.5 shows "No saved decision covers…", not decision 1.
8. **Production.** Run `npm run build && npm run preview`. In Chrome, use Open Outputs Folder on the full `mesh-sim/outputs`
   (B4) and on `bypass-matrix` directly. On the full tree, all 11 roots and the legacy runs must be listed with no
   file-limit warning. Record how long the folder read takes. In Firefox or Safari, use the webkitdirectory fallback on `bypass-matrix`.
   Confirm no `/api/outputs` dependency.
9. **Layout.** Check the episode view at a width below 1024 px and in split view (N3). Record the result; it does not block.

Report: pass/fail per item with one line of evidence. Include screenshots only for failures.
