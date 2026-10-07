# Decision Explorer (T0 + T1) and app-wide motion — private implementation plan

Status: **APPROVED FOR IMPLEMENTATION, WITH THE PRODUCER SCHEMA GATE. Nothing implemented.** T0, T1 and app-wide motion are the complete requested scope. T0/motion may start in parallel with the simulator producer; T1 is an ordered, required work package after its schema is reviewed and published. A T0-only GUI release is not completion of this plan.

Human decisions (2026-10-01): keep the anchor-based geometric/optimization baselines from PR #15 unchanged for now; reconsider gateway-free comparisons later, without fabricating an anchor in the GUI. Decision recording is CLI opt-in initially, with future INI control documented as a simulator TODO. The adjustable 64 MiB default is an **on-disk, per-episode sidecar cap**, not a GUI memory limit; capped recordings must display partial coverage. When recording is off, the producer omits `rl_episode.json.decision_records` entirely and the GUI treats an absent pointer/sidecar as "not saved," not as an error. The user will run the two Implementer sessions; the GUI's T1 consumer still waits for the producer schema gate.
Repo: ns3-mmwave-viz, branch base `feat/baseline-gui-consumer` @ `96a02ed3`.
Inputs: approved scope, both Scout reports, reviewed feasibility findings, simulator producer plan, and targeted GUI/simulator source inspection during this revision (2026-10-01). The producer schema itself is not yet published.

---

## 0. Reading guide

| Section | What it settles |
|---|---|
| 1 | Objective, user-visible outcome |
| 2 | Current behavior (Scout) |
| 3 | Decisions (numbered D-1 … D-40), approach, tiers and gates |
| 4 | Data contracts (types the Implementer must produce verbatim) |
| 5 | UI specification: states, layout, responsive, copy |
| 6 | Motion system + coverage matrix |
| 7 | Invariants: data, security, failure |
| 8 | Exact implementation steps (work packages WP-0 … WP-6) |
| 9 | Tests authorized |
| 10 | Manual browser charter |
| 11 | Accessibility and performance checks |
| 12 | Stop conditions |
| 13 | PR stack and commit plan |
| 14 | Explicit exclusions |
| 15 | Files touched |
| 16 | Approved GUI defaults and remaining producer gate |
| 17 | Combined-feature completion gate |

Labels used throughout:
- **NOW** — authorized for implementation now.
- **GATED** — required implementation, sequenced after the T1 gates in §3.4 are green; not silently deferred or omitted.
- **Approved default** — use the §16 direction unless measurement or a contract conflict requires a new decision.

---

## 1. Objective and user-visible outcome

### Objective
Give a viewer a **Decisions** panel for evaluation episodes and, once DR-1 is available, recorded training episodes. T0 shows only the pre-action evidence actually present in `steps.jsonl` (mask, observation hash, optional raw facts), requested/derived-applied action and network-wide outcome. T1 adds the producer's exact pre-action vector/reference and recorded model preferences where available. Neither tier proves a causal reason for a PPO action. Keep the 3D playback synchronized, fix the existing n/n−1 mask pairing, and add restrained app-wide motion/focus across all six page families.

### User-visible outcome (after this phase)
1. In `PlayerPage`, the existing right-hand Episode/Overview/Nodes/Log tab set gains **Decisions** for evaluation episodes. On narrow screens, where that sidebar is currently hidden, the same tab content becomes reachable below the scene via a mobile tab rail. After T1, selected recorded training episodes can use the panel without pretending they have evaluation-model preferences.
2. The tab shows: a row of per-slot node chips; a canvas timeline strip over the full decision range (x = decision integer; gaps are visible holes); a detail card for the selected decision with three compact groups **Inputs / Action / Context**; a windowed list of decisions in the selected range; a collapsed **Raw record** disclosure.
3. Clicking a decision pauses playback and seeks the 3D scene to the end of that decision's outcome interval. Clicking a node in the scene, when the node mapping is proved, focuses that node's slot in the explorer without leaving the Decisions tab.
4. Every field that cannot be proved from the data shows an explicit **unavailable** state with a reason — never a guess, never an interpolated row.
5. `EpisodeDetails` pairs action n with the mask from record n−1.
6. T1 adds optional decision-record coverage/gaps, exact input identity/vector and model preferences to this same panel; it is a required deliverable, gated on the producer contract rather than a future unspecified phase.
7. App-wide: buttons, rows, chips, tabs, disclosures, page mounts, loading/error/empty states use shared timing/easing tokens; `prefers-reduced-motion` disables them; keyboard focus is visible everywhere (including range inputs); no `transition-all` remains in `src/`.
8. Metric charts no longer smooth spikes or bridge gaps and no longer animate on data change.
9. Switching episodes quickly never shows the previous episode's frames or telemetry.

Not visible until T1 passes its gate: anything that depends on `policy_decisions.jsonl` (model preferences, logits). It is part of this plan, not a separate unplanned phase.

---

## 2. Current behavior established by Scout

### 2.1 Data (`steps.jsonl`)
- Header: `telemetry_version=1`, `contract { node_ids: string[], slot_node_ids: (string|null)[], action_meanings, tick_s }`, `observation_schema`, `reward_schema`, `selection`.
- Record: integer `decision`, integer `tick`, numeric `time_s`, `ticks_in_step`, `action_sent: number[] | null` (null at reset), flat 0/1 `mask`, `reward: { total, components?, valid?, source? } | null` (null at reset), `revalidated_slots: number[]` (slot indexes), optional `legacy_reward`, optional `facts`, `obs_sha256`.
- No policy logits/probabilities. No complete observation vector. `reward_context` exists only in a dirty simulator checkout, not in PR #15 — **not required, not consumed**.
- Decision 0 is reset. For action n ≥ 1: pre-action observation hash + mask live in record n−1; action, revalidation, network-wide reward live in record n. Record n describes the outcome interval `(time_s − ticks_in_step·tick_s, time_s]`. Decision 0 has no action/outcome window.
- Sampled runs omit decision integers. Key by the integer `decision` value, never by array row.
- Requested action = `action_sent`. Applied action is **derived**: each revalidated slot → hold. An empty revalidated list does not universally prove equality for non-MeshRlEnv senders.
- Contract node IDs are strings; slots can be null-padded. CSV `NodeState.id` is numeric parsed from `node_id`. The simulator source establishes the **ordinal** contract-ID → CSV-ID mapping for this format (§3.2 D-6); each loaded episode must still pass the roster checks before GUI cross-sync is enabled.
- `Episode.policy ∈ {model, hold, random_valid, geometric, optimization}`; standalone baselines are ordinary playable runs when CSVs exist; training episodes come from `train_manifest.json` as `TrainingEpisode`. No preference/model identity is to be invented for training, hold, random, or placement baselines.

### 2.2 Proposed producer contract (NOT frozen)
- Simulator Planner proposes opt-in `policy_decisions_manifest.json` + `policy_decisions.jsonl` per `episode-NNNN/`, and `docs/schemas/decision_record.v1.schema.json` — the schema is **not written or approved**; no SHA-256 exists.
- Feasibility: 7 PASS / 0 FAIL on synthetic work; six production validations blocked. Attribution/influence is **NO-GO**.

### 2.3 GUI
- `src/App.tsx`: state-driven pages Home, Runs, Experiments, Experiment, TrainingRun, Player. Playing kinds: run, episode, training. RL context passed to `PlayerPage` only for evaluation episodes; training gets `rl=null`. `PlayerPage` keyed by directory → remounts per episode.
- `src/hooks/useSimData.ts`: `frames, frameIndex, currentFrame, frameAlphaRef, play(), pause(), seek(frameIndex), loadFiles(), reset()`. No seek-by-time; `seek()` neither clamps nor pauses; RAF advances by `tickMs/speed`; `loadFiles()` has no stale-request guard.
- `src/components/pages/PlayerPage.tsx`: local `view, tab, selectedNode: number|null, selectedLink, selectedFlow`. Scene node click forces Overview. Episode sidebar hidden below `lg`. RL trail selection uses a separate string node ID.
- `src/lib/episodeTelemetry.ts`: parses whole `steps.jsonl`, retains `facts`; exposes `decisionWindow()`, binary-search `decisionAt()`, `slotActions()`, `maskBySlot()`, `rewardSeries()`. `EpisodeDetails.tsx` pairs record n's post-action mask with action n (bug). Telemetry re-read when its `Disclosure` remounts.
- `src/hooks/useMetricSeries.ts`: SINR, RX Power, capacity, throughput, latency, MCS — SINR/capacity/RX Power/MCS are **per link**. `ChartsView.tsx` selects one metric. `MetricChart.tsx`: Recharts `Line type="monotone"`, `connectNulls`, no `isAnimationActive={false}`.
- Data layer: `resultCatalog.ts` lazy root-relative catalog (paths/has/getFile), normalized paths, allowlisted reader filenames; sources dev server / File System Access / folder picker. `vite-plugin-outputs.ts` read-only `GET /api/outputs`, `GET /outputs/...`. `experimentIndex.ts` (`Evaluation, Episode, EpisodeFilePaths, EvalContract`). `trainingRun.ts`. Training rollout cataloging excludes large files except `rl_episode.json`.
- UI: `Button` (primary/secondary/ghost/icon-round/link), `Segmented`, `Disclosure`, `Breadcrumbs`, `Badge`, `ReplayPicker`, `ExperimentStatus` (`Note`, `StateBadge`). `tokens.ts`: `ACTION_COLORS/actionColor`, `componentColor`, `trailColor`. Tailwind: ink/muted/hairline/accent, glass/control shadows, **no motion tokens/keyframes**. Scattered `transition-colors`/`transition-all`. `index.css`: no `prefers-reduced-motion`, no `focus-visible`; range input removes outline.
- Tests: `npm test` = `node --experimental-strip-types --test tests/*.test.ts`. Pure tests only; no Vitest/Testing Library/browser harness.
- Prior baseline work (reuse, do not redo): `baselineManifest.ts`, `baselineRuns.ts`, `scenarioGroups.ts`, `BaselineInfo.tsx`, plus edits to catalog/assembleRuns/experimentIndex/rlLabels/tokens/useWorkspace/shared rows/pages/EpisodeDetails/App.
- Scale: no known max decision count; design for ≥12,000 and a longer synthetic stress case; measure before assigning numeric budgets.

