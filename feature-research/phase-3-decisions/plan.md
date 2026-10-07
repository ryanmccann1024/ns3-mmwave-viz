# Phase 3 GUI plan — visual node-decision explorer

Status: **REVISED FOR HUMAN REVIEW; production consumer is conditional on the producer feasibility gate.** The canonical proposed DR-1 semantics are in the simulator plan §4 at `/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim/feature-research/phase-3-decisions/plan.md`. This document references that contract; it does not redefine it. Keep both research plans out of commits.

## 1. Outcome and current foundation

Click a node in the existing player to inspect recorded decisions across evaluation and recorded training episodes: exact pre-action inputs, valid choices and requested/applied action, the following reward, and (only when scientifically validated and identity-matched) estimated input influence. Reuse the scene, player clock, per-link charts, telemetry readers and theme. Do not build a second viewer or imply probabilities establish WHY.

Verified locations: `src/App.tsx` constructs an `rl` context only for evaluation playback and keys `PlayerPage` by episode directory; training playback has `rl=null`. `src/components/EpisodeDetails.tsx::DecisionView` currently displays record n's **post-action** mask next to action n. `src/lib/episodeTelemetry.ts` parses `steps.jsonl` and maps playback time to a completed action's half-open outcome interval. `src/components/pages/PlayerPage.tsx` keeps scene-selected node as a numeric CSV index, while the RL node filter is a string ID. `src/lib/resultCatalog.ts` allowlists names and intentionally excludes large training rollout step files. Existing SINR/capacity is per **link**. This is React/TypeScript; existing pure-library tests live in `tests/`. There is no confirmed component/browser test harness.

The branch is `feat/baseline-gui-consumer`, with only untracked research reports at review time; GUI PR #4 is draft and stacked on GUI PR #3. The new GUI PR should be stacked on the Phase 2 branch if it still exists and is the approved base. Git-PR, not Implementer, creates branches or PRs. Recheck branch/PR status at that stage.

## 2. Rollout tiers

1. **T0 (legacy steps only):** fix the existing mask/action misjoin; offer stable node selection, exact decision navigation, action/mask/reward context from data actually present. If steps or n-1 are absent, show a compact unavailable state. Old ordinary runs and evaluation playback continue.
2. **T1 (DR-1 decision sidecar):** optional per-episode sidecar adds exact pre-action context, recorded preferences where available, requested/revalidated/applied distinction, coverage/cap status, and bounded recorded-training inspection. It must not be necessary for ordinary playback or comparisons.
3. **T2 (validated explanation sidecar):** show signed group estimates only when the offline method's reviewed validation gate passed *and* this record matches decision/model/observation/schema/mask/method/reference identities. A per-run `verdict=pass` string alone is insufficient. Missing, stale or scientifically rejected analysis is “Influence unavailable,” never zero influence.

Do not declare T1/T2 complete with a pending or skipped schema-pin test. The producer first freezes and commits valid JSON Schemas and representative synthetic fixtures; the GUI then vendors byte-identical copies, pins SHA-256, and tests against real producer-format synthetic output. A GUI T0 PR can be reviewed independently if the producer contract remains pending, but do not merge a consumer that silently assumes unavailable mandatory data.

## 3. Exact time and identity joins

- Existing telemetry uses integer `decision` (reset 0; actions n≥1), not `step_index`. Build a map by the actual `decision` value. The pre-action state for action n is record **n-1** only if that exact value exists and, when DR-1 is present, its observation hash matches. The previous saved row is not a substitute.
- Record n describes the outcome interval `(time_s - ticks_in_step*tick_s, time_s]`. Clock scrubbing selects the action whose **outcome interval contains the current time**, not “last decision with outcome time ≤ clock.” Decision jumps seek a representable playback frame at the chosen boundary and pause; define and test rounding when the CSV frame cadence cannot hit that time exactly. No invented intermediate decision.
- Match node by stable **string node ID** through each episode's `node_ids` and `slot_node_ids`; do not equate a CSV array index across runs. On episode change, preserve the ID only if present; otherwise show unavailable rather than selecting a different slot. Preserve compatible tab/chart choices, pause and cancel obsolete loads.
- Action sent, revalidated slot indexes, and derived applied action are separate. C++ substitutes hold (index 4) for revalidated slots. Reward is network-wide unless the recorded reward schema explicitly says otherwise.
- Reset/terminal states are not fabricated policy decisions. Missing/capped/failed records retain explicit coverage and gaps.

## 4. UI design and performance

Use the approved synthetic dashboard's layout **only** as a visual reference. The written refinements supersede its screenshot: visible top-row node chips (bounded rail/search for large node counts), concise visual Why/Inputs/Action tabs, optional Charts selection, collapsible episode overview/reward detail, one shared playback cursor, and restrained existing glass/ink/blue styling. Never copy its fake model, influence values, event thresholds or reward formula.

