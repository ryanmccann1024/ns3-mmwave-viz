# NYU Mesh Viz

A browser-based 3D visualizer for ns-3 mmWave mesh simulations (Mesh-Sim), built with React and Three.js.

It replays simulation runs as a 3D scene and reads saved reinforcement-learning (RL) experiments and mission campaigns. It only reads results: it never runs the simulator, trains a model or submits jobs.

## Features

- **Run replay.** Nodes, links, buildings, jammers and traffic routes in 3D, played at 0.5× to 10× speed, with node and link inspection and time-series charts.
- **Jamming map.** Ray-marched 3D shells at 0, 10, 20 and 30 dB around each jammer, stopped by buildings and computed from the run's archived channel settings.
- **Reward map.** For RL episodes, a 2D map of the reward the selected node would have earned at each point, with its reachable moves and the best one marked.
- **RL experiments.** The exact observation, action and reward; training curves; held-out results against hold and random policies; individual episodes in 3D; and a head-to-head compare of two policies on the same seed.
- **Mission campaigns.** Numbered campaigns and `phase-N` folders shown as projects, one page per scenario, team sizes switched in place, and reward comparisons across phases.
- **Decisions.** Step through a policy's saved decisions: what it saw, what it sent, what was applied and the reward that followed.
- **Baselines.** Geometric and optimization baseline runs appear in the run list, on experiment pages and in the player.

## Prerequisites

- Node.js 22.13 or newer
- npm 9 or newer

## Getting Started

```bash
npm install
npm run dev
```

Open the URL Vite prints (`http://localhost:5173` by default).

## Loading a Simulation

1. With `npm run dev`, the sibling `../ns3-mmwave/scratch/mesh-sim/outputs` folder is opened automatically, or the folder you opened last time. Otherwise click **Open folder** and pick the outputs root, not a date or seed subfolder.
2. Open **Folders** and tick the subfolders to show, or click **Show all**. Nothing is listed until you do. The choice is saved per outputs folder.
3. Open **Simulation runs** and click a seed to load it in the player.

In a production build (`npm run build && npm run preview`, or any static host), outputs are always chosen with the browser folder picker. You can pick the outputs folder, a single experiment folder or a fetched-results folder.

## Data Format

The visualizer reads the per-seed files written by the Mesh-Sim simulator. The simulator owns the file and column definitions; see `scratch/mesh-sim/src/io/README.md` in the `ns3-mmwave` repository.

A run is a `seed-N/` folder holding both `positions.csv` and `links.csv`, at least three folder levels below the outputs root. The simulator's default layout:

```text
outputs/
  YYYY-MM/
    DD/
      HH-MM-SS/
        seed-N/
          links.csv
          positions.csv
          buildings.json   (optional)
```

- **Optional files** next to the CSVs, or shared from the run's `inputs/`, are attached when present: `buildings*.json`, `flows.csv`, `routes.csv`, `nodes.json`, `jammers.json`, `run.ini`, `mcs.csv` and `rx-power.csv`.
- **Header comments** such as `#tickMs=100` carry simulation metadata (scenario, frequency, transmit power, tick length).
- **RL episodes** (paths containing `episode-NNNN`) are listed under **RL experiments** instead of **Simulation runs**.
- **Baseline runs** live at `outputs/YYYY-MM/DD/HH-MM-SS-baseline[-N]/baseline_manifest.json`. Runs with only a manifest are listed but cannot be played.

## Mission experiments

Mission campaigns appear as projects under **RL experiments**. A campaign is a numbered folder such as `10-16-2`, an explicit `phase-N` folder, or a batch root with a version 4 scenario index. Each project has a **Main** group and one page per physical scenario. Training, checkpoint validation and baseline caches stay available as files but are not listed as separate experiments.

- **Scenario cards** show the best reward/PPO/mode variant for the mission (for example final coverage with a service floor, investigation completion, sustained recovery, or jammer service-disruption seconds), averaged over seeds within that variant. Confirmation results take precedence once available.
- **Team sizes** of the same scenario (for example `urban-recovery-3-peers`, `-6-peers`, `-9-peers`) share one card. The scenario page switches peer count in place.
- **Reward comparison** across phases is shown as ranked bars, a scorecard, a dot plot or a trade-off chart.
- **The Results tab** has mission and radio timelines for service, LOS, SINR, coverage, arrival, remaining target distance and distance travelled. LOS and SINR leave out unavailable peers.
- **The How it works tab** explains each reward term and how its coefficients changed.
- **Pending work** (planned or running comparisons) stays visible while results are on their way. Use refresh as a campaign completes stages.

## Reading RL experiment results

Results are produced with the simulator's own CLI; see `scratch/mesh-sim/README.md` and `scratch/mesh-sim/scripts/rl/ops/README.md` in the `ns3-mmwave` repository.

Open **RL experiments**, then an experiment card. Inside an experiment:

| Tab | Shows |
|-----|-------|
| **Observation · action · reward** | The exact input vector, action masks and weighted reward |
| **Learning** | Training episode return (averaged across training seeds) and the model-selection checkpoint curve |
| **Results** | Delivery-first PPO, hold and random comparisons, with paired per-seed differences |
| **Episodes (3D)** | Individual policies replayed on the same seed, with a head-to-head **Compare** view |

