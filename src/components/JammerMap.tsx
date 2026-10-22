import { useCallback, useMemo, useState } from 'react'
import type { UseSimDataReturn } from '../hooks/useSimData'
import { fieldGrid, fieldSupported, volumeGrid } from '../lib/jammerField'
import type { JammerMap } from './canvas/JammerFieldLayer'

/** The heights receivers actually use (to 0.5 m), lowest first, at most four */
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
  /** what the scene draws, or null when off */
  map: JammerMap | null
}

const ON_KEY = 'player.jammerMap'

/** Whether the map is on, remembered per browser across replays (falls back to off) */
function useMapOn(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return window.localStorage.getItem(ON_KEY) === 'true'
    } catch {
      return false
    }
  })
  const toggle = useCallback(() => {
    setOn((prev) => {
      try {
        window.localStorage.setItem(ON_KEY, String(!prev))
      } catch {
        // storage unavailable: the choice lasts for this page only
      }
      return !prev
    })
  }, [])
  return [on, toggle]
}

/**
 * The jamming map, always the 3-D volume; a flat (2-D) view falls back to the slice at the
 * lowest of the common receiver heights
 */
export function useJammerMap(sim: UseSimDataReturn): JammerMapState {
  const [on, toggle] = useMapOn()
  const { frames, jammers, channel, sceneBounds } = sim

  const heights = useMemo(() => receiverHeights(frames), [frames])
  const heightM = heights[0] ?? 1.5

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
    () =>
      on && !unavailable && channel
        ? { channel, mode: 'volume' as const, grid, volume, heightM }
        : null,
    [on, unavailable, channel, grid, volume, heightM]
  )

  return {
    present,
    unavailable,
    on: on && !unavailable,
    toggle,
    map,
  }
}