Inputs distinguish recorded raw facts from the actual normalized/model vector; the GUI does **not** reimplement observation presets or reconstruct the vector from feature names. Action uses the recorded five-action meanings and mask, labels probability as probability (not confidence), and marks blocked choices visually beyond color alone. Why names the chosen-versus-valid-alternative score contrast and methodology; signed estimates are not causal reasons. If the selected node's preset never observed SINR, do not suggest SINR directly drove its choice. Scope/highlight incident **links** in existing SINR charts; do not silently average them into node SINR.

For thousands of decisions, show overview → selected range → exact record. Aggregate with pixel-aware min/max envelopes that preserve gaps and spikes; exact selected values always come from raw records. Optional event jumps need documented definitions and nonwrapping behavior. Avoid one DOM element or marker per decision. Parse/index an active episode once, cancel stale requests, bound caches, and measure whether chunking/worker work is needed. Do not invent arbitrary 1.5-second/8-ms budgets without measuring the existing player and agreeing on an acceptance machine. No new runtime dependency absent approval.

Reuse existing UI primitives and theme. Keyboard/touch/focus/reduced-motion behavior is part of this panel; app-wide microanimation polish remains Phase 4. Do not reserve `[ ]` or numeric keys until existing bindings and focused-input behavior are checked.

## 5. Data-layer implementation after producer contract freeze

- Add the optional sidecar filenames to `src/lib/resultCatalog.ts`'s allowlist only after checking all discovery paths (dev server, File System Access, classic folder picker). Do not eagerly load large JSONL for every catalog entry; load the selected episode on demand. Training rollout access must remain bounded rather than removing the existing catalog guard wholesale.
- Extend `src/lib/episodeTelemetry.ts` with an exact-input lookup by `decision`; fix `EpisodeDetails.tsx::DecisionView` and add regression tests for reset, full cadence and sampled/missing n-1. This T0 fix is independent of DR-1.
- Introduce focused parser/join modules under `src/lib/` once DR-1's actual schemas are frozen. Validate **every consumed record or a provably equivalent validated index**, not only the first 100 lines. Unknown versions, malformed files, hash/identity mismatches and partial/capped coverage yield precise states; capped valid records may remain usable with a warning. The browser reads artifacts; it never loads the model or runs attribution.
- Centralize selected string node ID in the player while mapping to scene CSV index and RL slot separately. Integrate evaluation and recorded-training episode context in `App.tsx`/`PlayerPage.tsx` without breaking ordinary/baseline runs. Keep episode selection, chart selection, current clock and decision navigator synchronized.
- Add a compact Decision Explorer component using existing `EpisodeDetails`/charts rather than precommitting to eight tiny components. Start with two selectable relevant charts; expand only if the existing charts/observation schema support it. Maintain useful unavailable states for old runs, non-controlled nodes, missing diagnostics, sparse/capped capture, invalid alternative and absent training-time model.
- Vendor both producer JSON Schemas byte-for-byte after publication. The pinned SHA-256 values belong in a passing test, not a placeholder. Keep fixture data synthetic; no real run outputs, private observations or model files in Git.

## 6. Verification and review gates

Pure tests: exact n-1 lookup and half-open interval boundaries; node ID/slot/CSV mapping; sidecar schema/hash/coverage states; action and reward semantics; episode-switch cancellation/persistence; old run behavior; bounded aggregation/gaps/event jumps. Where no component test harness exists, the Planner/Reviewer must specify a focused browser charter instead of pretending such tests already run in CI. Measure a synthetic 12,000+ decision episode and a representative multi-link CSV episode on the same machine before/after; record parse, interaction and chart costs. Inspect normal/narrow/reduced-motion layouts with keyboard and touch.

The consumer PR is conditional on: (a) producer feasibility and DR-1 freeze; (b) producer-format fixtures and schema pin; (c) T0/T1 compatibility; (d) scientifically accepted explanation evidence before enabling T2 bars. If attribution fails the gate, retain useful T0/T1 context and return the unfulfilled WHY requirement to the human—do not quietly claim Phase 3 finished.

## 7. Stage and stop rules

Next work is the **simulator feasibility slice** in the producer plan §6A, not full GUI implementation. While it runs, a separate GUI read-only design/data-layer preflight may inspect existing components and propose T0 tests, but no consumer file should be changed against a provisional schema. After human/Codex gate acceptance, plan producer and consumer implementation with distinct file ownership and separate Reviewer/Tester/Git-PR stages. No Implementer performs Git branch/PR changes.

Stop and request a contract decision if the producer cannot provide exact pre-action identity, a valid same-decision mask/preference pairing, safe training context, or a publishable schema. Stop if a GUI view would need to infer model inputs from raw facts, treat a sampled row as n-1, or show explanation bars without validated matching analysis.
