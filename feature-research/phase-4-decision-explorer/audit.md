# Audit — Decision Explorer T0 + app-wide motion (WP-0 … WP-6)

Date: 2026-10-01. Branch `feat/decision-explorer`, started at PR #4 head `96a02ed3` (verified; all three
untracked `feature-research/` folders preserved). No Git state changed, no commit, no PR, no formatter run
repo-wide. Top-level Implementer: Fable 5.1; two Opus subagents on disjoint file sets (WP-5 motion; WP-1 tests).

**Scope status: WP-0–WP-6 implemented. WP-7 (T1 producer-sidecar consumer) NOT started — waiting on gates
G-1…G-4. This is not the completed combined feature.** No `policy_decisions*` allowlist entries, types,
schema or preference UI exist; no "coming soon" placeholder was added.

## Files changed

New:
- src/lib/decisionExplorer.ts
- src/lib/nodeIdentity.ts
- src/lib/frameSeek.ts
- src/hooks/useEpisodeTelemetry.ts
- src/components/decisions/DecisionExplorer.tsx
- src/components/decisions/DecisionStrip.tsx
- src/components/decisions/DecisionDetail.tsx
- src/components/decisions/DecisionList.tsx
- src/components/decisions/SlotChips.tsx
- src/components/decisions/ActionGlyph.tsx
- src/components/ui/Skeleton.tsx
- src/styles/motion.ts
- tests/decisionExplorer.test.ts
- tests/nodeIdentity.test.ts
- tests/frameSeek.test.ts
- tests/motionPolicy.test.ts
- tests/helpers/syntheticTelemetry.ts

Modified:
- src/lib/episodeTelemetry.ts
- src/hooks/useSimData.ts
- src/components/pages/PlayerPage.tsx
- src/components/EpisodeDetails.tsx
- src/components/charts/MetricChart.tsx
- src/components/charts/ChartsView.tsx
- src/App.tsx
- src/index.css
- tailwind.config.js
- src/components/ui/Button.tsx
- src/components/ui/Segmented.tsx
- src/components/ui/Disclosure.tsx
- src/components/ui/Badge.tsx
- src/components/ui/Breadcrumbs.tsx
- src/components/rl/ReplayPicker.tsx
- src/components/ExperimentStatus.tsx
- src/components/pages/HomePage.tsx
- src/components/pages/RunsPage.tsx
- src/components/pages/ExperimentsPage.tsx
- src/components/pages/ExperimentPage.tsx
- src/components/pages/TrainingRunPage.tsx
- src/components/pages/shared.tsx
- tests/episodeTelemetry.test.ts
- CLAUDE.md
- README.md

Local, untracked (never commit): feature-research/phase-4-decision-explorer/measurements.md, this audit.
Plan-listed but unchanged: src/components/ui/Row.tsx, src/components/pages/BaselineInfo.tsx (no `transition-`
classes), tests/trajectory.test.ts (trajectory.ts untouched).

## What changed per file

### WP-1 pure data layer
- **episodeTelemetry.ts** — `TelemetryContract.slot_node_ids` → `(string|null)[]`, optional `num_decisions`;
  `StepRecord.obs_sha256?`; new `recordForDecision(parsed, n)` exact binary search by integer decision
  (null on miss). Parser and existing exports unchanged.
- **decisionExplorer.ts** — §4.1 verbatim plus: `ticksInStep: Float64Array` on `DecisionIndex` (needed so
  `decisionAtTime` can apply the half-open window without the telemetry object), `isUnavailable()` guard,
  `APPLIED_UNAVAILABLE_REASON`, exported `RowEntry`/`RowIndex` types. `buildDecisionIndex` throws on
  non-integer/duplicate/non-ascending decisions, non-integer or non-increasing ticks, nonfinite or
  non-increasing times (D-3). Coverage: `num_decisions` trusted only if integer > 0 and ≥ max observed
  (records run 0…num_decisions, confirmed from simulator tests); then a trailing gap is recorded, else
  `coverageKnown=false`. `joinDecision`: reset iff n===0; input from n−1 only or `missing_source`; applied via
  `deriveApplied` with `resolveHoldIndex` (no literal 4). `bucketize` O(N+cols) with exact min/max and
  `hasGap`; `makeRowIndex` materialises only in-range gap rows, O(log) `rowAt`.
