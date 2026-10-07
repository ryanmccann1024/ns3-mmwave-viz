# Phase 4 Scout — Decision explorer and app-wide microanimation (GUI consumer)

Date: 2026-10-01. Read-only discovery. This file was the only write. No production files, tests, Git state, or other agents were touched. Keep this report and both private plans out of commits.

## 0. Summary

- **Plan the consumer now; gate its DR-1 implementation on the producer contract.** The simulator feasibility gate accepted B1–B3/RB1 and the independent Tester report passed its synthetic checks, but no DR-1 JSON Schema or producer code exists. `policy_decisions` and `decision_record` match nothing outside `feature-research/` in either repo. The earlier gate review did not itself authorize GUI implementation; the human's current request authorizes this combined planning pass, not an unreviewed schema or influence claim.
- **Influence/WHY is NO-GO** (feasibility §0, §6.3, §9 item 4). The explorer must show "Influence unavailable" everywhere. It must never show bars, zero values, or placeholder values.
- **Safe now (T0, existing data only):** fix the mask/action misjoin, add an exact n−1 lookup, a stable string node ID, decision→frame seek, and the app-wide focus/reduced-motion/navigation fixes listed in §6–§7.
- **Two existing defects this scout found that the Phase 3 reports did not list:** (a) a padded `null` slot can collide with the "All nodes" chip; (b) a rapid episode switch can let a stale `loadFiles` win. See §5.

## 1. Inputs read

| Source | Path | Status used |
|---|---|---|
| GUI decision-explorer plan (private) | `feature-research/phase-3-decisions/plan.md` | T0/T1/T2 tiers, join rules, stop rules |
| GUI Phase 3 scout | `feature-research/phase-3-decisions/scout.md` | Existing-surface line refs (rechecked below) |
| Simulator plan (private) | `/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim/feature-research/phase-3-decisions/plan.md` | Grep only: it states "No … Phase 4 motion work" (L9) |
| Simulator feasibility | `…/mesh-sim/feature-research/phase-3-decisions/feasibility.md` | §0 verdicts, §4 timing, §7 DR-1 proposal, §9 recommendation |
| Feasibility review and test charter | `…/mesh-sim/feature-research/phase-3-decisions/feasibility-review-and-test-charter.md` | B1–B3 and RB1 accepted; BLOCKED R1–R6 |
| Producer step writer | `…/mesh-sim/scripts/rl/env/telemetry.py` L105–124 `make_record` | Real `steps.jsonl` record fields |
| Independent feasibility Tester | `/private/tmp/claude-501/-Users-ryanmccann-Desktop-git-nosync-ns3-mmwave-scratch-mesh-sim/a6b6876d-fedc-4c2d-b7a2-867b068102fa/scratchpad/phase3-6A-feasibility-test-results.md` | 7 PASS, 0 FAIL; R1–R6 remain BLOCKED; synthetic evidence only |

Branch state: the current branch is `feat/baseline-gui-consumer`. Local heads are `main`, `feat/rl-data-layer`, `feat/rl-gui-pages`, `docs/rl-gui-integration` and `feat/baseline-gui-consumer`. PR #4 was previously checked as an open draft with base `docs/rl-gui-integration` and head `feat/baseline-gui-consumer`; recheck its live state at Git-PR time. The new branch should stack on that head, not directly on `main`.

## 2. Producer facts the consumer must honor (verified in the feasibility report)

