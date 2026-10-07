# Phase 3 Scout — Decision explorer: GUI consumer

Scope: read-only discovery for Phase 3 of `mesh-sim-baseline-integration-plan.html`. Producer, timing and influence details are in the companion report `/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave/scratch/mesh-sim/feature-research/phase-3-decisions/scout.md`.

Date: 2026-09-30. Nothing was built, run or modified apart from this file.

## 1. Repository state

| Item | Finding | Status |
|---|---|---|
| Repo | `/Users/ryanmccann/Desktop/git.nosync/ns3-mmwave-viz` | Verified |
| Branch | `feat/baseline-gui-consumer` (Phase 2 work) | Verified via `.git/HEAD` |
| Dirty files | Codex follow-up ran `git status --short --branch` on 2026-09-30: **no tracked changes**; only untracked `feature-research/phase-2-baseline-gui/` and `feature-research/phase-3-decisions/`. The recently modified source files are already committed on this branch. | Verified at review time; recheck before implementation. Phase 2 is an open draft PR, so the Planner must choose and document a deliberate Phase 3 base/stack rather than accidentally mix changes. |
| This report | `feature-research/` is not ignored by `.gitignore` or `.git/info/exclude` | Verified. The report is untracked, so keep it out of commits. |
| Design reference | `/Users/ryanmccann/Documents/Codex/2026-09-29/hell/outputs/decision-dashboard/{app.mjs,data.mjs,index.html,styles.css}` | Exists. Its synthetic data and influence code must not be copied. |

## 2. Existing surfaces (verified)

| Surface | File / symbol | Behavior relevant to Phase 3 |
|---|---|---|
| Router and play paths | `src/App.tsx` `openEpisode` L101–122, `playTrainingEpisode` L88–99, `rl` context L178–195, `PlayerPage key` L203 | The `rl` context is built **only for evaluation episodes** (`playing.kind === 'episode'`). Training episodes and ordinary runs get `rl=null`, so there is no Episode tab. `key = episode.dir` remounts the player on every episode change, which resets player-local tab, node and view state; parent-owned state may persist. |
| Player | `src/components/pages/PlayerPage.tsx` | Scene selection `selectedNode: number` is the CSV node index (L141). The RL node filter `trailNode: string` lives separately in `useExperimentSession` (L41–42). The sidebar tabs are Episode/Overview/Nodes/Log (L182–187). The main area toggles 3D/Charts (L238–245). |
| Episode panel | `src/components/EpisodeDetails.tsx` | "Follow one node" is already a chip row of `slot_node_ids` (L452–473), so chips can grow out of it. "Decision at this moment" reads `steps.jsonl` lazily when opened (L294–352). `DecisionView` is a text-row list (L194–292). |
| Telemetry reader | `src/lib/episodeTelemetry.ts` | `parseSteps` reads the whole file and keeps `facts` (L53–92). `decisionAt` binary-searches the half-open window `(time_s − ticks_in_step·tick_s, time_s]` (L96–141). Helpers: `slotActions`, `maskBySlot`, `rewardSeries`. |
| Charts | `components/charts/ChartsView.tsx` L19–54, `MetricChart.tsx`, `hooks/useMetricSeries.ts` | One metric at a time through a `Segmented` control. Per-link series (`sinr` from `links.csv`) are keyed `nodeA-nodeB`. Recharts `LineChart` is built from **every frame**, with no decimation. A shared `currentTime` reference line is drawn. |
| RL learning charts | `components/charts/RlCharts.tsx`, `lib/rlStats.ts` | Action shares and reward bands across episodes/seeds. Reusable math. |
| Clock | `hooks/useSimData.ts` | Driven by frame index at the CSV `viz_tick_ms` cadence (default 100 ms). `seek(index)` takes a frame index. `frameAlphaRef` is used for interpolation. |
| Episode navigation | `components/rl/ReplayPicker.tsx` | Picks evaluation episodes by policy and seed. Nothing exists for training episodes inside the player. |
| Catalog | `lib/resultCatalog.ts` `READER_FILE_NAMES` L15–36, `isCatalogFile` L57–61 | Only allowlisted names are indexed, so new sidecars must be added. Training rollouts under experiment `train/<row>/train-seed-N/.../episode-*` keep **only `rl_episode.json`**: no CSVs, no `steps.jsonl`. |
| Feature help | `lib/observationHelp.ts::describeFeature` | Existing feature-name descriptions to reuse in the Inputs details. |
| Tests | `npm test` = `node --test tests/*.test.ts`; `tests/episodeTelemetry.test.ts` and 15 others | Pure-lib test seam only. No component or browser test harness was found (Not verified beyond `package.json` scripts). |

## 3. Verified timing defect in the current consumer

`DecisionView` shows record n's `mask` under "Mask observed at decision time" next to record n's `action_sent` (EpisodeDetails.tsx L213–267). In the producer, record n's mask arrives **after** action n was applied and is the mask for action n+1 (`mesh-sim/scripts/rl/env/mesh_env.py` L134–175, `episode.py::_append_record` L167–172).

The correct join:

- Action n and reward n come from record n. The outcome window is `(t(n−1), t(n)]`.
- The pre-action mask and observation come from record n−1.

With sampled telemetry, record n−1 may be missing. In that case the UI must say "input not recorded". This defect must be fixed, with a regression test, before any Inputs/Action tab is built on it.