**Seeds.** Training seeds (for example 101–103) update the model. The model-selection seed (for example 201) picks the saved checkpoint and is not a held-out test. Held-out evaluation seeds (for example 301–305) compare that frozen model with hold and random. Five evaluation seeds are not five independently trained models.

**What it reads.** `experiment_plan.json`, each `eval_manifest.json`, `comparison/comparison.json` and, when present, `fetch_manifest.json`. The rest (`train_manifest.json`, `episodes.csv`, an episode's `rl_episode.json`, `summary.json`, CSVs, `inputs/`, `steps.jsonl` and a training run's `evaluations.npz`) is read only when you open it. Model archives are never read. Paths are matched relative to the folder you opened; absolute paths inside manifests are ignored.

**Intervals.** Means and intervals come from `comparison.json`; the app does no statistics of its own. A *paired* interval is the spread across evaluation seeds for one trained model. A *group* interval is the spread across training runs of the same row. When the simulator recorded no interval, the table says "not available" and gives the recorded reason.

**Missing results.** An evaluation can be `incomplete`, `failed`, `missing` (planned but not in the folder) or `not fetched` (left out of a fetched snapshot). An episode without `links.csv` and `positions.csv` cannot be played. Fetch status is a saved snapshot, not a live queue.

### Decisions tab

In an evaluation episode, choose **Decisions** in the player header. It shows one chip per policy slot, a timeline of every decision (unsaved decisions are hatched, never filled in), a detail card and a scrolling list. Clicking a decision pauses playback and seeks to the last frame inside that decision's outcome interval.

The card shows only what `steps.jsonl` records:

- **Inputs** come from record n−1: its tick, time, observation hash and per-slot mask. If that record was not saved, the card says "not recorded" rather than using an older one.
- **Action** shows the action sent, whether the mask allowed it, and the **applied (derived)** action, which replaces each revalidated slot with the contract's `hold`.
- **Context** shows the outcome interval, the network-wide reward and its components, and the selected node's links at that frame.

The tab does not say *why* a policy chose an action; model preferences are not in `steps.jsonl`. Decision data appears only if the evaluation saved `steps.jsonl`; playback works without it.

## Controls

| Control | Action |
|---------|--------|
| Drag | Orbit camera |
| Right-drag | Pan camera |
| Scroll | Zoom |
| Play / Pause | Play or pause |
| Timeline | Jump to any frame |
| Speed | 0.5×, 1×, 2×, 5× or 10× |
| **To scale** / **Compact** | Keep true geometry, or compress large scenes |
| **Jamming map** | Show or hide jammer coverage (remembered between visits) |
| **Reward map** | Show or hide the reward map; its menu picks the field and colour scale (RL episodes) |
| **3D** / **Charts** | Swap the scene for time-series charts (plus **Compare** and **Decisions** for RL episodes) |
| Sidebar tabs | **Overview**, **Nodes** and **Log** (plus **Episode** for RL episodes) |
| Click a node | Inspect the node |
| Click a link midpoint | Inspect the link |
| Click empty space | Deselect |

## Understanding the Visualization

- **Nodes** are schematic models: a person (ground), a drone (air), a car (vehicle), a mast (base station), an icosahedron (gateway) and an octahedron (generic peer). Inactive nodes turn grey, and other nodes dim while one is selected.
- **Links** are green when connected with line of sight, yellow when connected without it and grey when disconnected. Non-line-of-sight links are dashed. "Connected" means the recorded `capacity_mbps` is above zero (or the column is absent), not that traffic was delivered.
- **Motion** between saved frames is interpolated for display, and **Compact** mode compresses distances. Use the recorded coordinates for measurements.

## Event Log

The player's **Log** tab lists replay events: file loads, play, pause, seek and speed changes, nodes going on and offline, and links connecting and dropping. It describes the recording being played back, not a live simulator.

## Linting & Code Style

```bash
npm run lint        # ESLint
npm run lint:fix    # ESLint with auto-fix
npm run format      # Prettier on src/
npm run build       # Typecheck and production build
npm test            # Unit tests (Node 22.6+)
```

A Husky pre-commit hook runs ESLint and Prettier on staged `.ts` and `.tsx` files.

## Architecture Overview

| Folder | Holds |
|--------|-------|
| `src/hooks/` | Playback state, the event log and the open workspace |
| `src/lib/` | Pure functions: parsing, run discovery, RL and campaign readers, the jamming field |
| `src/components/canvas/` | The Three.js scene |
| `src/components/pages/` | Home, Simulation runs, RL experiments, Folders and the player |
| `src/components/rl/` | Experiment, training, comparison and reward map views |
| `src/components/decisions/` | The Decisions tab |
| `src/components/charts/`, `shell/`, `ui/` | Charts, the app shell and shared UI pieces |
| `src/styles/` | Design tokens and motion |

`src/CLAUDE.md` describes the component hierarchy in more detail.

## Documentation

Generate the Doxygen site (the pages under `docs/` plus this README) and open it:

```bash
cd docs && doxygen Doxyfile && open html/index.html   # Linux: xdg-open html/index.html
```

## Contributing

1. Clone the repository and run `npm install`.
2. Run `npm run dev` to start the dev server.
3. Make your changes; the pre-commit hook lints and formats staged files.
4. Run `npm test` and `npm run build`.
5. Open a pull request.