| Fact | Evidence | Consumer consequence |
|---|---|---|
| Dirty-checkout `steps.jsonl` records carry `obs_sha256`, `reward_context`, `legacy_reward`, `facts`; `reward_context` is **not** on simulator PR #15 | `telemetry.py` L110–124 in the dirty checkout; producer Scout §2 | The GUI type `StepRecord` (`src/lib/episodeTelemetry.ts` L29–43) omits `obs_sha256` and `reward_context`. Add optional `obs_sha256` before any hash join. Treat `reward_context` as optional and do not require it for the explorer unless the dirty-only producer work is separately approved and stacked. |
| Input of action n = record n−1 (exact `decision` value), verified only at `every=1` | feasibility §4 table | Look up by the `decision` value, never by array neighbour. |
| `every=2` saves {0,2,4,6,8,9}; the nearest earlier row is wrong in 4/4 obs hashes | feasibility §4 | A missing n−1 shows "Input not recorded". |
| Decision 0 has `ticks_in_step=1` at tick 0, giving window (−0.1, 0] | feasibility §4 | It is a snapshot, not an outcome window. `decisionWindow` already returns null for decision 0 (`episodeTelemetry.ts` L101). |
| `action_sent` is the requested action. Applied = requested with hold (4) at `revalidated_slots`. | feasibility §4, C++ `rl-bridge.cc` L512–521 | Show requested, revalidated and applied separately. Applied is "derived", not recorded. |
| The malformed-line path holds all slots with empty `revalidated_slots` | feasibility §4 | An empty list does not prove applied == requested for non-`MeshRlEnv` senders. |
| Proposed DR-1 slot IDs can pad with `null`; padding in the current eval manifest is unverified | feasibility §4 synthetic header (`['node-b','node-c',None]`) | GUI types declare `string[]`. Parse existing manifests defensively and handle nullable DR-1 IDs; see risk R1. |
| Reward is network-wide | GUI scout §4; DR-1 §7.3 `outcome.reward` | Never label a reward as per-node. |
| DR-1 join key is the integer `tick` (`input.tick == outcome.tick − ticks_in_step`). `time_s` is compared with a tolerance. | feasibility §7.1 | Do not use a float equality join. |
| Two hashes: `obs_sha256` (schema dtype) and `model_input_sha256` (float32) | feasibility §3 | Never relabel one as the other. Inputs shows raw facts unless the producer writes the exact vector. |
| Training sidecar has `preferences=null`, `model=null` | feasibility §5, §7.6 training variant | Training shows context/action/reward only. Probabilities and influence are unavailable. |
| Open contract items (representation, mask canonical bytes, `model_sha256` meaning, node filter, `num_timesteps`) | feasibility §7.5 items 1–10 | Do not freeze consumer parsers until the schema is published. |

## 3. Existing GUI inventory

### 3.1 Player, clock and selection

| Surface | Location | Verified behavior | Explorer relevance |
|---|---|---|---|
| Router | `src/App.tsx` L24–30 `Playing`; L178–195 `rl`; L202–203 `PlayerPage key` | `rl` is built only for `kind==='episode'`; training and runs get `rl=null`. The key is `run.key` or `episode.dir`, so every episode change remounts `PlayerPage`. | The training context must be added here. The remount discards player-local tab/view/node state. |
| Episode open | `App.tsx` L101–122 `openEpisode` | Guarded by `openingEpisode` (ignores clicks while one is opening); no cancellation token | Good debounce. See R2 for `sim.loadFiles`. |
| Training open | `App.tsx` L88–99 `playTrainingEpisode` | No in-flight guard; no cancellation | R2 applies. |
| Clock | `src/hooks/useSimData.ts` L156–195 RAF loop; L312–317 `seek` | The frame index advances at `tickMs/speed`. `seek` does not clamp, resets alpha and does not pause. | Decision jump = binary-search a frame by time, then `pause()` + `seek()`. |
| Load | `useSimData.ts` L199–274 `loadFiles` | `Promise.all` of FileReaders, then `setState`; no request ID or abort | R2. |
| Playback UI | `src/components/PlaybackControls.tsx` | Play/Pause `Button icon-round` with `title` only; range input has no `aria-label`/`aria-valuetext`; speed `Segmented` | Shared cursor; a11y gaps listed in §6. |
| Seek logging | `src/hooks/usePlaybackLog.ts` L91–102 | One log entry per range `onChange` (dragging produces many entries); per-frame `find` over nodes/links (L60–83) | Keep the explorer seeks out of this path or coalesce them. |
| Player page | `src/components/pages/PlayerPage.tsx` L139–143 | `view`, `tab`, `selectedNode:number`, `selectedLink`, `selectedFlow` are local | Selected node is a CSV `node_id` (numeric). |
| Header | `PlayerPage.tsx` L191–250 | Breadcrumbs, identity line, 3D/Charts `Segmented`, Close | Node chip rail goes here (plan §4). |
| Sidebar tabs | `PlayerPage.tsx` L182–187, L332–507 | Episode/Overview/Nodes/Log; `aside` hidden below `lg` | Nothing replaces it on narrow screens except `ReplayPicker` (L252–263). See R6. |
| Scene click | `PlayerPage.tsx` L155–165 `reveal` | A scene click switches the tab to Overview, even from Episode | Explorer selection must not yank the user out of the Episode tab. |
| Scene node id | `src/lib/parseSimFiles.ts` L189–201 | `id = parseInt(node_id)` from the CSV | The CSV `node_id` equalling the position in `contract.node_ids` is **Not verified**. |
| Node mapping | `src/lib/trajectory.ts` L24–36 `controlledNodeIndices` | `index = node_ids.indexOf(slotNodeId)`; a padded `null` slot goes to `missing` | Reuse, but filter `null` slots explicitly. |
| RL node filter | `src/hooks/useExperimentSession.ts` L58, L109, L149 | `trailNode: string \| null`; reset on episode change (L109) | Unify with scene selection by string ID. |