## 4. Integration points (proposals, grounded in the files above)

| Requirement | Exact integration point |
|---|---|
| Top-row node chips | Lift node selection into `PlayerPage` as one stable **string node ID**. Map it to the CSV index with `lib/trajectory.ts::controlledNodeIndices` (L24–36) and drive `selectedNode`, `trailNode` and chips from it. Place the chip rail in the PlayerPage header (L191–250). Source it from the contract/roster, and mark policy-controlled slots. |
| Episode and decision navigation | Evaluation: reuse `ReplayPicker` and `openEpisode`. Training: add an `rl`-like context for `playing.kind === 'training'` in `App.tsx` L178. To preserve node/tab across episodes, change the `PlayerPage key` (L203) or lift that state into `App`. Decision seek: map `step.time_s` to a frame index with a binary search over `sim.frames[].time`, then call `onSeek` and pause. |
| Selectable charts (Charts menu) | Extend `ChartsView` from one `Segmented` metric to a checklist of compatible series with at least one selected: selected-node link SINR (filter `useMetricSeries` keys containing the node index), capacity, reward (`rewardSeries`), and action history. Keep one shared cursor. |
| Inputs / Action / Why | A new `NodeDecisionPanel` inside the EpisodeDetails area, fed by proposed `lib/policyDecisions.ts` and `lib/policyExplanations.ts`. The GUI must **not** reimplement observation presets: `feature_names` alone cannot reconstruct the model vector from `facts`. For model-input display, consume a producer-written exact vector or a verified lossless reconstruction artifact; otherwise show clearly labelled raw facts, not falsely labelled normalized model inputs. Action uses recorded probabilities only when available. Why uses validated matching explanations only. |
| Reward view | Reuse `step.reward.components` with the header `reward_schema.weights`. Scope is network-wide, and no per-node reward exists (verified in the producer). |

## 5. Cross-repo identity and time contract (proposal)

- **Episode key:** evaluation dir + policy + `episode-NNNN` + seed. Model identity comes from `eval_manifest.json` `bundle.model_sha256`, which the sidecar header should repeat.
- **Decision key:** action index n (1..N). The input is the exact prior state (normally record n−1 when full cadence is saved) and the outcome is record n. A sparse/capped recording must not pretend the previous *saved* row is n−1. The reset (n=0) has input only. The terminal record's state is never an input.
- **Node key:** string `node_id`. Slot comes from `slot_node_ids`, and the CSV index from its position in `node_ids`. Never use array position across runs.
- **Missing states:** not recorded, context only, sampled, capped, no model (baseline/hold/random), influence unavailable (training), invalid/mismatched hash.

## 6. Performance for 12,000+ decisions (estimates, Not verified)

- `parseSteps` keeps every record's full `facts` in memory. It probably handles tens of MB per episode, but that needs measuring. Candidates: a worker or chunked parse, and dropping `facts` after indexing except for the selected record.
- `MetricChart` renders every frame per link with Recharts SVG. A long episode at 100 ms frames across 45 links is heavy, so apply pixel-bounded min/max binning before Recharts (`trajectory.ts::decimate` exists but is not min/max-preserving).
- Keep a single `Telemetry` load per episode. Today it is inside a Disclosure and re-reads on mount.

## 7. Rollout order (backward compatible)

1. Fix the mask/action join and add tests. This is GUI-only and uses existing data.
2. Add node chips and unified node identity. Make decision navigation seek the existing clock.
3. Add the Charts checklist and the reward view from existing `steps.jsonl`.
4. Add sidecar readers (optional files; allowlist in `resultCatalog`) and the Action tab with probabilities. This depends on the producer PR.
5. Add the Why tab after the influence gate passes. Until then, show "Influence unavailable".
6. Enable the approved recorded-training context/action/reward inspection with bounded access to available telemetry and explicit unavailable states. The catalog's rollout-size guard requires a deliberate design; exact training influence still requires decision-time weights.

## 8. Stop decisions for the Planner

1. Whether Phase 3 branches from `feat/baseline-gui-consumer` or waits for it to merge.
2. How to keep node/tab/charts across episodes: change the `PlayerPage key` or lift state.
3. How to satisfy the approved recorded-training context/action/reward inspection despite the current catalog excluding rollout `steps.jsonl` and training telemetry defaulting to `none`. Design bounded on-demand access/indexing and explicit missing-data states; dropping all training-episode inspection requires human approval.
4. How Inputs gets normalized values: a producer-written vector vs a raw-only display. The GUI must not port presets.
5. Charts-menu contents per observation preset. SINR is a genuine input only for link presets, not `geometry_v1`.

## 9. Planner handoff: GUI consumer

- Start with the join fix in `EpisodeDetails.tsx::DecisionView` and `episodeTelemetry.ts`, using a new exact-input lookup helper and tests; reject missing n−1 instead of taking the previous saved row.
- Unify node identity in `PlayerPage` and chip it in the header. Add decision→frame seeking.
- Extend `ChartsView` with a checklist and decimation.
- Add optional `policyDecisions.ts` and `policyExplanations.ts` readers with identity checks against `eval_manifest.json` for evaluation, plus an explicit training identity/availability contract if training diagnostics are supported.
- Build compact `NodeDecisionPanel` Inputs, Action and Why tabs. Why is shown only when a validated explanation sidecar matches model, observation and mask hashes.
- Performance is measured on a synthetic 12k-decision fixture.
