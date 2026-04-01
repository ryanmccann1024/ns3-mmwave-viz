# src/ Guide

## Component Hierarchy

```
App
├─ FileLoader (when not loaded)
└─ Loaded UI:
   ├─ StatsBar
   ├─ NetworkCanvas → Scene → NodeObject, LinkObject, BuildingObject, SceneEnvironment
   ├─ InfoPanel (NodeListItem, NodeDetail, LinkDetail are internal sub-components)
   ├─ Terminal
   └─ PlaybackControls
```

## State Flow

- `useSimData` — central hook: frames, playback (play/pause/seek/speed), file parsing, scene bounds
- `useSimLog` — event log buffer (max 500 entries), used by App to log frame-level events
- Selection state (`selectedNode`, `selectedLink`) lives in App and flows down as props

## Styling

- Tailwind utility classes for all UI styling
- Design tokens in `styles/tokens.ts` (NODE_COLORS, LINK_COLORS, NODE_BADGE_CLASSES, etc.)
- Use `Button` component for interactive buttons — variants: `primary`, `ghost`, `icon-round`, `link`
- List-item buttons (file list, node list) use raw `<button>` with contextual styling

## Canvas Architecture

- `NetworkCanvas` is a thin `<Canvas>` wrapper with `frameloop="always"`
- `Scene` maps data to 3D objects, handles selection highlighting, camera positioning
- `NodeObject` / `LinkObject` use `useFrame` for imperative position updates every tick
- `frameAlphaRef` (mutable ref) provides smooth interpolation between frames without React re-renders
- Coordinate conversion: `simToThree()` in `canvas/utils/coordinates.ts`