### 3.2 Episode telemetry panel

| Surface | Location | Verified behavior |
|---|---|---|
| `Telemetry` | `src/components/EpisodeDetails.tsx` L294–352 | Mounted inside a closed `Disclosure`; reads and parses `steps.jsonl` on every mount (closing and reopening re-reads it); cancels via a `cancelled` flag |
| `DecisionView` | `EpisodeDetails.tsx` L194–292 | **Defect:** shows record n's `mask` as "Mask observed at decision time" (L243–266) next to record n's `action_sent` (L230–240). That mask is the post-action mask for n+1. |
| Mask chips | `EpisodeDetails.tsx` L253–263 | Blocked actions use `line-through` plus gray (not colour alone) and `title` only. No screen-reader text. |
| Reward | `EpisodeDetails.tsx` L269–284 | Shows components and total for record n. Correctly paired with action n. |
| Follow-one-node chips | `EpisodeDetails.tsx` L452–473 | `[null, ...nodes]` keyed by `n ?? 'all'`; active styling only, no `aria-pressed` |
| Path cards / switch | `EpisodeDetails.tsx` L354–406 | `Switch` animates `left` via `transition-all`; the button has no `aria-pressed`/`role="switch"` |
| Reader | `src/lib/episodeTelemetry.ts` L53–92 `parseSteps` | Whole-text split; keeps every record including `facts`; skips non-`step` lines; validates only `time_s`/`decision` types |
| Lookup | `episodeTelemetry.ts` L113–141 `decisionAt` | Binary search for the first `time_s ≥ t`, then checks the half-open window `(time_s − ticks·tick_s, time_s]` with epsilon 1e-9; t=0 returns decision 0 |
| Series | `episodeTelemetry.ts` L205–217 `rewardSeries` | Skips null rewards (no zero fill) |
| Eval-wide telemetry | `src/hooks/useRlData.ts` L43–79 | Parses `steps.jsonl` for **every** completed episode of an evaluation at once (Results insights). This is unrelated to the player but is the existing worst-case parse load. |

### 3.3 Charts

| Surface | Location | Verified behavior | Explorer relevance |
|---|---|---|---|
| `ChartsView` | `src/components/charts/ChartsView.tsx` L19–54 | One metric via `Segmented`; metric state is local, so it resets on remount | Extend to a bounded checklist (plan §4). |
| `MetricChart` | `src/components/charts/MetricChart.tsx` L35–178 | Rebuilds `chartData` with `useMemo` on `series`; the whole `LineChart` re-renders on every `currentTime` change (every frame during playback); `Line` has **no** `isAnimationActive={false}`; `type="monotone"` with `connectNulls` | Animation and monotone smoothing can overshoot and bridge gaps. That conflicts with "preserve gaps and spikes". |
| RL charts | `src/components/charts/RlCharts.tsx`, `PerSeedChart.tsx` | Every series sets `isAnimationActive={false}` (RlCharts L148–500, PerSeedChart L204) | This is the precedent for disabling Recharts animation. |
| Decimation | `src/lib/trajectory.ts` L85–94 `decimate` | Stride sampling, not min/max | Not suitable for envelopes. A new min/max binning helper is needed. |

### 3.4 Pages and shared interactive components

