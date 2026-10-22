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

Standalone baseline runs live at `outputs/YYYY-MM/DD/HH-MM-SS-baseline[-N]/baseline_manifest.json` (+ `effective-inputs/baseline-plan.json`); manifest-only runs list as non-playable.

## Architecture

- `hooks/` — React hooks (`useSimData` for playback state + parsing, `useSimLog` for event log)
- `lib/` — Pure utility functions (CSV/JSON parsing, file assembly, formatting, IndexedDB cache)
- `components/ui/` — Reusable UI primitives (Button, Badge, Row, StatItem, Terminal)
- `components/canvas/` — Three.js scene components (Scene, NodeObject, LinkObject, BuildingObject, SceneEnvironment)
- `styles/tokens.ts` — Single source of truth for colors, sizes, labels, Tailwind class mappings
- `lib/jammerField.ts` (+ `.worker.ts` pool) + `components/canvas/JammerVolumeLayer.tsx` (3D ray-marched shells at 0/10/20/30 dB, rays stop at buildings) / `JammerFieldLayer.tsx` (slice) — Jamming map: ports the simulator's JammerModel gates and ns-3 3GPP UMa/UMi/RMa path loss with building LOS (no shadow fading); channel settings come from the archived `inputs/run.ini` (`lib/runIni.ts`). Keep it in step with `mesh-sim/src/jammer/` — tests pin values from a shadowing-off sim run
- `components/decisions/` + `lib/decisionExplorer.ts`/`nodeIdentity.ts`/`frameSeek.ts` — Decisions tab: integer-keyed `steps.jsonl` index, exact n−1 input join, derived applied action, checked ordinal node↔CSV mapping, interval-checked frame seek

## Key Patterns

- **Performance**: R3F canvas uses imperative `useFrame` updates, not React state, for 60fps. `frameAlphaRef` is a mutable ref updated via RAF, shared between React and Three.js — never put animation state in React state.
- **Coordinates**: Three.js is Y-up; `coordinates.ts` maps sim coords (Z=altitude) to Three.js (Y=altitude). All coordinate functions accept a `dim` param (1/2/3) for multi-view support.
- **Motion**: shared timing/easing tokens in `tailwind.config.js` and class strings in `styles/motion.ts` (`MOTION.colors/surface/fade/lift/enter/enterFade`); `transition-all` is banned (`tests/motionPolicy.test.ts`); `prefers-reduced-motion` and `:focus-visible` live in `index.css`.
- **Styling**: Tailwind utility classes everywhere. Design tokens in `styles/tokens.ts`. Use the `Button` component (variants: primary, ghost, icon-round, link) for interactive buttons.

## Docs

- Documentation for this project follows the [shared MeshSim documentation standard](../ns3-mmwave/scratch/mesh-sim/docs/documentation-standard.md). This relative path
  assumes `ns3-mmwave` and `ns3-mmwave-viz` are sibling checkouts in the same parent
  directory; it is a source link, not a published-site URL.
- This project's guides own loading, derived displays, coordinate conventions and
  missing-data behavior. The simulator owns the contracts of the artifacts it produces;
  link to its docs rather than restating field definitions here.
- Visualizer documentation is authored Markdown with direct relative links into `src/`.
  Do not assume TypeScript Doxygen extraction works. Use the owning project's
  verified tooling recipe; this section does not invent a generation command.
- Documentation edits stay within the active task's scope. Verification and
  command execution follow the human's task direction and this project's
  documented commands and rules.
- See [AGENTS.md](AGENTS.md) for the scoped task requirements.
