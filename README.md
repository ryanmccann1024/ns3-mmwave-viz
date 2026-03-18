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
data/
  YYYY/
    MM/
      DD/
        HHMMSS<ms>/
          output/
            links.csv
            positions.csv
```

## Loading a Simulation

1. Click **Open Data Folder** and navigate to your `data/` directory.
2. The visualizer discovers all valid simulation runs grouped by date.
3. Click any run to load it — the 3D canvas appears immediately.

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

The semi-transparent orange plane on NLOS links represents the obstructing object between the two nodes.

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
```

A Husky pre-commit hook runs `lint-staged` on staged `.ts`/`.tsx` files before every commit.

## Architecture Overview

```
src/
├── styles/tokens.ts             Design tokens (colors, sizes, labels)
├── types.ts                     Shared TypeScript interfaces
├── hooks/
│   ├── useSimData.ts            CSV parsing, playback state machine
│   └── useSimLog.ts             In-memory event log (500 entry cap)
├── components/
│   ├── canvas/                  Three.js scene (split from original monolith)
│   │   ├── NetworkCanvas.tsx    Thin <Canvas> wrapper
│   │   ├── Scene.tsx            useMemo derivations, node/link mapping
│   │   ├── NodeObject.tsx       Per-node mesh + label + selection ring
│   │   ├── LinkObject.tsx       Per-link line + NLOS plane + label
│   │   ├── NodeShape.tsx        Geometry-only sub-component
│   │   ├── NlosBlocker.tsx      Semi-transparent orange NLOS plane
│   │   ├── SceneEnvironment.tsx Lights, ground plane, grid
│   │   └── utils/
│   │       ├── coordinates.ts   simToThree, interpPos, headingRotation
│   │       └── linkColors.ts    linkColor(), linkKey()
│   ├── ui/                      Reusable primitives
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── StatItem.tsx
│   │   ├── Panel.tsx
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