- **nodeIdentity.ts** — `buildNodeMapping` with the five exact reason strings plus one extra
  `"slot_node_ids lists node <id> more than once"` for a duplicated slot id (plan listed no reason for that
  case). `parseArchivedNodeIds(text)` (array of `{id: string}`; present-but-invalid → `invalid`).
- **frameSeek.ts** — `frameIndexForDecisionWindow` (inside iff `start+tol < t ≤ end+tol`; null for
  empty/unsorted/nonfinite/empty-interval) and `frameIndexAtTime` for the reset snapshot.
- **tests/helpers/syntheticTelemetry.ts** — deterministic generator with ground-truth maps and raw JSONL.

### WP-2 playback plumbing
- **useSimData.ts** — request token on `loadFiles`/`reset` (superseded loads discarded); `seek` clamps;
  `seekDecisionWindow(start,end)` and `seekInstant(t)` pause+seek only on a real hit (tolerance 1e-6 s,
  `SEEK_TOLERANCE_S`); `declaredNodeIds` parsed from the already-read archived `nodes.json`
  (`parseSimFiles.ts` untouched).
- **useEpisodeTelemetry.ts** — once per PlayerPage mount, stale-token guarded, checks `File.size` before
  `text()`; above `maxAutoBytes` (default 64 MiB; dev override `VITE_TELEMETRY_AUTO_LOAD_BYTES`, enabling
  B-14 without code edits) returns `needs_explicit_load`; `loadExplicitly()` loads it. In-memory only.
- **PlayerPage.tsx** — `'decisions'` tab (evaluation episodes only); telemetry hook; memoised index (build
  errors → tab error state) and `NodeMapping` (invalid archived nodes.json → unavailable with reason);
  `selectedDecision`/`decisionRange`/`focusSlot`/`seekNotice` state; `selectDecision` pauses then seeks
  (reset → `seekInstant`, action → `seekDecisionWindow`), "No playback frame at this decision" on miss;
  first opening selects the action under the playhead else first saved action (§5.1 Ready); scene click no
  longer forces Overview while on Decisions; chip↔scene sync only when mapped; uncontrolled node →
  "Node X is not policy-controlled"; RL trail node coordinated by slot id; mobile tab rail + panel below the
  playback controls via a `matchMedia('(min-width:1024px)')` hook so exactly one panel is mounted; aside
  widens to `min(50vw, 44rem)` at xl while Decisions is active; `aria-busy` on the loading state; D-18
  preferences (`PlayerPreferences { nodeId, tab, metric }`) restored once the mapping is proved and only when
  the id/tab/metric exists.
- **EpisodeDetails.tsx** — internal `steps.jsonl` fetch removed; takes `telemetryState`, `decisionIndex`,
  `indexError`; `DecisionView` now renders `joinDecision` output: "Pre-action mask (decision n−1)" or
  "pre-action mask not recorded (sampled)"; applied (derived) shown per slot. `Switch` `transition-all` →
  `transition-transform` (translate), `transition-colors` → `MOTION.colors`; null-padded slots filtered out of
  the "Follow one node" chips (scout R1).
- **App.tsx** — keyed `MOTION.enterFade` wrapper per page/episode (D-24, opacity only); lifted
  `playerPreferences` state passed to `PlayerPage`.
- **ChartsView.tsx** — `preferredMetric`/`onMetricChange` props; falls back to the first available metric.

### WP-3 Decisions UI (`components/decisions/`)
- **DecisionStrip** — two stacked canvases at DPR, ResizeObserver, one bucket per CSS px; reward min→max
  bars, hatched gap columns, violet 3 px revalidation tick, accent selection line, translucent brush; base
  repaints on {width,dpr,domain,index}, overlay on hover/selection/brush; hover readout below (aria-live);
  keyboard ←/→/Home/End/PageUp/PageDown/Esc scoped to the focused strip; drag → `onBrush`, click → nearest
  present decision, double-click clears. No DOM per decision.
