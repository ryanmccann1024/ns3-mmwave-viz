# Source map {#source_map}

[TOC]

Where things live in `src/`, grouped by what they do. Roles come from the project's `CLAUDE.md`, `src/CLAUDE.md` and the README's \ref viz_readme_architecture "Architecture Overview". Links resolve from the generated site (`docs/html/`) to files in this repository; in a source viewer, read the path text.

## Start here

The files a new reader opens first.

| Path | Role |
|---|---|
| [src/App.tsx](../../src/App.tsx) | Layout, page state and breadcrumbs (no router library), logging wiring, responsive breakpoints |
| [src/hooks/useSimData.ts](../../src/hooks/useSimData.ts) | Playback state machine: frames, play / pause / seek / speed, file parsing, scene bounds |
| [src/lib/parseSimFiles.ts](../../src/lib/parseSimFiles.ts) | CSV/JSON parsing (positions, links, buildings, meta) |
| [src/lib/assembleRuns.ts](../../src/lib/assembleRuns.ts) | Directory traversal, run discovery, dev-server fetch |
| [src/components/canvas/](../../src/components/canvas/) | Three.js scene components |
| [src/components/canvas/utils/coordinates.ts](../../src/components/canvas/utils/coordinates.ts) | `simToThree`, `interpPos`, `headingRotation`: sim coordinates to Three.js |
| [src/components/pages/](../../src/components/pages/) | Home, runs, experiment, training-run and player pages |
| [src/styles/tokens.ts](../../src/styles/tokens.ts) | Design tokens (colors, sizes, labels) |

## Loading and state

| Path | Role |
|---|---|
| [src/hooks/useWorkspace.ts](../../src/hooks/useWorkspace.ts) | The open outputs folder: runs, result catalog, experiment roots (dev server, cached folder handle or picker) |
| [src/lib/folderFilter.ts](../../src/lib/folderFilter.ts) | Which subfolders the lists show, saved per outputs folder |
| [src/lib/directoryCache.ts](../../src/lib/directoryCache.ts) | IndexedDB persistence for File System Access directory handles |
| [src/hooks/useSimLog.ts](../../src/hooks/useSimLog.ts) | In-memory event log (500 entry cap) |
| [src/hooks/usePlaybackLog.ts](../../src/hooks/usePlaybackLog.ts) | Wraps the event log with load, playback, node and link events |
| [src/types.ts](../../src/types.ts) | Shared TypeScript interfaces |

## 3D scene

| Path | Role |
|---|---|
| [src/components/canvas/NetworkCanvas.tsx](../../src/components/canvas/NetworkCanvas.tsx) | Thin `<Canvas>` wrapper |
| [src/components/canvas/Scene.tsx](../../src/components/canvas/Scene.tsx) | Maps data to 3D objects, selection highlighting, camera positioning |
| [src/components/canvas/NodeObject.tsx](../../src/components/canvas/NodeObject.tsx) | Per-node mesh, label and selection ring, updated every tick in `useFrame` |
| [src/components/canvas/LinkObject.tsx](../../src/components/canvas/LinkObject.tsx) | Per-link line and label |
| [src/components/canvas/BuildingObject.tsx](../../src/components/canvas/BuildingObject.tsx) | 3D building boxes |
| [src/components/canvas/SceneEnvironment.tsx](../../src/components/canvas/SceneEnvironment.tsx) | Lights, ground plane, grid |
| [src/lib/trafficRoutes.ts](../../src/lib/trafficRoutes.ts) | Traffic pulses: delivered flows on live paths only |

## Jamming map

| Path | Role |
|---|---|
| [src/lib/jammerField.ts](../../src/lib/jammerField.ts) | Ports the simulator's JammerModel gates and ns-3 3GPP UMa / UMi / RMa path loss with building LOS (no shadow fading); computed in a worker pool ([jammerField.worker.ts](../../src/lib/jammerField.worker.ts)) |
| [src/components/canvas/JammerVolumeLayer.tsx](../../src/components/canvas/JammerVolumeLayer.tsx) | 3D ray-marched shells at 0 / 10 / 20 / 30 dB; rays stop at buildings |
| [src/components/canvas/JammerFieldLayer.tsx](../../src/components/canvas/JammerFieldLayer.tsx) | The same field as a slice |
| [src/lib/runIni.ts](../../src/lib/runIni.ts) | Reads the channel settings from the run's archived `inputs/run.ini` |

The jamming map must stay in step with the simulator's `src/jammer/` module; tests pin values from a shadowing-off simulator run.

## RL results and decisions

| Path | Role |
|---|---|
| [src/lib/trainingRun.ts](../../src/lib/trainingRun.ts) | Reads a training folder (`train_manifest.json`, episode `rl_episode.json` files, `evaluations.npz` via [npz.ts](../../src/lib/npz.ts)) |
| [src/lib/rlStats.ts](../../src/lib/rlStats.ts) | Chart maths: rolling mean / SD, per-decision bands across seeds, action shares |
| [src/components/charts/RlCharts.tsx](../../src/components/charts/RlCharts.tsx) | The RL charts |
| [src/lib/campaignIndex.ts](../../src/lib/campaignIndex.ts) | Assembles adaptive campaigns into one page per physical scenario |
| [src/lib/missionCampaignIndex.ts](../../src/lib/missionCampaignIndex.ts) | Mission scenario indexes (versions 1 and 2), training seeds, stages and shared baseline episodes |
| [src/lib/missionObjective.ts](../../src/lib/missionObjective.ts) | Picks the best reward / PPO / mode variant per mission from its outcome |
| [src/lib/scenarioInputs.ts](../../src/lib/scenarioInputs.ts) | Recovers an episode's scenario files from the catalog, accepted only on a matching SHA-256 |
| [src/components/decisions/](../../src/components/decisions/) | The Decisions tab |
| [src/lib/decisionExplorer.ts](../../src/lib/decisionExplorer.ts) | Integer-keyed `steps.jsonl` index, exact n−1 input join, derived applied action |
| [src/lib/nodeIdentity.ts](../../src/lib/nodeIdentity.ts) | Checked ordinal mapping between telemetry node slots and CSV node ids |
| [src/lib/frameSeek.ts](../../src/lib/frameSeek.ts) | Interval-checked seek to the last real frame inside a decision's outcome interval |

What these read and how missing data is shown is described in the README's \ref viz_readme_rl_results "Reading RL experiment results" and \ref viz_readme_decisions "Decisions tab".

## Styling

| Path | Role |
|---|---|
| [src/styles/tokens.ts](../../src/styles/tokens.ts) | Single source of truth for colors, sizes, labels and Tailwind class mappings |
| [src/styles/motion.ts](../../src/styles/motion.ts) | Shared transition class strings; timing and easing tokens live in `tailwind.config.js` |
| [src/index.css](../../src/index.css) | Surface classes, `prefers-reduced-motion` and `:focus-visible` rules |
| [src/components/ui/](../../src/components/ui/) | Reusable primitives (Button, Badge, Panel, Segmented, StatItem, Disclosure, …) |
