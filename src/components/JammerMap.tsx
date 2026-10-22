import { useMemo, useState } from 'react'
import type { UseSimDataReturn } from '../hooks/useSimData'
import { fieldGrid, fieldSupported, volumeGrid } from '../lib/jammerField'
import { jammerActivity } from '../lib/jammers'
import type { JammerMap } from './canvas/JammerFieldLayer'
import { Segmented } from './ui/Segmented'
import { JAMMER_FIELD_BANDS } from '../styles/tokens'
import { MOTION } from '../styles/motion'

/** The heights receivers actually use (to 0.5 m), most common first, at most four. */
function receiverHeights(frames: UseSimDataReturn['frames']): number[] {
  const counts = new Map<number, number>()
  const stride = Math.max(1, Math.floor(frames.length / 200))
  for (let i = 0; i < frames.length; i += stride) {
    for (const n of frames[i].nodes) {
      const h = Math.round(n.z * 2) / 2
      counts.set(h, (counts.get(h) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([h]) => h)
    .sort((a, b) => a - b)
}

export interface JammerMapState {
  /** jammers exist, so the button shows */
  present: boolean
  /** why the map cannot be drawn, when it cannot */
  unavailable: string | null
  on: boolean
  toggle: () => void
  mode: JammerMap['mode']
  setMode: (mode: JammerMap['mode']) => void
  heights: number[]
  heightM: number
  setHeightM: (h: number) => void
  /** what the scene draws, or null when off */
  map: JammerMap | null
}

export function useJammerMap(sim: UseSimDataReturn): JammerMapState {
  const [on, setOn] = useState(false)
  const [chosenHeight, setHeightM] = useState<number | null>(null)
  const [mode, setMode] = useState<JammerMap['mode']>('volume')
  const { frames, jammers, channel, sceneBounds } = sim

  const heights = useMemo(() => receiverHeights(frames), [frames])
  const heightM =
    chosenHeight !== null && heights.includes(chosenHeight) ? chosenHeight : (heights[0] ?? 1.5)

  const grid = useMemo(
    () =>
      fieldGrid(jammers, [frames[0]?.time ?? 0, frames[frames.length - 1]?.time ?? 0], {
        cx: sceneBounds.cx,
        cy: sceneBounds.cy,
        size: sceneBounds.planeSize,
      }),
    [jammers, frames, sceneBounds]
  )
  const volume = useMemo(() => {
    let nodeTop = 0
    for (const f of frames) for (const n of f.nodes) nodeTop = Math.max(nodeTop, n.z)
    return volumeGrid(
      jammers,
      [frames[0]?.time ?? 0, frames[frames.length - 1]?.time ?? 0],
      { cx: sceneBounds.cx, cy: sceneBounds.cy, size: sceneBounds.planeSize },
      nodeTop
    )
  }, [jammers, frames, sceneBounds])

  const present = jammers.length > 0
  const unavailable = !present
    ? null
    : channel === null
      ? 'This run has no saved run.ini, so the channel settings are unknown'
      : !fieldSupported(channel)
        ? `The map supports 3GPP UMa, UMi and RMa channels, not ${channel.channelModel.toUpperCase()} ${channel.scenario}`
        : null

  const map = useMemo<JammerMap | null>(
    () => (on && !unavailable && channel ? { channel, mode, grid, volume, heightM } : null),
    [on, unavailable, channel, mode, grid, volume, heightM]
  )

  return {
    present,
    unavailable,
    on: on && !unavailable,
    toggle: () => setOn((v) => !v),
    mode,
    setMode,
    heights,
    heightM,
    setHeightM,
    map,
  }
}

const heightLabel = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} m`

/** Legend and receiver height for the jamming map, over the canvas */
export function JammerMapLegend({
  state,
  sim,
  timeS,
}: {
  state: JammerMapState
  sim: UseSimDataReturn
  timeS: number
}) {
  if (!state.on) return null
  const carrierHz = sim.meta?.frequency ?? 0
  const transmitting = sim.jammers.some((j) => jammerActivity(j, timeS, carrierHz) !== 'off')
  return (
    <div
      role="region"
      aria-label="Jamming map legend"
      className={`glass-chip absolute bottom-3 right-3 z-10 w-[15.5rem] px-4 py-3 flex flex-col gap-2.5 ${MOTION.enter}`}
    >
      <div className="text-base font-semibold text-ink">Jamming over noise</div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">View</span>
        <Segmented
          size="sm"
          options={[
            { value: 'volume' as const, label: '3D' },
            { value: 'slice' as const, label: 'Slice' },
          ]}
          value={state.mode}
          onChange={state.setMode}
        />
      </div>
      {state.mode === 'slice' && state.heights.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-ink">Height</span>
          <Segmented
            size="sm"
            options={state.heights.map((h) => ({ value: h, label: heightLabel(h) }))}
            value={state.heightM}
            onChange={state.setHeightM}
          />
        </div>
      )}
      {transmitting ? (
        <div>
          {/* One block per 5 dB band; the outline in the scene is the jammer's range */}
          <div className="flex gap-0.5" role="list">
            {JAMMER_FIELD_BANDS.map((band) => (
              <span
                key={band.label}
                role="listitem"
                aria-label={band.label}
                title={band.label}
                className="h-3 flex-1 first:rounded-l last:rounded-r"
                style={{ background: band.color }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-sm text-ink tabular-nums">
            <span>Under noise</span>
            <span>15 dB</span>
            <span>30 dB +</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink">No jammer is transmitting now.</p>
      )}
    </div>
  )
}
