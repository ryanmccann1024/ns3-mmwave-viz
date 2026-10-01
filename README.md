# NYU Mesh Viz

A browser-based 3D visualizer for ns-3 wireless network simulations, built with React + Three.js.

## Prerequisites

- Node.js 18+
- npm 9+

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Data Format

The visualizer reads two CSV files produced by the ns-3 simulation:

### `positions.csv`

Header comments (lines starting with `#`) encode simulation metadata:

```
# scenario=Urban-5G
# frequency=28000000000
# txPower=23
# numNodes=10
# simDuration=12000
# tickMs=100
# dimensions=3

time_s,node_id,x,y,z,node_type,active
0.0,0,10.5,20.3,0.0,ground,1
0.1,0,10.5,20.3,0.0,ground,1
...
```

| Column | Description |
|--------|-------------|
| `time_s` | Simulation time (seconds) |
| `node_id` | Integer node identifier |
| `x`, `y`, `z` | Position in meters (z = altitude) |
| `node_type` | `ground`, `air`, `bs`, or `vehicle` |
| `active` | `1` = active, `0` = offline |

### `links.csv`

```
time_s,node_a,node_b,dist_m,pathloss_dB,rx_power_dBm,condition
0.0,0,1,150.2,82.4,-72.1,LOS
0.0,0,2,220.7,98.3,-88.0,NLOS
...
```

| Column | Description |
|--------|-------------|
| `time_s` | Simulation time (seconds) |
| `node_a`, `node_b` | Endpoint node IDs |
| `dist_m` | 3-D distance in meters |
| `pathloss_dB` | Path loss in dB |
| `rx_power_dBm` | Received power in dBm |
| `condition` | `LOS` (line of sight) or `NLOS` (obstructed) |

Both files must live inside a directory tree with the structure:

```
outputs/
  YYYY-MM/
    DD/
      HH-MM-SS/
        seed-N/
          links.csv
          positions.csv
          buildings.json   (optional)
```

## Loading a Simulation

1. Click **Open Data Folder** and navigate to your `data/` directory.
2. The visualizer discovers all valid simulation runs grouped by date.
3. Click any run to load it — the 3D canvas appears immediately.

## Reading RL experiment results

The visualizer can also read saved local or fetched RL experiments. It is a reader only: it does not train,
evaluate, compare, submit or fetch jobs. Results are produced with the
simulator's own CLI; see the simulator repository's `scratch/mesh-sim/README.md` (section
"Comparing policies and running an experiment matrix") and
`scratch/mesh-sim/scripts/rl/ops/README.md` (cluster runs and fetching results).

**Where to start.** Open **RL experiments**, then one experiment card. Each card
names its matrix row(s) and number of linked training runs even when old
timestamped folder names are vague. In the experiment use **Observation · action · reward**
for the exact input vector, masks, and weighted reward; **Learning** for training
episode return and the model-selection checkpoint curve; **Results** for
delivery-first PPO/hold/random comparisons and paired seed differences; and
**Episodes (3D)** to compare individual policies on the same seed. Results and
Comparison default to visual summaries, with full metrics tables retained behind
their toggles. A seed ID on a chart is not training time. The reward-through-one-
evaluation-episode chart shows a fixed policy's within-episode behavior, not learning.

Training seed 101 (or 101–103 in a multi-run plan) updates the model. The
model-selection seed (201 in the local suite) chooses its saved checkpoint;
it is not a held-out test. Held-out evaluation seeds (301–305, or fresh 401–405
in confirmation) compare that frozen model to hold and random-valid. Five
evaluation seeds are not five independently trained models.

**What it reads.** From an experiment or fetched-results folder: `experiment_plan.json`,
`eval/<row>/train-seed-<T>/eval_manifest.json`, `comparison/comparison.json` and, when present,
`fetch_manifest.json`. On demand only: `train_manifest.json`, `comparison/episodes.csv`, and for the
one episode you open its `rl_episode.json`, `seed-<S>/summary.json`, CSVs, `inputs/` and
`steps.jsonl`. Model archives are never read; the Learning view can read a training run's
`evaluations.npz` for its saved checkpoint curve. Rows, training seeds, policies and
seeds are matched by the identity recorded in the manifests, relative to the folder you opened;
absolute paths inside manifests are ignored.