- **DecisionList** — 32 px rows, overscan 8, only visible rows rendered from `makeRowIndex`; collapsed gap
  rows; keeps the selected row in view; buttons with `aria-pressed`/`aria-current`.
- **DecisionDetail** — Inputs (n−1) / Action / Context / Raw groups with exact unavailable copy; mask grid
  with focused slot highlighted; "applied (derived) — no revalidation recorded"; incident links at the shown
  frame (SINR/MCS/RX/capacity per link, no averages) only when mapped and a slot is focused; reward
  components via `componentColor`; `valid`/`source` badges; Raw `<pre>` capped at 64 KB; text ghost
  Prev/Next (no arrows). No causal wording.
- **SlotChips** — `aria-pressed` pills, disabled empty slots, horizontal rail, filter input above 12 slots,
  scene-color dot when mapped.
- **ActionGlyph** — `actionColor`, meaning in `title`/aria, ring + "R" badge when revalidated.
- **DecisionExplorer** — composition and the §5.1 states (loading skeleton, not saved, large-episode explicit
  load, error, empty, reset-only, ready, linkage-unavailable note); focused second strip + "Show all".
- **ui/Skeleton.tsx** — flat `bg-muted/15 animate-pulse-soft` bars.

### WP-4 charts — MetricChart `Line`: `type="linear"`, `connectNulls={false}`, `isAnimationActive={false}`.

### WP-5 motion (subagent, verified by me) — D-20 tokens; `styles/motion.ts` exactly as D-21; D-22
reduced-motion block; D-23 `:focus-visible` ring (`theme(colors.accent.DEFAULT)`), range-input outline
suppression removed, thumb ring per engine; `transition-all` removed everywhere (Segmented, EpisodeDetails);
Button adds `type="button"`, `aria-label`/`aria-pressed` passthrough, `active:translate-y-px` + lift on
primary/secondary/ghost; Segmented `aria-pressed`; Disclosure grid-rows 0fr→1fr with `aria-expanded`
(children still mount only when open, so close snaps); Skeleton adopted in ExperimentPage/TrainingRunPage
loading states; RunsPage result set fades as a whole on filter change; `tests/motionPolicy.test.ts`.

### WP-6 docs — CLAUDE.md (two lines), README "Decisions tab" subsection + corrected "Decision timing"
paragraph (it previously described the n mask as the decision-time mask).

## Deviations from the plan (and why)
1. `DecisionIndex.ticksInStep` added (not in §4.1) — required for `decisionAtTime` on the index alone.
2. Extra `NodeMapping` reason for a duplicated slot id (plan listed none for this check).
3. `focusSlot` lives in `PlayerPage`, not the explorer (D-7 says the explorer owns it): scene→slot sync is a
   plain state write instead of a two-way effect; behaviour is as specified.
4. `transition-colors` in files **not** on the plan's list (InfoPanel.tsx, NavRail.tsx, ui/PageHeader.tsx,
   rl/ExperimentSetup.tsx) left as-is per the "never touch unlisted files" rule; they use Tailwind's default
   150 ms colour transition and contain no `transition-all`. Also untouched plain "Reading…" text:
   App.tsx:235, EpisodeDetails.tsx (3), NavRail.tsx, rl/EvaluationInsights.tsx.
5. Large-file path: no chunked parser was added — measured whole-text `parseSteps` is 0.2 s for 36 MB
   (200k decisions) so the 64 MiB auto threshold + explicit load is the approved A-1 shape; a chunked reader
   is not needed by measurement.
6. No `src/vite-env.d.ts` exists and it is not a listed file, so the env override is read through a loose
   `import.meta` cast.
7. Mobile panel uses a JS media query (one mounted panel) rather than CSS `hidden`, to honour "without
   duplicating mounted tab content".
8. Test agent's stress case uses `sampledEvery: 2`, so its 1,000 joins are all `missing_source` (exact-hash
   joins are covered by the dense test). The agent's stray `feature-research/phase-4-decision-explorer-tests/`
   audit was removed; its content is folded into this file.
9. §5.2 "two-column detail/list only if width permits": implemented with a `min-[1600px]` grid breakpoint
   instead of a measured container width.

