# ns3-mmwave-viz

Browser-based 3D visualizer for ns-3 mmWave network simulations.

## Stack

React 18 + Three.js 0.167 (via @react-three/fiber + drei) + Tailwind CSS 3.4 + Vite 5 + TypeScript 5.4. CSV parsing via PapaParse.

## Commands

- `npm run dev` — start dev server (port 5173)
- `npm run build` — typecheck + production build (`tsc && vite build`)
- `npm run lint` — ESLint
- `npm run format` — Prettier

Pre-commit hooks: Husky + lint-staged runs ESLint + Prettier on staged `.ts`/`.tsx` files.

## Data Format

Two CSVs (`positions.csv`, `links.csv`) + optional `buildings.json`, organized as:
`outputs/YYYY-MM/DD/HH-MM-SS/seed-N/{links.csv,positions.csv}`

CSV header comments (`#key=value`) encode simulation metadata (scenario, frequency, txPower, etc.).

## Architecture

- `hooks/` — React hooks (`useSimData` for playback state + parsing, `useSimLog` for event log)
- `lib/` — Pure utility functions (CSV/JSON parsing, file assembly, formatting, IndexedDB cache)
- `components/ui/` — Reusable UI primitives (Button, Badge, Row, StatItem, Terminal)
- `components/canvas/` — Three.js scene components (Scene, NodeObject, LinkObject, BuildingObject, SceneEnvironment)
- `styles/tokens.ts` — Single source of truth for colors, sizes, labels, Tailwind class mappings

## Key Patterns

- **Performance**: R3F canvas uses imperative `useFrame` updates, not React state, for 60fps. `frameAlphaRef` is a mutable ref updated via RAF, shared between React and Three.js — never put animation state in React state.
- **Coordinates**: Three.js is Y-up; `coordinates.ts` maps sim coords (Z=altitude) to Three.js (Y=altitude). All coordinate functions accept a `dim` param (1/2/3) for multi-view support.
- **Styling**: Tailwind utility classes everywhere. Design tokens in `styles/tokens.ts`. Use the `Button` component (variants: primary, ghost, icon-round, link) for interactive buttons.