---

## 3. Decisions and implementation approach

### 3.1 Tiering

| Tier | Source | Status |
|---|---|---|
| **T0** | `steps.jsonl` only (existing, in PR #15 shape) | **NOW** |
| **T1** | `policy_decisions_manifest.json` + `policy_decisions.jsonl` | **REQUIRED, GATED** (§3.4); implement after producer contract publication |
| T2 | validated influence/attribution | **OUT OF SCOPE / NO-GO** — not designed, not stubbed |

### 3.2 Core decisions (T0)

**D-1 Placement.** `PlayerPage` has two different controls: header `3D/Charts` chooses the left visualization; the `Episode/Overview/Nodes/Log` tabs live in the right sidebar and are hidden below `lg`. Add `Decisions` to the **sidebar tab set**, not to `3D/Charts`. On `xl`, widen the aside while Decisions is active (bounded at approximately half the viewport) and keep the scene visible; on `lg` use a single-column explorer in the aside. Below `lg`, add a compact accessible tab rail and panel **below the scene/playback controls** for the sidebar tabs, including Decisions, without duplicating mounted tab content. The mobile panel scrolls independently; the scene retains a usable minimum height. Preserve the existing desktop tabs and ReplayPicker behavior.

**D-2 Eligibility.** Evaluation episodes show Decisions whether or not `steps.jsonl` was saved; if absent, render a concise "Decision telemetry was not saved" state rather than hiding the feature. Plain standalone runs do not get it. T0 cannot inspect training rollout decisions because the existing catalog excludes their large step files; T1 adds **selected-episode, on-demand** access to the producer's training sidecars without removing that catalog guard wholesale. Training episodes then show recorded context/action/reward but never invented preference or decision-time model identity.

**D-3 Keying.** All explorer state is keyed by the **integer `decision` value**. No code path may address a record by array row except inside the index-building function and binary search helpers. The index validates unique integer decisions and monotone integer ticks/finite times before time binary search; malformed order is an explicit error, not silently sorted into a fabricated trajectory.

**D-4 Join rule (exact).** For selected decision n:
- `kind = 'reset'` iff n === 0 (or the record has `action_sent === null` and `reward === null` — both must hold for n === 0; if a record with n > 0 has `action_sent === null` it is rendered as `action: unavailable (reason: "no action_sent in record")`, never as reset).
- `input` = record **n−1** (exact integer lookup). If record n−1 is absent (sampling gap), `input.status = 'missing_source'` and the Inputs group renders unavailable. **No substitution of the nearest earlier row.**
- `action` = record n `action_sent`, `revalidated_slots`.
- `outcome` = record n `tick, time_s, ticks_in_step, reward`; interval `[time_s − ticks_in_step·tick_s, time_s]` displayed as `(start, end]`.

**D-5 Applied action (derived).** `holdIndex = resolveHoldIndex(contract.action_meanings)`: the index whose meaning, trimmed and lower-cased, equals `"hold"`. If exactly one such index exists → applied = requested with each `revalidated_slots[i]` replaced by `holdIndex`; label **"applied (derived)"**. If zero or multiple → applied is `unavailable`, reason `"no unique 'hold' action in contract.action_meanings"`. The known contract has hold at index 4; the code must **not** hard-code 4. When `revalidated_slots` is empty the UI label is "applied (derived) — no revalidation recorded"; it never says "identical" or "verified".

**D-6 Node identity mapping (checked, ordinal).** The simulator source establishes the mapping for this output format: `rl-bridge.cc` fills `node_ids` in `cfg.nodes` order; `TopologyBuilder::GetMobilityModels()` preserves that order; `VizWriter::WritePositions()` writes the mobility-vector index `i` as the numeric CSV `node_id`. Real contract IDs are commonly strings such as `node-a`, **not decimal strings**. New pure module `nodeIdentity.ts` maps `contract.node_ids[i] ↔ CSV id i` only when the node IDs are unique nonempty strings, each non-null `slot_node_ids[s]` occurs exactly once, and the loaded frame contains the expected numeric IDs `0…N−1` with no extras/duplicates. During the existing `loadFiles` pass, parse the already-read archived `nodes.json` ordered IDs into `sim.declaredNodeIds` with separate `absent|valid|invalid` states; a present-but-invalid file or an ordered-ID mismatch disables cross-sync. Do not fetch it again or change CSV parsing. Never infer mapping from string-to-number coercion or a partial roster. When unavailable, chips remain usable for slot-local records but scene synchronization and incident-link context are disabled with a short reason.

**D-7 Selection model.**
- `PlayerPage` owns `selectedDecision: number | null` and `decisionRange: [number, number] | null` (inclusive decision integers).
- The explorer owns `focusSlot: number | null` (slot index — the native key of action vectors).
- Sync: chip click → `focusSlot = s`; if mapped and `slot_node_ids[s] !== null` → also `setSelectedNode(csvId)`. Scene node click → existing `setSelectedNode`; if mapped → `focusSlot = slotByCsvId.get(id) ?? null`. When unmapped no cross-sync occurs. For an uncontrolled node, show "Not policy-controlled" rather than selecting a different slot. Existing RL trail string-ID selection is coordinated by the mapped contract ID when possible, not silently left divergent.
- Scene node click **no longer forces Overview when the current tab is Decisions**; other tabs keep existing behavior.

**D-8 Seek.** Selecting a decision calls `pause()` then finds the **latest actual frame inside** its outcome interval `(start, end]`, using a documented small time tolerance. If `tick_s` is unavailable or no frame lies in that interval, show "No playback frame at this decision" and do not falsely align the scene. Reset uses a frame at reset time within tolerance. A missing n−1 input does not prevent seeking when the outcome interval is known. Seek never happens on hover or range brush.

**D-9 Strip rendering.** `DecisionStrip` = two stacked `<canvas>` elements (base: buckets; overlay: hover/selection/brush), sized to container width × 72 px (CSS px) at `devicePixelRatio`. Domain is **decision integers** from reset/first observed through a validated declared `num_decisions` when available; otherwise stop at the last observed decision and label trailing coverage unknown (never fabricate a tail). Gaps appear as empty columns. Bucket = one CSS pixel column; each bucket aggregates over the decisions it covers: `count, minReward, maxReward, revalCount, hasGap`. Reward column is drawn as a vertical min→max bar (exact value when count === 1); gap buckets as a hatched hairline-colored band; selection as a 1 px accent line; brush range as a translucent accent fill. **No DOM node per decision.** Base canvas repaints only on `{width, dpr, range, index identity}` change; overlay on hover/selection change. Hover resolution = binary search; never a linear scan on pointer move.

**D-10 Overview → range → exact decision.** The first strip always shows the full domain. Dragging a range reveals a **second focused strip** using the same bucket renderer over that range, so thousands of decisions remain selectable without pixel-level guessing. The bounded list and prev/next then scope to the range by default; a clear "Show all" control restores the whole episode. Double-click/"Reset range" clears the brush. Clicking a bucket with multiple decisions selects its nearest recorded decision and exposes its count/range; the user can refine with the focused strip or list. No per-decision DOM markers.

**D-11 Windowed list.** `DecisionList` renders decisions in `decisionRange ?? fullDomain` using a fixed-row-height window (row = 32 px; overscan 8 rows) — **no virtualization dependency and no 200k-object row array**. A compact index/gap representation supplies row count and visible row-at-index on demand. Consecutive gaps render as one collapsed row "decisions a–b not recorded (k missing)". Row content: decision, `time_s` (3 dp), the focused slot's action glyph (or a compact joint-action summary when no slot is focused), revalidation indicator, reward total (3 dp) or "—"; never an unbounded glyph row for every node. Use ordinary focusable buttons in a labelled list unless full listbox keyboard semantics are implemented and tested; do not assign `role="option"` to buttons without the matching interaction model.

**D-12 Detail card groups (compact, visual, non-causal).**
- **Inputs** (from n−1): source decision, tick, `time_s`, `obs_sha256` (first 12 hex, full in accessible detail), per-slot mask as a tiny grid (valid/invalid cells; focused slot highlighted), and optional raw facts only when present and labelled as recorded context. T0 does **not** claim to display the complete observation vector or all model inputs. `missing_source` → group body replaced by unavailable state. T1 can add the exact vector/reference after its identity check.
- **Action** (from n): requested/action-valid/applied (derived) for the focused slot as concise visual marks, plus a small joint-action summary. Other slots remain reachable through a collapsed "All slots" disclosure, rather than displaying every word and row at once. Revalidated slots have a non-color marker and accessible label.
- **Context** (from n): outcome interval `(start, end]`, `ticks_in_step`, reward total, components (if present, color via `componentColor`), `valid`/`source` badges when present. When the mapping is proved and a slot is focused: **incident links** of that node at the currently seeked frame, listed per link with the per-link values the frame already carries (SINR, MCS, RX power as available — field names read from `useMetricSeries`). **No average, no "node SINR".** When unmapped or no focus: this sub-block is omitted (not "unavailable" — it's optional context).
- **Raw record** Disclosure (collapsed): pretty JSON of record n and record n−1 (`facts` and `legacy_reward` included verbatim). If the combined pretty JSON exceeds 64 KB render the first 64 KB and a "truncated" note (approved default).
- Nothing in the card uses the words *why, because, influence, driven, contributes, explains*.

**D-13 Telemetry loading.** New hook `useEpisodeTelemetry(catalog, stepsPath)` at `PlayerPage` level: loads once per PlayerPage mount, stale-guarded by a request token, and is shared by `EpisodeDetails` and `DecisionExplorer` (ends re-reading on disclosure remount). In-memory only; **no IndexedDB caching**. Check `File.size` before whole-text parse, report size and parse cost, and use a measured bound/worker or bounded indexing strategy for long episodes; the proposed 64 MiB cutoff is **not** a silent hard stop that makes the requested 12k+ decision view unusable. If a safety limit is needed, specify a deliberate user-visible load/stream path and test it before approval.

**D-14 `useSimData` changes (minimal).** (a) `loadFiles()` gets an incrementing request token; results from a superseded call are discarded (and `reset()` bumps the token). (b) `seek(i)` clamps to `[0, frames.length−1]`; it still does not pause. (c) `seekDecisionWindow(startExclusiveS, endInclusiveS)` uses `SimFrame.time` (verified in `src/types.ts`) and a binary-search helper to return the latest representable frame **inside** the half-open interval or `null`; it pauses and seeks only on a hit. The helper and tests define boundary tolerance, sorted-time requirements and reset handling. No nearest-outside-frame substitution.

**D-15 EpisodeDetails fix.** Replace the current action/mask pairing with `joinDecision(telemetry, n)` so the mask shown for action n is record n−1's. If n−1 is absent, show "pre-action mask not recorded (sampled)".

**D-16 Charts fix (small, in scope).** `MetricChart.tsx`: `type="linear"`, `connectNulls={false}`, `isAnimationActive={false}` on `Line` (and on any `Area`/`Bar` present). No other chart changes. Reward stays in telemetry, not in `useMetricSeries`.

**D-17 No new runtime dependencies.** No framer-motion, no react-window, no schema validator library. (T1 may propose a validator later; it is gated anyway.)

**D-18 Episode-switch preferences.** Keep only compatible UI choices across episodes in `App` (or the existing experiment session): stable selected **string node ID**, player tab and chosen chart metric. On the new episode, validate that the ID and metric exist before restoring; otherwise show no selected node/choose the normal available metric. Selected decision, brush range and any record-specific focus reset because decision indexes are episode-relative. Do not persist to URL/localStorage. The key-based `PlayerPage` remount remains for sim-local resources, but it must not silently select a different node at the same numeric slot.

### 3.3 Motion decisions (NOW)

**D-20 Tokens** in `tailwind.config.js` `theme.extend`:
```
transitionDuration: { fast: '120ms', base: '180ms', slow: '240ms' }
transitionTimingFunction: { standard: 'cubic-bezier(0.2, 0, 0, 1)', exit: 'cubic-bezier(0.4, 0, 1, 1)' }
keyframes: { 'fade-in': {from:{opacity:0},to:{opacity:1}},
             'rise-in': {from:{opacity:0, transform:'translateY(4px)'}, to:{opacity:1, transform:'none'}},
             'pulse-soft': {'0%,100%':{opacity:1}, '50%':{opacity:.55}} }
animation: { 'fade-in': 'fade-in 180ms cubic-bezier(0.2,0,0,1) both',
             'rise-in': 'rise-in 180ms cubic-bezier(0.2,0,0,1) both',
             'pulse-soft': 'pulse-soft 1.4s ease-in-out infinite' }
```
No gradients anywhere (skeletons are flat `bg-muted/…` with `animate-pulse-soft`).

**D-21 Allowed animated properties:** `color, background-color, border-color, opacity, transform, box-shadow` only. `Disclosure` may additionally animate `grid-template-rows` (0fr→1fr, 180ms). **`transition-all` is banned** (enforced by `tests/motionPolicy.test.ts`). Shared class strings live in `src/styles/motion.ts`:
```
MOTION.colors  = 'transition-colors duration-fast ease-standard'
MOTION.surface = 'transition-[background-color,border-color,box-shadow] duration-base ease-standard'
MOTION.fade    = 'transition-opacity duration-base ease-standard'
MOTION.lift    = 'transition-[transform,box-shadow] duration-fast ease-standard'
MOTION.enter   = 'animate-rise-in'
MOTION.enterFade = 'animate-fade-in'
```

**D-22 Reduced motion** in `index.css`:
```
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
                           transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```
Skeleton pulse becomes static (no flicker). No JS motion gating is needed because no JS-driven animations are introduced.

**D-23 Focus** in `index.css`: `:focus-visible { outline: 2px solid theme(colors.accent); outline-offset: 2px; border-radius inherits }`; remove the range-input outline suppression and give `input[type=range]:focus-visible` the same ring on the thumb (pseudo-element per engine). `:focus:not(:focus-visible) { outline: none }`.

**D-24 Page mounts.** `App.tsx` wraps the active page in a `key`ed `<div className={MOTION.enterFade}>` so each page change fades in (180 ms, opacity only). **No exit animations** (state-driven pages, no router). `PlayerPage` content is exempt from `rise-in` to avoid translating the canvas container on mount — fade only.

**D-25 Hot path exclusions (no transitions, ever):** the R3F canvas and its DOM container, the playback range input thumb position, the time/frame readout text, FPS/HUD readouts, `DecisionStrip` canvases, `DecisionList` rows while scrolling, `MetricChart` series. Only `color`/`opacity` transitions are allowed on playback **buttons**, not on anything updated per frame.

**D-26 Interruption safety.** All motion is CSS (interruptible by definition). Stale guards (D-13, D-14a) ensure a superseded load cannot paint over a newer one.

### 3.4 T1 gates (GATED — all must be green before any T1 code is written)

| Gate | Condition | Evidence required in the GUI repo |
|---|---|---|
| G-1 | Producer schema `docs/schemas/decision_record.v1.schema.json` is written, reviewed, pinned and available at an immutable simulator commit/PR head; its manifest/record field list is frozen | Record exact simulator commit and schema SHA-256 in the GUI plan/PR. Merge is welcome but **not required** before a stacked GUI PR can be prepared. Do not merge the GUI consumer before its actual producer dependency is available to its users. |
| G-2 | Producer provides **synthetic fixtures** covering: complete; capped; interrupted; writing; failed; with sampling gaps; with and without preferences; reset-only; training context; string node IDs and null padding | Fixtures generated from or validated against the published producer format and vendored under `tests/fixtures/decision_record/` (no real run output) |
| G-3 | Schema vendored byte-for-byte to `src/schemas/decision_record.v1.schema.json` | File present |
| G-4 | `tests/decisionRecordSchema.test.ts` asserts SHA-256 of the vendored schema equals the published value and validates **every consumed manifest/record**, including cross-record identity/coverage rules that JSON Schema alone cannot express | Test green, including malformed and mismatched negative fixtures |
| G-5 | Human approval of producer settings defaults (CLI opt-in, adjustable 64 MiB file cap, status edge cases, absent pointer when off) | **Satisfied on 2026-10-01**; match the approved simulator plan §5. G-1…G-4 still gate T1. |

Until G-1…G-5 are green: no allowlist entries for `policy_decisions*`, no types, no UI for preferences. The T0 UI contains **no placeholder** such as "model preferences coming soon". Once green, WP-7 below is part of this project's implementation and acceptance, not an optional future phase.

### 3.5 T1 implementation design (GATED; reconcile exact names against the frozen schema)

Written so reviewers can judge direction; every identifier below is provisional.
- `resultCatalog.ts` and its three adapters: make the two known sidecar filenames retrievable **on demand** for a selected episode. Preserve the existing 50k-entry cap and training-rollout exclusion for bulk discovery. For training, design a safe normalized-path `getKnownEpisodeFile(dir, allowedName)` capability: dev server can fetch a validated `/outputs/...` path, File System Access can descend a selected handle, and classic folder picker can retain a bounded lookup for selected known files without advertising every training rollout in `paths()`. Update `subCatalog` and tests. No generic arbitrary-path fetch.
- `experimentIndex.ts` / `trainingRun.ts`: expose optional sidecar references for selected evaluation/training episodes, using episode-relative identity; absence means "Decision records were not saved," never a parse error. `App.tsx` passes the selected training context to `PlayerPage` without manufacturing an evaluation or a model. Loading remains explicit and episode-scoped; do not eagerly parse every JSONL in an experiment.
- `src/lib/decisionRecords.ts`: validate the published schema version, manifest, every consumed reset/decision line and semantic invariants (integer n−1/tick join, hash form, string/null IDs, coverage partition, status and file byte/hash integrity). A bounded line/index strategy must preserve 12k+ decisions; unknown version or corruption gets a clear unavailable state. `writing|failed` are incomplete/error; `capped|interrupted` may show validated saved records plus explicit gaps/warning, never implied coverage.
- For a DR-1 decision n, use its **own recorded pre-action** `input.mask` and input identity; if exact steps record n−1 is present, require matching `obs_sha256`, mask and tick before displaying a combined view. If steps is sampled or absent, use the producer's exact `input.obs_vector` when present and label the missing `steps_ref`; never reject a valid DR-1 record merely because the optional steps row is absent. Keep schema-dtype `obs_sha256` distinct from float32 `model_input_sha256`.
- Add a compact visual preference panel only when the producer recorded it for an evaluation-model episode: per-slot masked-probability bars with chosen/valid alternatives, raw logits in optional detail, explicit "recorded preference, not a cause" wording. Training/callback/baseline/hold/random episodes show context/action/outcome without probability or decision-time model identity. Influence/attribution remains unavailable.
- Use the same node chips, timeline, seek and responsive surface for T0 and T1; sidecar coverage augments rather than replaces playback/steps telemetry. No explanation sidecar or influence bars.

---

## 4. Data contracts (types the Implementer must produce)

### 4.1 `src/lib/decisionExplorer.ts` (pure, NOW)

```ts
import type { ParseStepsResult, StepRecord, StepReward, SlotMask } from './episodeTelemetry';
export type EpisodeTelemetry = Extract<ParseStepsResult, { ok: true }>;

export type Unavailable = { status: 'unavailable'; reason: string };

export interface DecisionInput {
  status: 'exact';
  sourceDecision: number;   // n−1
  tick: number;
  timeS: number;
  obsSha256: string | null; // optional in older telemetry; null never means an exact vector was recovered
  mask: number[];           // flat, from record n−1
  maskBySlot: SlotMask[] | null; // via existing maskBySlot(); null if contract shape unknown
}
export interface DecisionAction {
  requested: number[];
  revalidatedSlots: number[];
  applied: { status: 'derived'; values: number[] } | Unavailable;
}
export interface DecisionOutcome {
  tick: number;
  timeS: number;
  ticksInStep: number;
  intervalStartS: number | null; // null when tick_s is unavailable
  intervalEndS: number;     // timeS
  reward: StepReward | null;
}
export interface DecisionJoin {
  decision: number;
  kind: 'reset' | 'action';
  input: DecisionInput | { status: 'missing_source'; sourceDecision: number } | null; // null for reset
  action: DecisionAction | Unavailable | null;   // null for reset
  outcome: DecisionOutcome | null;               // null for reset
  record: StepRecord;                            // record n (for Raw)
  sourceRecord: StepRecord | null;               // record n−1 or null
}

export interface DecisionGap { afterDecision: number; beforeDecision: number; missing: number }

export interface DecisionIndex {
  decisions: Int32Array;      // sorted ascending, unique
  timesS: Float64Array;       // record time_s
  rewardTotals: Float64Array; // NaN when reward null
  revalCounts: Uint16Array;
  gaps: DecisionGap[];
  minDecision: number; maxDecision: number;
  expected: number;           // validated contract.num_decisions when present; otherwise observed domain only
  coverageKnown: boolean;     // false when no trustworthy declared/terminal count exists; do not invent a trailing gap
  holdIndex: number | null;
  tickS: number | null;
}

export interface Bucket {
  x: number;                  // column index
  firstDecision: number; lastDecision: number; // domain covered
  count: number;
  minReward: number; maxReward: number;        // NaN when count === 0 or all null
  revalCount: number;
  hasGap: boolean;
}

export function resolveHoldIndex(actionMeanings: readonly string[]): number | null;
export function deriveApplied(requested: readonly number[], revalidated: readonly number[], holdIndex: number | null): DecisionAction['applied'];
export function buildDecisionIndex(t: EpisodeTelemetry): DecisionIndex;     // throws on duplicate decision ints
// recordForDecision(t, n) is imported from episodeTelemetry.ts, its sole owner.
export function joinDecision(t: EpisodeTelemetry, idx: DecisionIndex, n: number): DecisionJoin | null; // null if record n absent
export function nearestDecision(idx: DecisionIndex, decisionGuess: number): number;   // nearest present decision int
export function decisionAtTime(idx: DecisionIndex, timeS: number): number | null;      // preserve existing decisionAt() half-open semantics; null in unsaved gaps
export function stepDecision(idx: DecisionIndex, from: number, delta: 1 | -1, range?: [number, number]): number | null; // next present decision, skipping gaps
export function bucketize(idx: DecisionIndex, columns: number, domain?: [number, number]): Bucket[];
export function makeRowIndex(idx: DecisionIndex, range: [number, number]): { length: number; rowAt(index: number): { kind: 'decision'; decision: number } | { kind: 'gap'; gap: DecisionGap } | null }; // no whole-episode row object array
```
Complexities: `buildDecisionIndex` O(N log N) (sort), all lookups O(log N), `bucketize` O(N_in_domain + columns); the virtual row index stores only compact decision/gap metadata and resolves a visible row in O(log N), not an O(N) object array.

### 4.2 `src/lib/nodeIdentity.ts` (pure, NOW)

```ts
export type NodeMapping =
  | { status: 'mapped'; csvIdByContractId: Map<string, number>; contractIdByCsvId: Map<number, string>; slotByCsvId: Map<number, number>; csvIdBySlot: (number | null)[] }
  | { status: 'unavailable'; reason: string };
export function buildNodeMapping(contract: { node_ids: readonly string[]; slot_node_ids: readonly (string|null)[] }, csvNodeIds: ReadonlySet<number>, archivedNodeIds?: readonly string[]): NodeMapping;
```
Reasons (exact strings, used by tests): `"contract has no node_ids"`, `"duplicate or empty contract node id"`, `"CSV roster does not match contract order"`, `"archived nodes.json order differs from contract"`, `"slot_node_ids references unknown node <id>"`.

### 4.3 `src/lib/frameSeek.ts` (pure, NOW)
```ts
export function frameIndexForDecisionWindow(frameTimes: ArrayLike<number>, startExclusiveS: number, endInclusiveS: number, toleranceS: number): number | null; // latest actual frame in (start,end], null if none
```

### 4.4 `src/hooks/useEpisodeTelemetry.ts` (NOW)
```ts
export type TelemetryState =
  | { status: 'idle' } | { status: 'loading' }
  | { status: 'ready'; telemetry: EpisodeTelemetry; bytes: number }
  | { status: 'needs_explicit_load'; bytes: number; reason: string }
  | { status: 'error'; error: string };
export function useEpisodeTelemetry(catalog: ResultCatalog | null, stepsPath: string | null, options: { maxAutoBytes: number; allowLarge: boolean }): TelemetryState; // threshold set after measurement; explicit user action can load larger files
```

### 4.5 `PlayerPage` props/state additions (NOW)
- state: `selectedDecision: number | null`, `decisionRange: [number, number] | null`.
- tab union gains `'decisions'`.
- Derived: `telemetryState` (4.4), `decisionIndex` (memo on telemetry), `nodeMapping` (memo on telemetry + frames[0]).

---

## 5. UI specification

Visual reference only: `/Users/ryanmccann/Documents/Codex/2026-09-29/hell/outputs/decision-dashboard-preview.png` and the interactive mock at `/Users/ryanmccann/Documents/Codex/2026-09-29/hell/outputs/decision-dashboard/index.html`. Use their compact node selection and visual hierarchy as inspiration, then conform to the actual GUI's glass/ink/blue components and responsive player layout. The mock's fake values, thresholds and any implied influence are not data or acceptance criteria; neither file is committed to the GUI repo.

### 5.1 Decisions tab — states

| State | Trigger | Rendering |
|---|---|---|
| Loading | telemetry `loading` | Skeleton: chip row (6 flat pills), strip rectangle, 3 card lines. `aria-busy="true"` on panel. |
| Not saved | selected evaluation episode has no `steps.jsonl` and no valid T1 sidecar | `Note` (info): "Decision telemetry was not saved for this episode." Keep the tab reachable; do not turn absence into a parse error. |
| Large episode | `needs_explicit_load` after the measured safety threshold | `Note` (warn) with size and an explicit "Load this episode" action; no silent loss of the 12k+ decision use case. The bounded parser/index strategy and threshold are tested before implementation sign-off. |
| Error | `error` | `Note` (error): "Could not read steps.jsonl: {message}". |
| Empty | ready, 0 records | `Note`: "steps.jsonl has no decision records." |
| Reset only | ready, only decision 0 | Chips + strip (single marker) + detail "Reset — no action or outcome window." |
| Ready | ≥1 action decision | Full layout (§5.2). On first opening Decisions, select the action whose outcome window contains the current playback time, or the first saved action if playback is at reset/outside a saved window; pause and seek through D-8 when a frame exists. If no action was saved, show reset. This makes the visual explanation usable immediately without guessing a missing decision. |
| Selected | user picks | Card filled; list row highlighted; strip marker; scene seeked + paused. |
| Missing source | selected n, record n−1 absent | Inputs group → "Pre-action inputs for decision {n} were not recorded (decision {n−1} is missing from the sampled telemetry)." Action/Context still render. |
| Applied unavailable | hold index unresolved | Applied row → "applied: unavailable — {reason}". |
| Node linkage unavailable | mapping unavailable | `Note` (info) under chips with reason; chips still filter. |
| Hold/random/baseline policies | `Episode.policy !== 'model'` | Identical context/action/outcome UI; header badge shows policy label (existing `rlLabels`). No preference wording. |
| Training context (T1) | selected saved training episode with valid DR-1 sidecar | Same chips/timeline/detail; recorded context/action/reward only. No preferences or decision-time model identity. |
| Sidecar incomplete (T1) | manifest `status=writing` or `failed` | Show the recorded status and error, if present; do not imply a complete episode. Only validated, intact records may be inspected. |
| Sidecar partial (T1) | manifest `status=capped` or `interrupted` | Show validated saved records with an explicit partial-coverage indicator and visible gaps; do not fill missing decisions. |
| Sidecar partial/capped/failed (T1) | manifest status and coverage | Explicit banner and saved-range/gap rendering; never fill a missing decision or treat a failed file as complete. |

### 5.2 Layout (responsive)

- **≥ xl (1280 px)**: while Decisions is active, the existing aside may widen to a capped half-viewport panel beside the 3D/Charts area; within that panel use a compact two-column detail/list layout only if measured width permits, otherwise one column. The scene must remain usable.
- **lg–xl (1024–1279 px)**: keep the existing aside beside the scene; explorer is one column: chips → strip → detail → bounded list. No imaginary full-width main tab.
- **< lg**: add a mobile tab rail for the sidebar tabs below the scene/playback controls and render exactly one selected panel below it. Decisions uses one column; the scene retains a minimum usable height, and the panel scrolls independently. On <sm, chip rail scrolls horizontally, strip height is 56 px and mask grid wraps.
- Chip row: `button` pills `aria-pressed`; label = `slot_node_ids[s] ?? "slot s (empty)"`; empty slots are disabled pills. For many slots, use a bounded horizontal rail plus search/overflow chooser without hiding the active node. When mapped, a pill shows a small dot in the node's scene color if available; selected state also has a shape/border and text label, not color alone.
- Strips: overview and optional focused range each have `role="group"` and distinct accessible labels; keyboard on the focused strip: `←/→` = prev/next present decision, `Home/End` = first/last in range, `PageUp/PageDown` = ±100 decisions (nearest present), `Esc` clears range. Ignore shortcuts while focus is in an editable control. Hover shows a readout row **below** the canvas (decision range, time, reward min…max, count) — no tooltip DOM positioned per pixel.
- Detail card header: "Decision {n}" + kind badge (reset/action) + `time_s`; use the approved **text ghost buttons "Prev" / "Next"**, without arrow glyphs on primary buttons.
- Copy rules: no gradients; calm surfaces (`glass` shadow); accent only for selection and focus.

### 5.3 EpisodeDetails (after)
Unchanged layout; the mask shown next to action n is record n−1's; label "pre-action mask (decision n−1)". Missing → "pre-action mask not recorded (sampled)". Uses the telemetry prop (no own fetch).

### 5.4 Before/after summary

| Area | Before | After |
|---|---|---|
| PlayerPage tabs | Right aside: Episode/Overview/Nodes/Log; header separately switches 3D/Charts | + Decisions in the aside and a reachable narrow-screen tab rail; compatible node/tab/chart choices survive episode switches, while record-specific selection resets |
| Scene click | always forces Overview | keeps Decisions tab if active; otherwise unchanged |
| EpisodeDetails | action n ↔ mask n (post-action) | action n ↔ mask n−1 (pre-action), exact |
| Telemetry fetch | per Disclosure remount | once per selected PlayerPage mount, stale-guarded, measured large-file policy |
| useSimData | no clamp, no exact decision-window seek, no stale guard | clamp, interval-checked frame seek, request token |
| MetricChart | monotone, connectNulls, animated | linear, gaps preserved, no animation |
| Motion | ad-hoc, transition-all, no reduced motion, no focus-visible | tokens, policy test, reduced motion, focus rings, page fade |
| Mobile | sidebar hidden | mobile tab rail + bounded panel below the scene |

---

## 6. Motion system — coverage matrix

Legend: **C** = `MOTION.colors`, **S** = `MOTION.surface`, **F** = `MOTION.fade`, **L** = `MOTION.lift` (transform ≤ 1 px translate or shadow only), **E** = `MOTION.enter`/`enterFade` on mount only, **–** = none by design.

| Surface | Hover | Press/active | Enter | Exit | Notes |
|---|---|---|---|---|---|
| Home page (cards, recent lists) | S | C | E (page) | – | cards: no scale |
| Runs page (rows, filters, group headers) | C | C | E (page) | – | filter result lists: container `enterFade` only, never per row |
| Experiments page (evaluation cards, StateBadge) | S | C | E (page) | – | badge color C |
| Experiment page (episode rows, BaselineInfo, ReplayPicker) | C | C | E (page) | – | ReplayPicker open: `rise-in`; close: none |
| TrainingRun page (episode rows, manifest info) | C | C | E (page) | – | |
| Player page (controls, tabs, sidebar, Decisions) | C (buttons only) | C | fade only | – | hot-path exclusions D-25 |
| Navigation: Breadcrumbs, App page switch | C | C | `enterFade` keyed wrapper | – | no slide |
| Buttons (all variants) | C / primary also shadow via S | `active:translate-y-px` with L | – | – | icon-round: C only |
| Cards / rows / chips | S / C | C | – | – | chips `aria-pressed` color C |
| Tabs / Segmented | C | C | – | – | no sliding indicator |
| Disclosure / panels | header C | – | grid-rows 0fr→1fr 180 ms + content F | same 120 ms exit easing | `prefers-reduced-motion` → instant |
| Filtering (Runs/Experiments) | – | – | container `enterFade` on result-set key change | – | no FLIP, no reorder animation |
| Loading state | – | – | Skeleton `pulse-soft` | replaced instantly by content with `enterFade` | flat colors |
| Error state (`Note` error) | – | – | `rise-in` | – | |
| Empty state | – | – | `enterFade` | – | |
| Rapid interruptions | – | – | CSS only; stale tokens discard superseded loads | – | tested in charter §10 B-7 |
| Focus | – | – | ring appears instantly (no transition on outline) | – | D-23 |
| Reduced motion | – | – | all durations → 0.01 ms | – | D-22 |

Explicit **no-motion** list: R3F canvas container, range input thumb, time readouts, FPS/HUD, strip canvases, list rows while scrolling, chart series, Three.js materials (untouched).

---

## 7. Invariants

### 7.1 Data
- I-1 Decision records are addressed only by integer `decision`.
- I-2 Inputs for decision n come only from record n−1; absence → `missing_source`; never the nearest earlier row.
- I-3 Applied action, **when derivable**, is labelled "derived"; otherwise it is explicitly unavailable. Hold index comes from `action_meanings`; no literal `4` in logic.
- I-4 Reward shown in the explorer comes from `steps.jsonl` only; link charts are never aggregated into a node scalar.
- I-5 Gaps are preserved in strip, list and navigation; `bucketize` reports `hasGap`; selected values are exact record values; aggregates are min/max only.
- I-6 Node ↔ slot linkage is used only when `NodeMapping.status === 'mapped'`.
- I-7 Decision 0 never has action/outcome; a non-zero record with `action_sent === null` is "unavailable", not reset.
- I-8 `facts`, `legacy_reward`, `reward.valid`, `reward.source`, `reward.components` are displayed verbatim when present, never required.
- I-9 No `reward_context`, no logits/probabilities, no observation vector are expected from `steps.jsonl`.

### 7.2 Security
- S-1 T0 uses existing `ResultCatalog` allowlisted files. T1 adds only the two published sidecar filenames and a selected-episode safe lookup; no arbitrary-path access or bulk training-file discovery.
- S-2 Raw record JSON is rendered as text (`<pre>`), never `dangerouslySetInnerHTML`.
- S-3 Byte cap before parse (D-13); no unbounded in-memory cache; nothing written to IndexedDB in this phase.
- S-4 `vite-plugin-outputs.ts` stays read-only and unmodified.
- S-5 No new network endpoints, no telemetry upload, no external fonts/scripts.

### 7.3 Failure
- F-1 A superseded `loadFiles`/telemetry request can never update state.
- F-2 Telemetry parse error does not break Overview/Charts; only Decisions tab and EpisodeDetails show error.
- F-3 Duplicate decision integers in `steps.jsonl` → index build throws a descriptive error surfaced as the tab's error state (not silently deduplicated).
- F-4 Invalid/unsorted frame times or a decision interval with no representable frame → `null`/unavailable; never seek to an outside frame or throw during render.
- F-5 Strip handles `columns === 0` (hidden container) by skipping paint; ResizeObserver re-paints on size change.
- F-6 Reduced-motion users never see a pulsing skeleton or translating elements.

---

## 8. Exact implementation steps

Order is binding; each WP ends with `npm test && npm run lint && npm run build` green.

### WP-0 Baseline capture (NOW, ~0.5 h)
1. Record in `feature-research/phase-4-decision-explorer/measurements.md` (local, untracked): current dev-build playback FPS on the largest available evaluation episode with Overview tab open; time-to-interactive after selecting that episode; `steps.jsonl` byte size and record count for the largest local episode. (Used for §11 budgets.)

### WP-1 Pure data layer (NOW)
1. `src/lib/frameSeek.ts` — `frameIndexForDecisionWindow` with half-open boundaries and a reset-snapshot helper.
2. `src/lib/nodeIdentity.ts` — `buildNodeMapping` per §4.2.
3. `src/lib/episodeTelemetry.ts` — add and export `recordForDecision` (exact binary search). Do not change parsing or existing exports' behavior.
4. `src/lib/decisionExplorer.ts` — everything in §4.1.
5. `tests/helpers/syntheticTelemetry.ts` — generator `makeTelemetry({ decisions, slots, holdIndex, sampledEvery?, dropDecisions?, resetOnly?, rewardNullEvery? })` producing an `EpisodeTelemetry`-shaped object (and raw JSONL text so the existing parser can be exercised).
6. Tests of §9.1–9.3.

### WP-2 Playback plumbing (NOW)
1. `src/hooks/useSimData.ts` — request token on `loadFiles`/`reset`; clamp in `seek`; use `SimFrame.time` to support interval-checked decision seeking; expose `declaredNodeIds: {status:'absent'} | {status:'valid'; ids:string[]} | {status:'invalid'; reason:string}` parsed from the already-read archived `nodes.json`, without changing `parseSimFiles.ts`. Present-invalid blocks scene linkage; absent can use the source-backed order plus exact CSV roster checks.
2. `src/hooks/useEpisodeTelemetry.ts` — per §4.4 with stale token and measured auto-load threshold; `ResultCatalog.getFile` returns a `File` with `size`, so check it before `text()`. An explicit large-file load may use a bounded/chunked parser if measurement requires one; do not call string length a byte count.
3. `src/components/pages/PlayerPage.tsx` and `src/App.tsx` — call the hook for an evaluation episode with a steps path; pass `telemetryState` to `EpisodeDetails`; add `selectedDecision`/`decisionRange` state and `'decisions'` to the actual sidebar tab set; render a mobile tab rail and panel; show a no-telemetry state when steps are absent; scene click rule (D-7); lift/validate only the cross-episode preferences in D-18.
4. `src/components/EpisodeDetails.tsx` — accept `telemetryState` prop; remove internal fetch; apply D-15.
5. Tests of §9.4.

### WP-3 Decisions tab UI (NOW)
1. `src/components/decisions/SlotChips.tsx`
2. `src/components/decisions/DecisionStrip.tsx` (two canvases, ResizeObserver, DPR, keyboard, brush)
3. `src/components/decisions/DecisionDetail.tsx` (Inputs/Action/Context/Raw)
4. `src/components/decisions/DecisionList.tsx` (windowed)
5. `src/components/decisions/ActionGlyph.tsx` (shared glyph: color via `actionColor`, meaning in `title`, ring when revalidated)
6. `src/components/decisions/DecisionExplorer.tsx` (composition, focusSlot, layout §5.2, states §5.1)
7. `src/components/ui/Skeleton.tsx` (flat pulse block)
8. Wire into `PlayerPage` tab panel.

### WP-4 Charts fix (NOW)
1. `src/components/charts/MetricChart.tsx` — D-16 only.

### WP-5 Motion system (NOW)
1. `tailwind.config.js` — D-20 tokens.
2. `src/index.css` — D-22, D-23.
3. `src/styles/motion.ts` — D-21 constants.
4. Replace every `transition-all` in `src/` with the appropriate `MOTION.*` constant; normalize existing `transition-colors` to `MOTION.colors` where the element is in the matrix. Files: `Button.tsx`, `Segmented.tsx`, `Disclosure.tsx` (grid-rows technique), `Badge.tsx`, `Row.tsx` and `pages/shared.tsx`, `Breadcrumbs.tsx`, `ReplayPicker.tsx`, `ExperimentStatus.tsx`, `pages/BaselineInfo.tsx`, the page files, `App.tsx` (D-24 wrapper). The Implementer greps `transition-` across `src/` and records each additional owner in a plan addendum **before editing it**, not merely in the PR body.
5. Skeleton adoption: Runs/Experiments/Experiment/TrainingRun loading states use `Skeleton`; Player loading remains as is (hot path) but with `aria-busy`.
6. `tests/motionPolicy.test.ts` (§9.5).

### WP-6 Docs (NOW)
1. `CLAUDE.md` — one line under Architecture: `components/decisions/` + `lib/decisionExplorer.ts`/`nodeIdentity.ts`; one line under Key Patterns: motion tokens in `styles/motion.ts`, no `transition-all`.
2. `README.md` — short "Decisions tab" subsection: T0 evidence, **opt-in recorded** T1 sidecar/preferences after publication, training context limits, n−1 rule, derived applied and unavailable states. T1 is a required consumer deliverable; recording remains optional per run. No causal WHY claim.

### WP-7 T1 producer-sidecar consumer (REQUIRED, GATED)
Start only when §3.4 gates pass; reconcile provisional names against the actual frozen producer schema in a short plan addendum, then implement §3.5. Exact owners: `src/lib/resultCatalog.ts` (safe selected-episode access across all three sources and `subCatalog`), `src/lib/experimentIndex.ts`, `src/lib/trainingRun.ts`, `src/lib/decisionRecords.ts` (new), `src/hooks/useDecisionRecords.ts` (new), `src/App.tsx`, `src/components/pages/PlayerPage.tsx`, the existing `src/components/decisions/*`, vendored schema under `src/schemas/`, and tests/fixtures in §9.7. Use `npm test && npm run lint && npm run build` as with WP-1…6. The GUI PR is not feature-complete until WP-7 and its browser charter pass. If the producer contract is not published yet, WP-1…6 may be built/reviewed on the branch, but do not present a T0-only PR as completion of the agreed scope.

---

## 9. Tests authorized for the Implementer

All run under `npm test` (node strip-types). No new test frameworks. No browser/component tests.

### 9.1 `tests/decisionExplorer.test.ts`
- `resolveHoldIndex`: finds `"hold"`, `" Hold "`; returns null for none; returns null for duplicates.
- `deriveApplied`: replaces exactly revalidated slots; empty list → equal copy (status `derived`); null hold → unavailable with the exact reason string.
- `buildDecisionIndex`: sorted/unique; gaps computed for `sampledEvery=3` and explicit `dropDecisions`; use a validated contract `num_decisions` for declared coverage when available, otherwise mark coverage unknown beyond the observed last decision; duplicate/non-integer decision, reversed tick or nonfinite/nonmonotone time → descriptive error.
- `recordForDecision`: exact hits and misses (n−1 absent).
- `joinDecision`: reset shape for 0; action n uses n−1 obs_sha256/mask (assert against generator ground truth); `missing_source` when n−1 dropped; interval = `time_s − ticks_in_step·tick_s`; non-zero record with null `action_sent` → action unavailable, kind `action`.
- `nearestDecision` and `stepDecision` skip gaps and respect range; `decisionAtTime` uses the existing half-open outcome-window rule and returns null between sampled windows, rather than returning the last row with `time_s ≤ t`.
- `bucketize`: count sums to records in domain; min/max exact vs brute force; `hasGap` true only for buckets intersecting a gap; count-1 buckets have min===max===value; NaN handling for null rewards.
- `makeRowIndex`: gap rows collapse; order preserved; row count/accessor avoid a whole-episode row-object array.
- Stress: 12,000 and 200,000 decisions (sampled every 2 with 1 % drops from a fixed PRNG seed): build index, 1,000 deterministic `joinDecision`, 1,000 `nearestDecision`, `bucketize(1,600)`; log wall-clock per operation with `console.log` (no numeric assertion until §11 assigns budgets after measurement). Assert result sizes and exact sampled values as well as no throw.

### 9.2 `tests/nodeIdentity.test.ts`
- mapped case with ordinary IDs such as `node-a`/`node-b`: `node_ids` order ↔ numeric CSV IDs 0/1, null-padded slots;
- each unavailable reason string exactly;
- reordered/duplicate archived `nodes.json` IDs or a missing/extra CSV ID → unavailable;
- contract order changed together with the archived roster → ordinal mapping updates; never coerce an ID string to an integer.

### 9.3 `tests/frameSeek.test.ts`
- empty, exact interval boundaries, frames inside/outside a decision window, sampled playback cadence with no frame in the window, unsorted/nonfinite frame times and reset at t=0. Outside/invalid cases return null, never a plausible but incorrect frame.

### 9.4 `tests/episodeTelemetry.test.ts` (extend)
- `recordForDecision` exact behavior on the existing fixture; existing tests unchanged.

### 9.5 `tests/motionPolicy.test.ts`
- Reads every `src/**/*.{ts,tsx,css}`; asserts no occurrence of `transition-all`; asserts `src/index.css` contains `prefers-reduced-motion` and `:focus-visible`; asserts `tailwind.config.js` exports `transitionDuration.fast/base/slow`.

### 9.6 Commands
`npm test`, `npm run lint`, `npm run build`. Formatting runs only on touched files through the configured lint-staged hook or a targeted Prettier check; **do not run `npm run format`**, which rewrites every source file.

### 9.7 T1 tests (REQUIRED once §3.4 gates pass)
- `tests/decisionRecordSchema.test.ts`: byte-for-byte schema SHA-256 pin against the published producer commit; validated complete/capped/interrupted/writing/failed/reset-only/training synthetic fixtures and malformed negatives. A schema file merely present or a skipped pin test is not a pass.
- `tests/decisionRecords.test.ts`: parse every consumed record; verify file hash/bytes, coverage partition and explicit gaps, duplicate/missing decisions, exact integer tick/n−1 joins, separate schema/model-input hashes, mask/steps consistency when a steps row exists, and valid records when steps are absent or sampled but the sidecar carries an exact vector. Preferences only for a model episode with matching identity; never for training, callback, hold, random or placement baselines.
- Extend `tests/resultCatalog.test.ts`, `tests/outputsServer.test.ts`, `tests/experimentIndex.test.ts`, `tests/trainingRun.test.ts`: all three source modes can retrieve only the selected known sidecars safely; bulk training discovery stays bounded; path traversal, unknown filenames and symlinks cannot be read; legacy runs without sidecars remain unchanged.
- Browser charter additions: switch among complete/partial/missing sidecars, model/baseline/training episodes, and long runs; compare a displayed preference against the synthetic producer record; confirm no influence display, stale episode bleed, eager all-episode loading or regression to existing playback.

---

## 10. Manual browser charter (dev server, `npm run dev`)

Record pass/fail in `measurements.md` (untracked). Use Chrome; repeat B-1, B-4, B-9 in Safari.

- B-1 Open an evaluation **model** episode with steps.jsonl → Decisions tab present; chips = slots; strip spans decision domain; a real saved action is selected by the documented current-time/first-saved rule, with no fabricated input.
- B-2 Click strip → decision selected, scene pauses and seeks; detail shows Inputs from n−1 (compare `obs_sha256` to the Raw record n−1).
- B-3 Keyboard: focus strip, `→/←/Home/End/PageUp/PageDown/Esc` behave as §5.2; focus ring visible.
- B-4 Open a **sampled** episode (or a synthetic one placed under `outputs/` locally, untracked) → gaps visible as holes; selecting a decision whose n−1 is missing shows the exact missing-source text; prev/next skip gaps.
- B-5 Brush a range → focused strip and list scope to it; exact decisions become selectable; "Reset range" and Esc restore the whole episode.
- B-6 Chip click → when mapped, scene highlights the node and Overview is not forced; scene node click while on Decisions tab keeps the tab and focuses the slot. When unmapped, Note shows reason and no scene sync.
- B-7 Rapid episode switching (click 5 episodes in <2 s) → final view matches the last episode (frames and telemetry); no console errors.
- B-8 Hold / random_valid / geometric / optimization episodes → same context/action/outcome UI, no invented preferences. Before T1, training has no decision data; after T1, a selected saved training episode has a Decisions panel with context only and no preference/model identity.
- B-9 Reduced motion ON (OS setting) → no page fade, no skeleton pulse, disclosures snap.
- B-10 Width 375 / 768 / 1280 → layouts per §5.2; chip row scrolls horizontally at 375.
- B-11 Charts tab → SINR spikes are sharp (linear), gaps are breaks, no draw animation on metric switch.
- B-12 EpisodeDetails → mask label reads "pre-action mask (decision n−1)".
- B-13 Tab through Home → Runs → Experiments → Experiment → Player: every interactive element shows a focus ring; range input thumb has a ring.
- B-14 Large-file path: configure the test threshold to 1 KB without editing production code → explicit-load state appears; accepting it loads the selected episode through the approved bounded strategy. No silent hard cutoff, eager catalog-wide parse, or unrelated playback failure.

---

## 11. Accessibility and performance checks

### Accessibility (must pass before PR)
- Tab panel: existing `Segmented` currently has plain buttons and no tab semantics. Give the PlayerPage sidebar/mobile tab rail a real `tablist`/`tab`/`tabpanel` keyboard model, or use labelled buttons with `aria-pressed` consistently; do **not** make every generic `Segmented` instance a tablist (3D/Charts and speed are different controls).
- Strip: `role="group"`, `aria-label`, `aria-describedby` → hover/selection readout `aria-live="polite"`.
- Chips: `aria-pressed`; disabled empty slots `aria-disabled`.
- List: labelled list with focusable decision buttons and visible selected/current state; if listbox semantics are chosen, implement roving focus/arrow keys and test them instead of only adding roles.
- Color is never the sole carrier: action glyph has a letter/meaning `title`, revalidated slot has a ring **and** "R" badge, gap buckets have hatching **and** list text.
- Contrast: accent on glass surfaces ≥ 4.5:1 for text, ≥ 3:1 for rings (verify with DevTools).
- Reduced motion verified (B-9).

### Performance (measure, then budget)
- P-1 Record (Chrome Performance panel, 6× CPU throttle off): `buildDecisionIndex` + mapping time on the largest local episode and on the 200k synthetic; `bucketize(1600)` time; overlay paint per pointer-move.
- P-2 Playback FPS with Decisions tab open vs Overview (same episode) — report delta; the explorer may update at **decision boundaries**, but must not re-render on every RAF interpolation tick. Verify with React Profiler and the same replay.
- P-3 Memory: heap delta after telemetry load for largest local episode.
- P-4 Input delay: pointer-move → readout update ≤ 1 frame visually; list scroll smooth at 60 fps (windowing).
- Budgets are **assigned after** P-1…P-4 are recorded in `measurements.md`; the initial proposal to be confirmed by measurement: index build < 150 ms @ 12k, < 1.5 s @ 200k; bucketize < 16 ms @ 200k; FPS delta ≤ 2 fps. If exceeded, the Implementer reports and stops (no silent "optimizations" that change semantics).

---

## 12. Stop conditions (Implementer halts and reports)

1. Actual `SimFrame.time` is absent/nonfinite/unsorted, or no safe interval-checked seek can be defined → stop; do not substitute an outside frame.
2. `contract.action_meanings` lacks a unique `hold` in real local data → render applied as unavailable and report the contract mismatch; do not stop the whole explorer.
3. Any real local `steps.jsonl` has duplicate decision integers or non-integer `decision`.
4. `ResultCatalog.getFile` cannot provide byte size **and** cannot provide text length before parse (cap impossible).
5. `Segmented` cannot host an additional tab without redesign.
6. A `transition-all` removal would require touching Three.js/canvas code paths.
7. Performance budgets (§11) exceeded after measurement.
8. Any T1 edit before §3.4 gates pass, or any published producer field differing materially from §3.5 without a reviewed plan addendum.
9. Any pressure to label anything as "why", "influence", or "explanation" — NO-GO.
10. PR #4's head/base differs materially from the recorded stack and the implementation branch cannot be reconciled without overwriting user work; report before Git-PR. A PR being merged is not itself a feature-design stop.

---

## 13. PR stack and commit plan

- Branch: `feat/decision-explorer` created from `feat/baseline-gui-consumer` @ `96a02ed3` (recheck PR #4 state at PR time; it was last seen as an open draft stacked on `docs/rl-gui-integration`).
- One GUI PR stacked on PR #4's head, with T0/motion commits followed by a T1 sidecar-consumer commit after the producer schema is frozen. It may be opened as a draft while T1 waits, but it is not marked feature-complete or merged until WP-7 passes. Public title: **"feat(gui): inspect recorded policy decisions and polish app motion"**. Body describes features and the exact simulator schema dependency; **no phase numbering or research paths**.
- Commits (in order, each green):
  1. `feat(data): decision index, n−1 join, derived applied action, checked node mapping`
  2. `fix(playback): stale-load guard and interval-checked decision seek`
  3. `fix(rl): pair action n with pre-action mask from decision n−1; load telemetry once per player`
  4. `feat(ui): Decisions tab — strip, chips, detail, windowed list`
  5. `fix(charts): linear lines, preserve gaps, disable animation`
  6. `style(motion): shared timing tokens, reduced motion, focus-visible; remove transition-all`
  7. `feat(gui): consume opt-in decision records and model preferences` (after §3.4 gates)
  8. `docs(gui): explain decision evidence and motion conventions`
- Never stage `feature-research/**` or `outputs/**`. Pre-commit (Husky/lint-staged) runs as configured.
- Reviewer may ask to split commit 6 into its own PR; the plan permits that without re-planning.

---

## 14. Explicit exclusions

- T1 code **before** the producer schema gate. T1 itself is required in WP-7; do not construe this exclusion as permanent deferral.
- T2 / attribution / influence / explanation sidecar / zeros-as-explanations / causal copy.
- Decisions tab for plain standalone runs; wholesale removal of the training large-file guard. Selected saved training episodes gain bounded T1 access.
- `reward_context` consumption.
- Hard-coded hold index.
- Unchecked index assumptions or coercing string IDs such as `node-a` to numbers; the verified simulator ordinal mapping in D-6 is allowed only after its roster checks pass.
- Interpolation, nearest-earlier substitution, or gap bridging anywhere (explorer, charts).
- Node-level SINR/capacity/RX/MCS averages.
- IndexedDB caching of telemetry; eager loading of any sidecar.
- New runtime dependencies; routers; URL state; persisted explorer state.
- Changes to `vite-plugin-outputs.ts`, CSV parsing, baseline discovery, `assembleRuns`, coordinate mapping, Three.js materials. T1's safe on-demand catalog API can use the existing read-only `/outputs/...` endpoint without changing it.
- Exit animations, sliding tab indicators, FLIP/reorder animation, gradients, arrow glyphs on primary buttons, scale transforms on cards.
- Vitest/Testing Library/browser test harness.
- Any `outputs/` or research directory staging.

---

## 15. Files touched

### New
- `src/lib/decisionExplorer.ts`
- `src/lib/nodeIdentity.ts`
- `src/lib/frameSeek.ts`
- `src/hooks/useEpisodeTelemetry.ts`
- `src/hooks/useDecisionRecords.ts` (T1)
- `src/lib/decisionRecords.ts` (T1)
- `src/schemas/decision_record.v1.schema.json` (T1, byte-identical vendor after publication)
- `src/components/decisions/DecisionExplorer.tsx`
- `src/components/decisions/DecisionStrip.tsx`
- `src/components/decisions/DecisionDetail.tsx`
- `src/components/decisions/DecisionList.tsx`
- `src/components/decisions/SlotChips.tsx`
- `src/components/decisions/ActionGlyph.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/styles/motion.ts`
- `tests/decisionExplorer.test.ts`
- `tests/nodeIdentity.test.ts`
- `tests/frameSeek.test.ts`
- `tests/motionPolicy.test.ts`
- `tests/decisionRecordSchema.test.ts` (T1)
- `tests/decisionRecords.test.ts` (T1)
- `tests/fixtures/decision_record/**` (T1, synthetic only)
- `tests/helpers/syntheticTelemetry.ts`

### Modified
- `src/lib/episodeTelemetry.ts` (add the sole `recordForDecision` exact lookup; make `obs_sha256` optional on `StepRecord` and `slot_node_ids` nullable in the type; no parser behavior change)
- `src/lib/resultCatalog.ts` (T1 safe selected-sidecar retrieval; bulk discovery guard retained)
- `src/lib/experimentIndex.ts` (T1 optional evaluation sidecar paths)
- `src/lib/trainingRun.ts` (T1 selected training sidecar context)
- `src/hooks/useSimData.ts`
- `src/components/pages/PlayerPage.tsx`
- `src/components/EpisodeDetails.tsx`
- `src/components/charts/MetricChart.tsx`
- `src/components/charts/ChartsView.tsx` (controlled selected metric for compatible episode-switch preference)
- `src/App.tsx`
- `src/index.css`
- `tailwind.config.js`
- `src/components/ui/Button.tsx`
- `src/components/ui/Segmented.tsx`
- `src/components/ui/Disclosure.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/Row.tsx` and the shared rows file(s) added in the baseline work (identified by grep; listed in PR body)
- `src/components/ui/Breadcrumbs.tsx`
- `src/components/rl/ReplayPicker.tsx`
- `src/components/ExperimentStatus.tsx`
- `src/components/pages/BaselineInfo.tsx`
- `src/components/pages/HomePage.tsx`
- `src/components/pages/RunsPage.tsx`
- `src/components/pages/ExperimentsPage.tsx`
- `src/components/pages/ExperimentPage.tsx`
- `src/components/pages/TrainingRunPage.tsx`
- `tests/episodeTelemetry.test.ts`
- `tests/resultCatalog.test.ts` (T1)
- `tests/outputsServer.test.ts` (T1)
- `tests/experimentIndex.test.ts` (T1)
- `tests/trainingRun.test.ts` (T1)
- `tests/trajectory.test.ts` (if the existing trail/node mapping helper is extended to nullable slots)
- `CLAUDE.md`
- `README.md`

### Untracked, local only (never committed)
- `feature-research/phase-4-decision-explorer/measurements.md`

### Explicitly NOT touched
- `vite-plugin-outputs.ts`, `src/lib/baseline*.ts`, `src/lib/scenarioGroups.ts`, `src/lib/coordinates.ts`, `src/components/canvas/**`, `src/hooks/useMetricSeries.ts`, `src/lib/rlLabels.ts`, `src/styles/tokens.ts` (reuse `actionColor`/`componentColor` as-is). `resultCatalog.ts`, `experimentIndex.ts` and `trainingRun.ts` are T1-owned; `ChartsView.tsx` may gain controlled selected-metric props for D-18 without changing metric extraction.

---

## 16. Approved GUI defaults and remaining producer gate

The user approved proceeding on 2026-10-01. The GUI defaults below are implementation
choices, not fresh stop-for-approval questions. Measure A-1/A-7 as specified; if a safe
bounded strategy or the proposed performance budget cannot be met, stop and report the
evidence rather than silently weakening the explorer. G-1…G-4 remain the T1 gate; G-5
was satisfied by the approved simulator settings.

| # | Item | Disposition | Approved direction |
|---|---|---|---|
| A-1 | Large-episode auto-load threshold and bounded parse/index strategy | Approved, measure first | No unmeasured 64 MiB hard failure; allow an explicit, safe selected-episode load above the threshold |
| A-2 | Raw record display cap | Approved | 64 KB truncated with note |
| A-3 | Prev/Next control style | Approved | text ghost buttons "Prev"/"Next" (no arrows) |
| A-4 | Prev/Next behavior after a range brush | Approved | within the focused range; "Show all" clears the brush and restores full-episode navigation |
| A-5 | Motion durations 120/180/240 ms, easing (0.2,0,0,1) | Approved | as D-20 |
| A-6 | Page-switch fade on every page change | Approved | yes, opacity only |
| A-7 | Performance budgets | Approved proposal, measure first | §11 proposal |
| A-8 | Single PR vs split motion PR | Approved | single PR, split on request |
| G-1…G-5 | T1 gates | **Frozen schema required** | T1 is required and scheduled as WP-7 once green; draft branch may proceed with T0/motion meanwhile |
| — | T1 field names, status semantics, settings/cap defaults, SHA-256 | **Frozen schema required** | Reconcile §3.5 in a reviewed addendum against the published producer file, then implement and test |

**Verified frame field:** `SimFrame.time: number` is declared in `src/types.ts` and used as `frames[frameIndex]?.time` by `ChartsView`. WP-2 still validates sorted, finite times and the interval-seek boundary behavior against real playback data.

## 17. Completion gate

The combined GUI scope is complete only when all of these hold:

1. T0 joins action n with **exact** record n−1 where available; reset, sampling gaps and missing telemetry are honest; a selected decision seeks only to a real frame inside its outcome window.
2. Ordinary string IDs (for example `node-a`) map to scene CSV IDs through the verified simulator order and roster checks; node selection stays stable across compatible episodes, and uncontrolled/mismatched nodes are never silently reassigned.
3. The producer's reviewed schema/fixtures are pinned byte-for-byte; WP-7 reads selected evaluation **and recorded training** sidecars on demand, validates every consumed record and coverage, and shows model preferences only when actually recorded and identity-matched. No attribution is claimed.
4. The explorer is visual, compact and usable at narrow and wide widths for at least 12,000 decisions, with full-episode overview → focused range → exact decision navigation; no unbounded DOM or fabricated gap values.
5. The whole-app motion matrix is exercised in normal and reduced-motion modes, with keyboard focus and interruption checks and no measured playback regression beyond the human-approved budget.
6. `npm test`, `npm run lint`, `npm run build`, the manual browser charter and the schema-pin test pass; the GUI PR is stacked on the verified PR #4 head and contains no new private research, real data or run outputs.

End of plan. Awaiting review.