| Component | Path | Interactive elements | Motion today | Focus/a11y today |
|---|---|---|---|---|
| App shell | `src/App.tsx` L276–301 | Page switch by state; one `main` scroller (`overflow-y-auto`) shared by all list pages | None | Focus is not moved on page change; the shared scroller may keep the previous scroll position (**Not verified** in browser) |
| NavRail | `src/components/shell/NavRail.tsx` | Section buttons, Open folder, Forget | `transition-colors` (L47) | No `aria-current` (grep found none) |
| HomePage | `src/components/pages/HomePage.tsx` | Tiles, Open folder, View all | `transition-colors` (L24) | Default only |
| RunsPage | `src/components/pages/RunsPage.tsx` | Search input (L52), seed buttons via `shared.tsx` | None | Input: `outline-none focus:border-accent` |
| ExperimentsPage | `src/components/pages/ExperimentsPage.tsx` | Experiment cards, show-training toggles | `transition-colors` (L36) | Default only |
| ExperimentPage | `src/components/pages/ExperimentPage.tsx` | Tabs, cards with `aria-pressed` (L744), episode buttons (L283–291), table toggle | `transition-colors` | `aria-pressed` on cards only |
| TrainingRunPage | `src/components/pages/TrainingRunPage.tsx` | Watch in 3D, pager (L98–108) | None | Default only |
| PlayerPage | above | See §3.1 | — | — |
| shared | `src/components/pages/shared.tsx` | Run rows, seed buttons (L171–189) | `transition-colors` | Default only |
| BaselineInfo | `src/components/pages/BaselineInfo.tsx` | SVG figure (`aria-label` L200) | Global `circle` transition (`src/index.css` L51–56) | — |
| ExperimentSetup | `src/components/rl/ExperimentSetup.tsx` | Search, group chips, feature list | `transition-colors` | `aria-label`, `aria-pressed`, `aria-live` (L178–219): the only complete example |
| ReplayPicker | `src/components/rl/ReplayPicker.tsx` | 3 selects, Change replay/Done, Watch in 3D | None | Labels wrap the selects (good); selects use `focus:outline-none` with a border-only focus |
| Insights | `src/components/rl/EvaluationInsights.tsx`, `TrainingInsights.tsx` | Charts | Not inspected beyond the RlCharts flags | Not verified |
| ComparisonTable | `src/components/ComparisonTable.tsx` L370 | Show/Hide table | None | Default |
| ExperimentStatus | `src/components/ExperimentStatus.tsx` L159 | Fetch toggle | None | Default |
| EventLog | `src/components/EventLog.tsx` L31 | Clear | None | Default |
| InfoPanel | `src/components/InfoPanel.tsx` L141–233 | Flow and node list buttons | `transition-colors` | Selected state is visual only (no `aria-pressed`) |
| Button | `src/components/ui/Button.tsx` | Variants primary/secondary/ghost/icon-round/link | `transition-colors` | No `type="button"`, no `aria-pressed` for `active`, no `aria-label` prop (icon buttons rely on `title`) |
| Segmented | `src/components/ui/Segmented.tsx` | Pill buttons | `transition-all` (L38) | No `aria-pressed`/radiogroup; no arrow-key handling |
| Disclosure | `src/components/ui/Disclosure.tsx` | Show/Hide | None (content mounts/unmounts) | No `aria-expanded`/`aria-controls` |
| Breadcrumbs / PageHeader | `src/components/ui/Breadcrumbs.tsx` L17; `PageHeader.tsx` L22 | Crumb buttons | `transition-colors` | Default |
| Panel, Row, StatItem, Badge, BrandMark | `src/components/ui/*` | Non-interactive (not opened in full) | — | — |
| 3D canvas | `src/components/canvas/NetworkCanvas.tsx` L48–55; `Scene.tsx` L119–160 | Mesh click selects; `onPointerMissed` clears; OrbitControls (damping not configured, so drei defaults apply) | `frameloop="always"`; `RainEffect`, `TrafficFlow` use `useFrame` | No keyboard path into scene selection (the Nodes list is the keyboard path) |
| NodeObject | `src/components/canvas/NodeObject.tsx` L31, L66 | — | **Ignores `alphaRef`** (`_alphaRef`); position is set per React render at frame cadence | Contradicts CLAUDE.md's "imperative `useFrame` updates" for nodes. Movement steps at frame cadence rather than interpolating. |

Global CSS (`src/index.css`): no `prefers-reduced-motion`, no `:focus-visible` rule. `input[type=range]` sets `outline: none` (L63), so the scrubber has **no visible keyboard focus**. The repo has no keyboard shortcuts (grep for `keydown`/`onKeyDown`: none). Bracket and number keys are therefore free, but no binding policy exists.

## 4. Where the visual explorer joins exact producer records