**Opening a folder.** With `npm run dev`, the sibling simulator outputs directory
(`../ns3-mmwave/scratch/mesh-sim/outputs`) is discovered automatically and any experiments in it
are listed above the legacy runs. In a production build (`npm run build && npm run preview`, or any
static host) click **Open Outputs Folder** and pick either the outputs folder, a single experiment
folder or a fetched-results folder; no server is needed. Only reader-relevant files are indexed.
If the file limit is reached, the loader warns that some experiments may be missing; open a
single experiment or fetched-results folder instead. The built-in test command needs Node 22.6+.

**Intervals.** Comparison intervals and means come from `comparison.json`, not GUI statistical inference.
Visual cards round them for readability; the tables retain the original precision. A *paired*
interval describes variation across held-out evaluation seeds for one fixed trained model. A
*group* interval describes variation across training runs of the same row. When the simulator
recorded no interval the table says "not available" with the recorded reason; that is not a
zero-width interval. Returns are marked as not comparable between rows whose reward definitions
differ. Episode `summary.json` statistics are a separate source and may cover a different time
window.

**When something is unavailable.** A comparison marked `incomplete` lists the evaluations it is
missing and why. An evaluation can be `incomplete`, `failed`, `missing` (declared in the plan but
absent from the folder) or `not fetched` (left out of a fetched snapshot). An episode without
`links.csv` and `positions.csv` cannot be played, and without `positions.csv` has no trail. Decision
telemetry appears only if the evaluation saved `steps.jsonl`; playback works without it. Fetch
information is a saved snapshot from `fetch_manifest.json`, not live queue status.

**Decision timing.** A saved telemetry record describes the action applied and reward earned
during the interval ending at that record's time. The mask that was valid *before* action n is
the mask in record n−1, and that is the one shown next to action n ("pre-action mask (decision
n−1)"). The panel selects the saved interval containing the playback time; if telemetry was
sampled and no saved interval covers that time, it says so rather than displaying an older action.

### Decisions tab

Evaluation episodes have a **Decisions** tab beside Episode / Overview / Nodes / Log (on narrow
screens the same tabs sit below the scene). It shows one chip per policy slot, a timeline over the
whole decision range (holes where decisions were not saved are hatched, never filled in), a detail
card and a scrolling list. Clicking a decision pauses playback and seeks to the last real frame
inside that decision's outcome interval; if no frame lies inside, it says so instead of jumping to
a nearby frame.

What the card shows is only the evidence in `steps.jsonl`:

- **Inputs** come from record n−1 exactly: its tick, time, observation hash and per-slot mask (plus
  recorded `facts` when present). If decision n−1 was not saved, the group reads "not recorded";
  the nearest earlier record is never substituted. The full observation vector is not in this file.
- **Action** shows the requested action (`action_sent`), whether the pre-action mask allowed it, and
  an **applied (derived)** action: the request with every revalidated slot replaced by the
  contract's `hold`. "Derived" means computed from the recorded revalidation, not recorded by the
  simulator; when the contract has no unique `hold`, applied is marked unavailable.
- **Context** shows the outcome interval, network-wide reward total and components, and — when the
  node mapping is proved — the selected node's incident links at the shown frame with their per-link
  SINR / MCS / RX power. No per-node averages are computed.

Node chips link to the 3D scene only when the telemetry contract's node order can be matched to the
CSV node ids and the archived `inputs/nodes.json`; otherwise the tab says why and chips just filter.
Hold, random and placement-baseline episodes use the same view. Nothing in the tab claims *why* the
policy chose an action: model preferences are **not** in `steps.jsonl`. Reading them requires the
simulator's opt-in decision-record sidecar (`policy_decisions.jsonl`, recorded per run only when
enabled, with an adjustable on-disk cap); support for that sidecar, including selected training
episodes (context and action only, no invented model preference), is a required follow-up to this
tab once the simulator's schema is published. Episodes recorded with the sidecar off simply show
"not saved".

## Controls

