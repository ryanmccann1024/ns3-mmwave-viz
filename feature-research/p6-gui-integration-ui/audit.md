# UI slice audit (experiment browser, episode details, trails)

## Files changed

Created:
- `src/components/ExperimentBrowser.tsx`
- `src/components/ComparisonTable.tsx`
- `src/components/ExperimentStatus.tsx`
- `src/components/EpisodeDetails.tsx`
- `src/components/canvas/TrajectoryLayer.tsx`
- `src/hooks/useExperimentSession.ts`
- `feature-research/p6-gui-integration-ui/audit.md` (this file)

Modified:
- `src/components/FileLoader.tsx`
- `src/App.tsx`
- `src/components/canvas/Scene.tsx`
- `src/components/canvas/NetworkCanvas.tsx`
- `src/styles/tokens.ts`
- `README.md`

Not touched: every file in `src/lib/`, `vite-plugin-outputs.ts`, `package.json`, `tests/` (their
diffs in `git status` predate this task). Prettier was run only on the eleven `src/` files above.

## What changed per file

- `FileLoader.tsx`: new optional `onOpenExperiment(catalog, root)` prop. Builds a `ResultCatalog`
  next to each legacy source (FSA handle, webkitdirectory FileList, dev server), runs
  `discoverExperiments` (path names only) and lists roots with a kind tag above the run list.
  Root `''` is shown as "<folder> (this folder)". Hint now says `scratch/mesh-sim/outputs` and
  mentions experiment / fetched-results folders. "No runs found" only shows when there are also no
  experiments. Legacy walk/assembly calls are unchanged. Dev auto-discovery is now accepted when
  either runs or experiment roots exist (before: runs only).
- `useExperimentSession.ts`: holds catalog, loaded `Experiment`, selected episode, overlay
  selection and trails. Trails for the opened episode load by default; overlays load on toggle from
  that episode's `positions.csv` only, are dropped when toggled off, and everything is cleared when
  the episode changes. In-flight reads are de-duplicated and stale results ignored.
- `App.tsx`: when not playing and an experiment is open, shows `ExperimentBrowser` full page; the
  loader stays mounted but hidden so a picked folder survives. `handleOpenEpisode` calls
  `episodeFiles()`, shows the message on `{ok:false}` without loading, else `sim.loadFiles`.
  While an RL episode plays: `trails` go to `NetworkCanvas`, a legend is overlaid bottom-left of the
  canvas pane, `EpisodeDetails` sits left of `InfoPanel` (hidden in split view, like InfoPanel).
  "change sim" additionally clears the episode, so it lands on the browser; "← folders" there goes
  back to the loader. Loader wrapper now scrolls (`m-auto` centring) because the card can be taller.
- `ExperimentBrowser.tsx`: header, truncated-listing warning, open error, plan (seeds, rows, reward
  components/weights, observation preset), status section, comparison section, evaluations grouped
  by row then training seed (state badge, message, simulator status, episodes completed/expected,
  held-out flag, overlap warning, fetch task state, on-demand training summary) and a
  policies x seeds episode grid.
- `ExperimentStatus.tsx`: `StateBadge` (five distinct states), `Section`, `Note`, artifact reports,
  issues, on-demand fetch snapshot captioned as a saved snapshot, not live status.
- `ComparisonTable.tsx`: status badge (non-complete reads "<status> — not a complete result"),
  missing evaluations with reasons, caveat + source path + summary.json note, paired tables per
  evaluation and group tables per row, primary metric first, not-comparable marker, null interval
  as "not available" + reason, lazy `episodes.csv`. All numbers go through `formatNumber`; nothing
  is computed. The interval level is printed verbatim ("level 0.95") rather than converted to a
  percentage, to avoid arithmetic in the UI.
- `EpisodeDetails.tsx`: identity/status, controlled nodes with CSV indices and missing-id warning,
  action meanings, outcome with the revalidation note, lazy `rl_episode.json` and `summary.json`,
  telemetry read only when its disclosure is opened, decision from `decisionAt` (actions, mask,
  reward or "not yet awarded", revalidated slots), overlay checkboxes, exported `TrailLegend`.
- `TrajectoryLayer.tsx`: drei `<Line>` per trail, `decimate` to 500 points, `simToThree` with the
  scene's `dim`/`compactFactor`, memoised; exports the `Trail` type.
- `Scene.tsx`, `NetworkCanvas.tsx`: one optional `trails` prop; absent means no change.
- `tokens.ts`: `TRAIL_COLORS`, `TRAIL_COLOR_DEFAULT`, `trailColor()`.
- `README.md`: section "Reading RL experiment results"; `npm test` line in the lint block.

## Deviations

1. The simulator has no `scripts/rl/README.md`. The README links to `scratch/mesh-sim/README.md`
   (its section "Comparing policies and running an experiment matrix") and to
   `scratch/mesh-sim/scripts/rl/ops/README.md`, both of which exist.
2. The optional per-decision reward chart was skipped.
3. Trails draw with `depthTest={false}` so they stay visible through buildings and in 2D view.
4. Collapsing the episode panel closes the telemetry disclosure (it is re-read on reopen).

## Test results

- `npx tsc --noEmit`: clean. `npm run lint`: clean. `npm test`: 30 pass. `npm run build`: succeeds
  (only the pre-existing chunk-size warning).
- Browser check NOT performed: the Chrome extension was not connected. No UI behaviour (rendering,
  console errors, clicking through, legacy run load, production folder pick) has been seen running.
- Substitute checks: dev server started, `/` and the new modules served with 200, `/api/outputs`
  listed `bypass-matrix/experiment_plan.json`. A scratch Node script over the real outputs confirmed
  the data the UI consumes: bypass-matrix gives local-delivery/local-legacy x 101/102, policies
  model/hold/random_valid, 9 episodes each, all `ok`; `episodeFiles` ok for
  local-delivery/101/model/301; `decisionAt(steps, 1.0)` gives `west` (index 0) on node-b;
  controlled index `[1]`, 201 trail points. Dev server was stopped afterwards.

## Open risks

- Everything visual is unverified in a browser (see above), including R3F line rendering and the
  layout of the two side panels at narrow widths.
- `discoverExperiments` treats every `comparison.json` as a root, so the dev outputs directory
  lists about 30 `p0-regression/...` folders as "comparison" entries. Opening one shows the
  regression-schema message. Filtering would need a library change or reading files at discovery.
- In dev, the loader now fetches `/api/outputs` twice (legacy runs + catalog).
- An overlay toggled off while its read is in flight keeps its points in memory until the episode
  changes (not drawn).
- `sim.loadFiles` has no error path; a corrupt CSV in a playable episode fails as it does for legacy.