### 4.1 Join points

| Join | Exact rule | Code location to change |
|---|---|---|
| Clock → action n | Choose the record whose half-open outcome window contains t. Keep the existing `decisionAt`. | `src/lib/episodeTelemetry.ts` L113–141 (keep); called from the new explorer component |
| Action n → input | `byDecision.get(n − 1)`, built once per parse. When both `steps.jsonl` and DR-1 exist, also require DR-1 `input.source_decision == n−1`, `input.tick == outcome.tick − ticks_in_step`, and `input.obs_sha256` == steps record n−1 `obs_sha256`. If any piece is missing, show "Input not recorded". | New pure helper beside `decisionAt` in `episodeTelemetry.ts`, e.g. `inputFor(index, n)`, plus a `decision → record` `Map` built in `parseSteps` |
| Mask shown with action n | From record n−1 only. Record n's mask is labelled "mask after this action" or hidden. | `EpisodeDetails.tsx::DecisionView` L242–267 (T0 fix) |
| Requested/revalidated/applied | requested = `action_sent` (n); revalidated = `revalidated_slots` (n); applied = derived (hold at revalidated), labelled "derived" | `slotActions` (`episodeTelemetry.ts` L152–160) extended, or a new helper |
| Reward | Record n, network-wide; null at decision 0 shows "not yet awarded" | Existing `DecisionView` L269–284 |
| Node ID ↔ slot ↔ scene | `slot = slot_node_ids.indexOf(id)` (skip `null`); scene id = CSV `node_id` mapped from `node_ids` position (**the equality is Not verified**) | Lift a `selectedNodeId: string \| null` into `PlayerPage`; derive `selectedNode` (number) and `trailNode` from it; reuse `controlledNodeIndices` |
| Decision → frame | Binary-search `sim.frames[].time` for the first frame with `time ≥ interval.end − ε`. If it lies outside the interval, report "no frame at this decision". Then `pause()` + `onSeek(i)`. Rounding rule to be fixed and tested (plan §3). | New pure helper in `src/lib/` (no existing helper found); wired in `PlayerPage` |
| DR-1 sidecar (T1, later) | `policy_decisions_manifest.json` + `policy_decisions.jsonl`, on demand per episode | Add names to `READER_FILE_NAMES` (`src/lib/resultCatalog.ts` L15–36). All three discovery paths go through `isReaderFileName`/`isCatalogFile` (`resultCatalog.ts` L116, L122, L127, L150; `vite-plugin-outputs.ts` L38). Locate files in `experimentIndex.ts` L340 and `trainingRun.ts` L103. |
| Training rollouts | Currently excluded except `rl_episode.json` (`resultCatalog.ts` L42–61) | Needs a bounded design; do not remove the guard wholesale |
| Explanation sidecar (T2) | NO-GO. Render "Influence unavailable" regardless of any file present until a human accepts a validated method. | No code path should read `policy_explanations*` in this phase |

### 4.2 States the explorer must render (no fabricated values)

| State | Trigger | Display |
|---|---|---|
| No telemetry | `episode.files.steps` null | "Decision telemetry was not saved" (existing L329–334) |
| Reset | t at decision 0 | "Initial state; no action yet" |
| Input not recorded | n−1 absent or hash mismatch | Action and reward only; inputs and mask unavailable |
| Sampled / capped / gap | DR-1 coverage `gaps`, `status=capped` | Explicit gap marker; no interpolation |
| Not a controlled node | Selected ID not in `slot_node_ids` | "Not policy-controlled" |
| Baseline / hold / random | `episode.policy !== 'model'` or `rlBaseline` | No preferences; existing HoldPolicy note (`EpisodeDetails.tsx` L84–90) |
| Training episode | `playing.kind==='training'` | Context only; no preferences, no model identity |
| Influence | Always in this phase | "Influence unavailable" (never 0, never bars) |

## 5. Risks