| Control | Action |
|---------|--------|
| Drag (3D mode) | Orbit camera |
| Right-drag | Pan camera |
| Scroll | Zoom |
| ▶ / ⏸ button | Play / pause |
| Timeline scrubber | Jump to any frame |
| Speed buttons | Set playback speed (0.5×–10×) |
| 1D / 2D / 3D buttons | Switch view mode |
| Click a node | Inspect node details |
| Click a link midpoint | Inspect link metrics |
| Click empty space | Deselect |
| Link threshold input | Filter connected vs disconnected links |

## Understanding the Visualization

### Node Shapes

| Shape | Node type |
|-------|-----------|
| Sphere | Ground node |
| Cone | UAV / air node |
| Cylinder | Base station (BS) |
| Box | Vehicle |

### Node Colors

| Color | Meaning |
|-------|---------|
| Blue | Ground node |
| Yellow | UAV |
| Purple | Base station |
| Green | Vehicle |
| Dark gray | Inactive / offline |

### Link Colors

| Color | Meaning |
|-------|---------|
| Green (solid) | LOS connected |
| Orange (dashed) | NLOS connected |
| Red (dashed) | Disconnected (below threshold) |

## Terminal / Event Log

A collapsible terminal at the bottom of the screen logs simulation events in real time:

- **INFO** — file loads, play/pause/seek, speed and threshold changes
- **EVENT** — node activations, link connections
- **WARN** — node deactivations, link drops

The terminal is hidden on small screens (< 640px wide).

## Linting & Code Style

```bash
npm run lint        # ESLint (zero warnings enforced)
npm run lint:fix    # Auto-fix ESLint issues
npm run format      # Prettier format all src/ files
npm run build       # TypeScript compile + Vite production build
npm test            # Unit tests for the result-reading libraries (Node 22.6+)
```

A Husky pre-commit hook runs `lint-staged` on staged `.ts`/`.tsx` files before every commit.

## Architecture Overview

```
src/
├── styles/tokens.ts             Design tokens (colors, sizes, labels)
├── types.ts                     Shared TypeScript interfaces
├── hooks/
│   ├── useSimData.ts            Playback state machine, scene bounds
│   └── useSimLog.ts             In-memory event log (500 entry cap)
├── lib/
│   ├── parseSimFiles.ts         CSV/JSON parsing (positions, links, buildings, meta)
│   ├── assembleRuns.ts          Directory traversal, run discovery, dev-server fetch
│   ├── format.ts                Shared formatting helpers (freqLabel)
│   ├── directoryCache.ts        IndexedDB persistence for FSA directory handles
│   └── fsaTypes.d.ts            TypeScript augmentations for File System Access API
├── components/
│   ├── canvas/                  Three.js scene components
│   │   ├── NetworkCanvas.tsx    Thin <Canvas> wrapper
│   │   ├── Scene.tsx            useMemo derivations, node/link mapping
│   │   ├── NodeObject.tsx       Per-node mesh + label + selection ring
│   │   ├── LinkObject.tsx       Per-link line + label
│   │   ├── NodeShape.tsx        Geometry-only sub-component
│   │   ├── BuildingObject.tsx   3D building boxes
│   │   ├── SceneEnvironment.tsx Lights, ground plane, grid
│   │   └── utils/
│   │       ├── coordinates.ts   simToThree, interpPos, headingRotation
│   │       └── linkColors.ts    linkColor(), linkKey()
│   ├── ui/                      Reusable primitives
│   │   ├── Button.tsx           Variants: primary, ghost, icon-round, link
│   │   ├── Badge.tsx
│   │   ├── StatItem.tsx
│   │   ├── Row.tsx
│   │   └── Terminal.tsx
│   ├── FileLoader.tsx
│   ├── PlaybackControls.tsx
│   ├── StatsBar.tsx
│   └── InfoPanel.tsx
└── App.tsx                      Layout, logging wiring, responsive breakpoints
```

## Contributing

1. Fork and clone the repo
2. `npm install`
3. `npm run dev` to start the dev server
4. Make changes — the pre-commit hook enforces lint + format on staged files
5. Open a pull request
