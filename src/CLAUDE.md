# src/ Guide

## Component Hierarchy

```
App (router: page state + breadcrumbs, no router library)
├─ NavRail (Home / Simulation runs / RL experiments, open folder; hidden in the player)
├─ pages/HomePage          folder overview tiles, latest experiments and scenarios
├─ pages/RunsPage          scenarios per batch, one button per seed
├─ pages/ExperimentsPage   evaluations and training runs, in two sections
├─ pages/ExperimentPage    tabs: Results (leaderboard, per-seed dots, rl/EvaluationInsights) / Learning / Episodes (3D) / Details
├─ pages/TrainingRunPage   tabs: Learning (rl/TrainingInsights) / Episodes (3D) / Details
└─ pages/PlayerPage        breadcrumbs + 3D or Charts + playback, sidebar tabs Episode / Overview / Nodes / Log
   └─ NetworkCanvas → Scene → NodeObject, LinkObject, BuildingObject, SceneEnvironment
```

## State Flow

- `useSimData` — central hook: frames, playback (play/pause/seek/speed), file parsing, scene bounds
- `useSimLog` — event log buffer (max 500 entries); `usePlaybackLog` wraps it with load/playback/node/link events
- `useWorkspace` — the open outputs folder: runs, result catalog, experiment roots (dev server, cached FSA handle, or picker)
- Selection state (`selectedNode`, `selectedLink`, `selectedFlow`) lives in PlayerPage

## RL data

- `lib/trainingRun.ts` reads a training folder (train_manifest.json, episode-*/rl_episode.json, evaluations.npz via `lib/npz.ts`); an eval links to it through `bundle.run_dir` (`matchTrainingRun`)
- `lib/rlStats.ts` holds the chart maths (rolling mean/SD, per-decision bands across seeds, action shares); charts live in `components/charts/RlCharts.tsx`
- Reward component sums in manifests are unweighted; multiply by the schema weights so they add up to the return
- A standalone eval with `training: null` is baseline-only (`trainingSeed === null`)

## Styling

- Tailwind utility classes for all UI styling
- Design tokens in `styles/tokens.ts` (NODE_COLORS, LINK_COLORS, NODE_BADGE_CLASSES, etc.)
- Use `Button` component for interactive buttons — variants: `primary`, `ghost`, `icon-round`, `link`
- Glass dashboard look (SubmitCue palette): semantic colours `ink`/`muted`/`faint`/`accent`/`hairline` in `tailwind.config.js`; surfaces are the `.glass` (card), `.glass-chip` (over the canvas) and `.tile` (inset) classes in `index.css`
- Cards use `ui/Panel` (title + count pill + actions); pill toggles use `ui/Segmented`; KPI tiles use `ui/StatItem`
- Sans for UI text, `font-mono tabular-nums` only for numbers, paths and ids
- No arrow glyphs on buttons and no gradients; secondary detail goes behind tabs or `ui/Disclosure` (Show/Hide)
- List-item buttons (file list, node list) use raw `<button>` with contextual styling

## Canvas Architecture

- `NetworkCanvas` is a thin `<Canvas>` wrapper with `frameloop="always"`
- `Scene` maps data to 3D objects, handles selection highlighting, camera positioning
- `NodeObject` / `LinkObject` use `useFrame` for imperative position updates every tick
- `frameAlphaRef` (mutable ref) provides smooth interpolation between frames without React re-renders
- Coordinate conversion: `simToThree()` in `canvas/utils/coordinates.ts`