| ID | Risk | Evidence | Mitigation |
|---|---|---|---|
| R1 | A padded `null` in `slot_node_ids` renders a second "All nodes" chip with a duplicate React key `'all'`. `ContractView` would list `null` as missing. | `EpisodeDetails.tsx` L456–468; `trajectory.ts` L30–33; contract cast unchecked at `experimentIndex.ts` L397; producer pads `null` (feasibility §4) | Filter `null` slots at parse; widen the types to `(string \| null)[]`; add a test. Whether the eval manifest contract also pads is **Not verified**. |
| R2 | Rapid episode switching: an older `loadFiles` can resolve after a newer one and overwrite frames for the wrong episode. `playTrainingEpisode` has no in-flight guard. | `useSimData.ts` L220–271; `App.tsx` L88–99 | Add a load generation counter in `useSimData` and ignore stale resolutions. Disable or ignore training plays in flight. |
| R3 | The remount on episode change discards node/tab/chart state. The plan requires preserving compatible choices. | `App.tsx` L203 | Lift `selectedNodeId`, tab and chart selection into `App` or a small context, keeping the key-based remount for sim-local state. |
| R4 | The chart re-renders the full Recharts tree every frame. Default line animation plus `monotone` and `connectNulls` misrepresent gaps. | `MetricChart.tsx` L118–139 | Memoize lines separately from the cursor, set `isAnimationActive={false}`, use `type="linear"`, keep nulls as gaps, and bin with min/max. |
| R5 | `parseSteps` holds all `facts` in memory. A 10-node, 12k-decision DR-1 file is ≈55 MB by extrapolation from feasibility §7.6; this is not a measured browser load. | `episodeTelemetry.ts` L53–92 | Measure first; then index and drop `facts`, or move parsing to a worker. No new dependency. |
| R6 | Below `lg` the sidebar (Episode tab) is hidden, so there is no explorer on narrow screens. | `PlayerPage.tsx` L332 | Decide on a narrow layout (bottom sheet or tab) before building. |
| R7 | Scene click forces the Overview tab. | `PlayerPage.tsx` L155 | Keep Episode when the explorer is open. |
| R8 | NodeObject does not interpolate, so "smooth" node microanimation would need `useFrame` work in a 60 fps path. | `NodeObject.tsx` L31, L66 | Out of scope for minimal polish. If done, keep it imperative and honour reduced motion. |
| R9 | No component or browser test harness exists. Tests are pure `node --test` (`package.json` L14). | 17 files in `tests/` | Use pure tests for joins plus a written browser charter. |

## 6. App-wide microanimation and interaction scope

The constraints come from `MEMORY.md`/`src/CLAUDE.md`: calm screens, no gradients, no arrows on buttons, existing glass/ink/blue palette, no new runtime dependency.

| # | Change | Files | Why minimal |
|---|---|---|---|
| M1 | Honor `prefers-reduced-motion` for every newly animated surface and audit existing motion. A scoped CSS rule or carefully tested global fallback may be used; do not erase meaningful state changes or focus indication. | `src/index.css` and animated components | Reduced-motion behavior is part of the acceptance matrix, not merely one blanket rule. |
| M2 | A visible `:focus-visible` ring (accent, 2px, offset) for `button`, `select`, `input`, `[tabindex]`, and restored focus for `input[type=range]` (currently `outline:none`, L63). | `src/index.css` | One CSS block; no component churn. |
| M3 | Replace `transition-all` with `transition-colors`/`transition-[left]` and one shared duration (e.g. 150 ms ease-out) in `Segmented` and the `Switch`. | `ui/Segmented.tsx` L38; `EpisodeDetails.tsx` L362 | Avoids animating layout properties. |
| M4 | Add semantics to primitives: `type="button"` and `aria-pressed` for `active` in `Button`; `aria-pressed` per option in `Segmented`; `aria-expanded` and `aria-controls` in `Disclosure`; `aria-current="page"` in NavRail. | `ui/Button.tsx`, `ui/Segmented.tsx`, `ui/Disclosure.tsx`, `shell/NavRail.tsx` | Primitives fan out app-wide. |
| M5 | Scrubber `aria-label="Playback time"` and `aria-valuetext` = time; play/pause `aria-label`. | `PlaybackControls.tsx` L32–65 | Two attributes. |
| M6 | Disable Recharts animation in `MetricChart`, matching RlCharts. | `charts/MetricChart.tsx` L129 | One prop; also a performance gain. |
| M7 | Rapid navigation: a stale-load guard in `useSimData.loadFiles`; an in-flight guard for training play; on page change, reset `main` scroll to the top and move focus to the page heading. | `hooks/useSimData.ts`, `App.tsx` | Fixes a correctness issue; no animation needed. |
| M8 | Explorer-only motion: one cursor position (no tween), a short opacity/colour change on decision change, no motion per decision marker, and a disabled tween under reduced motion. | New explorer component | Keeps the 60 fps path free of React state (`frameAlphaRef` rule). |
| M9 | Add restrained transitions for the **existing whole-app interaction families**: Home/Runs/Experiments/Experiment/Training/Player page entry and interruption; tab/segmented switches; buttons, cards, rows and chips; disclosure/panel open-close; search/filter and loading/error/empty states. Define shared duration/easing tokens, exact owners and a normal/reduced-motion coverage matrix. | App shell, shared UI and page components identified in §3.4 | M1–M8 alone fix focus/races and polish the explorer, but do not deliver the user's requested app-wide microanimations. Avoid `transition-all`, delayed input and playback-tied animation. |