## Test / build results (original Implementer pass)
- `npm test`: 144 tests, 143 pass, 0 fail, 1 skipped (pre-existing "smoke: real bypass-matrix root").
- `npm run lint`: exit 0, no problems. `tsc` (via `npm run build`): clean; Vite build ✓ (existing >500 kB
  chunk warning unchanged).
- `grep transition-all src` → 0. Prettier clean on every touched file (two pre-existing untouched test files
  — jammers/rlLabels — already fail `--check` on main).
- Measurements: see measurements.md. Index build 2–12 ms @12k, 10–14 ms @200k; bucketize(1600) 3–6 ms
  @200k; parse 10 ms @12k / 200 ms @200k — all inside the §11 proposal.

## Not done / open risks
- **Original Implementer pass:** Browser charter §10 (B-1…B-14), P-2 FPS delta, P-3 heap, P-4 input delay, WP-0 baseline FPS: NOT run.
  The Claude-in-Chrome extension reported "not connected" on two attempts; the dev server itself started
  (`/api/outputs` lists 992 eval `steps.jsonl` from the sibling simulator checkout, e.g.
  `custom/09-25/rl-experiments/5-calfex-…/eval/delivery-snr-movement/train-seed-1/random_valid/episode-0002`).
  The later reviewer-blocker repair performed a partial live browser pass; see the addendum below and
  `measurements.md`. The remaining checks still need evidence before Reviewer sign-off.
- Real local contracts have `hold` at index 4 and `tick_s` 0.5 (121 records); no duplicate/non-integer
  decisions seen in the files inspected (stop conditions 2/3 not triggered).
- RunsPage `key={query}` remount resets any local row state on each keystroke (by spec).
- Disclosure's inner `overflow-hidden` may clip a 2 px focus ring at its edges.
- `ChartsView` publishes the metric preference via an effect on mount, so opening Charts once records the
  default metric as a preference (harmless; validated against availability on restore).

## WP-7 gate (REQUIRED, GATED — not implemented)
Waiting for G-1 (schema at an immutable simulator commit, SHA-256 recorded), G-2 (synthetic fixtures), G-3
(byte-identical vendored schema under `src/schemas/`), G-4 (`tests/decisionRecordSchema.test.ts` pin +
semantic validation). G-5 (CLI opt-in, adjustable 64 MiB per-episode on-disk cap, absent
`rl_episode.json.decision_records` pointer when off → "not saved") is already approved and reflected in the
README wording. Until then: no `policy_decisions*` allowlist entries, types, or preference UI exist.

## Reviewer-blocker repair (2026-10-01)

The new review identified three blockers. Two code defects are repaired:

1. `DecisionStrip` now obtains selected, brushed and hovered pixel columns from `columnForDecision`, the same owning-column rule as `bucketize`. This fixes the real-sized 121-decision/600-column case where decision 1's marker appeared over decision 0. Hovering a shared empty pixel now resolves the owning saved bucket rather than falsely announcing "outside saved range". A regression test covers 50- and 600-column strips, shared empty columns, and a sampled missing decision.
2. `DecisionExplorer` memoizes `fullDomain` and `navRange`. Playback frame renders no longer create new array identities that invalidate the strip's bucket/paint dependencies and the list's row index/scroll effect.

The third blocker, missing browser evidence, was partly addressed with a real GUI pass. `measurements.md` records B-1…B-14 individually, including model, hold, random, geometric and optimization evaluation replays; seek, brush, keyboard and responsive behavior; and a 1 KiB explicit-load test. It explicitly leaves B-4, B-9, B-13, the unverified portions of other B-checks, and WP-0/P-2/P-3/P-4 instrumented measurements pending. **Do not treat this as full §10/§11 sign-off or a PR-ready claim.**

Repair validation: `npm test` 145 tests / 144 pass / 1 pre-existing skip; `npm run lint` pass; `npm run build` pass (existing bundle-size and Browserslist-age warnings); Prettier check of the four repaired source/test files pass. The private outputs, simulator repository, and unrelated Implementer changes were not edited. No commit or PR was made.