Keyboard bindings: none exist. If the explorer adds previous/next decision keys, scope them to the focused explorer region. Ignore them while focus is in `input`/`select`/`textarea`, and document them. Do not add global keys without a decision.

Performance guardrails: never put explorer state in the RAF loop. Derive the current decision with `useMemo` on `frameIndex` (O(log n) via `decisionAt`). Parse once per episode and cache by `episode.dir` (bounded, e.g. last 2). Measure before and after on a synthetic 12k-decision episode and a multi-link CSV, on one agreed machine (plan §4, §6).

## 7. Proposed file ownership for the implementation plan (proposal only)

| Slice | Files | Gate |
|---|---|---|
| T0 join fix and tests | `src/lib/episodeTelemetry.ts`, `src/components/EpisodeDetails.tsx`, `tests/episodeTelemetry.test.ts` | None; uses existing data |
| Node identity and decision seek | `src/components/pages/PlayerPage.tsx`, `src/App.tsx`, `src/lib/trajectory.ts` (+ new pure helper and test) | T0 |
| Explorer panel (T0 data) | New `src/components/rl/DecisionExplorer.tsx` (one component), reusing `Row`, `Segmented`, `Disclosure` | T0 |
| Charts checklist and envelopes | `src/components/charts/ChartsView.tsx`, `MetricChart.tsx`, new binning helper + test | Measurement |
| App-wide motion/focus | `src/index.css`, app shell, shared UI, relevant page/card/row owners from §3.4, `PlaybackControls.tsx`, `hooks/useSimData.ts`; Planner freezes a coverage matrix and file list | None; producer schema not needed |
| DR-1 reader (T1) | `src/lib/resultCatalog.ts`, new `src/lib/policyDecisions.ts`, vendored schemas + SHA-256 pin test | Published producer schema and fixtures |
| Influence (T2) | none | NO-GO |

## 8. Not verified

- PR #4's **current** live status and base (previously verified open draft, `docs/rl-gui-integration` ← `feat/baseline-gui-consumer`); recheck before branching/PR.
- Whether the CSV `node_id` equals the position in `contract.node_ids` for every scenario.
- Whether `eval_manifest.json` `contract.slot_node_ids` contains `null` padding in real outputs (the producer header does, per feasibility §4).
- Trained-model, real-binary and production-loop validation (R1–R6); the synthetic Tester report exists in `/private/tmp/…/phase3-6A-feasibility-test-results.md` and reports 7 PASS, 0 FAIL, but does not clear these blocks.
- Browser behavior: scroll persistence across pages, OrbitControls damping defaults, actual frame cost of `MetricChart` during playback, and parse time for large `steps.jsonl`.
- Contents of `EvaluationInsights.tsx`, `TrainingInsights.tsx`, `Panel.tsx`, `Row.tsx`, `StatItem.tsx`, `Badge.tsx` and `BrandMark.tsx` beyond grep results.
- That no keyboard handling exists inside third-party components (Recharts, drei).

## 9. Planning and publication boundary

The single combined GUI plan should cover both the visual, per-node/per-decision explorer and restrained app-wide microanimations, with T0/independent motion work separable from T1/schema-dependent work. It must keep sampled/capped gaps explicit, reuse existing node/SINR/chart data, default to a compact visual view with optional detail, and say plainly that preferences and observed context support a **rough, non-causal interpretation**, not a proven reason for a PPO action. No influence bars or explanation sidecar are authorized. Keep this Scout, both private plans, feasibility scripts/reports, real data and run outputs out of commits; public PR title/body and durable code/docs should describe functionality, not personal phase numbers.
