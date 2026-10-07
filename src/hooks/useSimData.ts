import { useState, useRef, useCallback, useEffect } from 'react'
import type { SimFrame, SimMeta, BuildingState, JammerState } from '../types'
import { parseMeta, parseBuildings, parseFiles } from '../lib/parseSimFiles'
import { parseJammers, jammerPositionAt } from '../lib/jammers'
import type { DeclaredNodeIds } from '../lib/nodeIdentity'
import { parseArchivedNodeIds } from '../lib/nodeIdentity'
import { frameIndexAtTime, frameIndexForDecisionWindow } from '../lib/frameSeek'

/** Boundary slack when matching a playback frame to a decision interval (seconds). */
export const SEEK_TOLERANCE_S = 1e-6

export type PlaybackSpeed = 0.5 | 1 | 2 | 5 | 10

export interface SceneBounds {
  cx: number
  cy: number
  gridSize: number
  planeSize: number
  /** width of the area the nodes actually use, for framing the camera */
  viewSpan: number
}

const DEFAULT_BOUNDS: SceneBounds = { cx: 75, cy: 75, gridSize: 500, planeSize: 600, viewSpan: 500 }

interface SimDataState {
  frames: SimFrame[]
  frameIndex: number
  playing: boolean
  speed: PlaybackSpeed
  compact: boolean
  meta: SimMeta | null
  buildings: BuildingState[]
  jammers: JammerState[]
  sceneBounds: SceneBounds
  /** ordered node IDs from the archived inputs/nodes.json, when one was loaded */
  declaredNodeIds: DeclaredNodeIds
}

function computeBounds(
  frames: SimFrame[],
  buildings: BuildingState[],
  jammers: JammerState[]
): SceneBounds {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity

  for (const f of frames) {
    for (const n of f.nodes) {
      if (n.x < minX) minX = n.x
      if (n.x > maxX) maxX = n.x
      if (n.y < minY) minY = n.y
      if (n.y > maxY) maxY = n.y
    }
  }
  for (const b of buildings) {
    const bMinX = b.x - b.width / 2,
      bMaxX = b.x + b.width / 2
    const bMinY = b.y - b.depth / 2,
      bMaxY = b.y + b.depth / 2
    if (bMinX < minX) minX = bMinX
    if (bMaxX > maxX) maxX = bMaxX
    if (bMinY < minY) minY = bMinY
    if (bMaxY > maxY) maxY = bMaxY
  }
  for (const jammer of jammers) {
    const { x, y } = jammerPositionAt(jammer, frames[0]?.time ?? 0)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  if (!isFinite(minX)) return DEFAULT_BOUNDS

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const maxSpan = Math.max(maxX - minX, maxY - minY)
  const gridSize = Math.max(500, Math.ceil((maxSpan * 1.3) / 50) * 50)
  const planeSize = gridSize * 1.2
  // The ground keeps its 500 m minimum, but the camera frames the nodes: small RL
  // scenes (tens of metres) would otherwise open as specks in a large empty plane
  const viewSpan = Math.min(gridSize, Math.max(120, maxSpan * 1.6))

  return { cx, cy, gridSize, planeSize, viewSpan }
}

export type UseSimDataReturn = SimDataState & {
  currentFrame: SimFrame | null
  nextFrame: SimFrame | null
  loaded: boolean
  /** Mutable ref updated every RAF tick — read inside R3F useFrame, not React render */
  frameAlphaRef: React.MutableRefObject<number>
  loadFiles: (files: {
    linksFile: File
    positionsFile: File
    buildingsFile?: File
    flowsFile?: File
    routesFile?: File
    nodesJsonFile?: File
    jammersJsonFile?: File
    mcsFile?: File
    rxPowerFile?: File
  }) => void
  reset: () => void
  play: () => void
  pause: () => void
  /** clamped to the loaded frames; does not pause */
  seek: (index: number) => void
  /**
   * Pause and seek to the latest frame inside the half-open interval
   * (startExclusiveS, endInclusiveS]; returns the frame index, or null (and
   * leaves playback untouched) when no frame lies inside.
   */
  seekDecisionWindow: (startExclusiveS: number, endInclusiveS: number) => number | null
  /** Pause and seek to the frame recorded at an instant (reset snapshot), or null. */
  seekInstant: (atS: number) => number | null
  setSpeed: (speed: PlaybackSpeed) => void
  setCompact: (compact: boolean) => void
}

// -------------------------------------------------------------------------
// Hook
// -------------------------------------------------------------------------
export function useSimData(): UseSimDataReturn {
  const [state, setState] = useState<SimDataState>({
    frames: [],
    frameIndex: 0,
    playing: false,
    speed: 1,
    compact: false,
    meta: null,
    buildings: [],
    jammers: [],
    sceneBounds: DEFAULT_BOUNDS,
    declaredNodeIds: { status: 'absent' },
  })

  const rafRef = useRef<number | null>(null)
  const lastRafTimeRef = useRef<number | null>(null)
  const accumulatedMs = useRef(0)
  const framesLenRef = useRef(0)
  const frameIndexRef = useRef(0)
  const speedRef = useRef<PlaybackSpeed>(1)
  const compactRef = useRef(false)
  const tickMsRef = useRef(100)
  /** Updated every RAF tick — read in R3F useFrame for smooth interpolation */
  const frameAlphaRef = useRef(0)
  /** Incremented per loadFiles/reset so a superseded load can never paint over a newer one */
  const loadTokenRef = useRef(0)
  const frameTimesRef = useRef<Float64Array>(new Float64Array(0))

  useEffect(() => {
    framesLenRef.current = state.frames.length
  }, [state.frames.length])
  // Note: frameIndexRef is NOT synced from state — it's set directly by tick/seek/play/reset/loadFiles.
  // Syncing via useEffect caused a race: the effect could revert the ref after the RAF tick advanced it,
  // producing visible "ripple" (frame index jumping back then forward).
  useEffect(() => {
    speedRef.current = state.speed
  }, [state.speed])
  useEffect(() => {
    if (state.meta) tickMsRef.current = state.meta.tickMs
  }, [state.meta])

  const stopInterval = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastRafTimeRef.current = null
    accumulatedMs.current = 0
    frameAlphaRef.current = 0
  }, [])

  const startInterval = useCallback(() => {
    stopInterval()

    const tick = (time: number) => {
      // Use actual elapsed wall-clock time so alpha never drifts or jumps
      const elapsed = lastRafTimeRef.current !== null ? time - lastRafTimeRef.current : 0
      lastRafTimeRef.current = time

      accumulatedMs.current += elapsed
      const FRAME_MS = tickMsRef.current / speedRef.current

      let framesToAdvance = 0
      while (accumulatedMs.current >= FRAME_MS) {
        accumulatedMs.current -= FRAME_MS
        framesToAdvance++
      }
      // Update alpha ref directly — no React setState, no re-render
      frameAlphaRef.current = Math.min(accumulatedMs.current / FRAME_MS, 1)

      if (framesToAdvance > 0) {
        const newIndex = Math.min(frameIndexRef.current + framesToAdvance, framesLenRef.current - 1)
        frameIndexRef.current = newIndex
        setState((prev) => {
          const atEnd = newIndex >= framesLenRef.current - 1
          if (atEnd) frameAlphaRef.current = 0
          return { ...prev, frameIndex: newIndex, ...(atEnd && { playing: false }) }
        })
        if (newIndex >= framesLenRef.current - 1) {
          // Reached the end — stop the loop synchronously
          rafRef.current = null
          frameAlphaRef.current = 0
          return
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [stopInterval])

  useEffect(() => () => stopInterval(), [stopInterval])

  const loadFiles = useCallback(
    (files: {
      linksFile: File
      positionsFile: File
      buildingsFile?: File
      flowsFile?: File
      routesFile?: File
      nodesJsonFile?: File
      jammersJsonFile?: File
      mcsFile?: File
      rxPowerFile?: File
    }) => {
      const readFile = (f: File) =>
        new Promise<string>((res) => {
          const r = new FileReader()
          r.onload = (e) => res(e.target!.result as string)
          r.readAsText(f)
        })

      const optRead = (f?: File) => (f ? readFile(f) : Promise.resolve(undefined))
      const token = ++loadTokenRef.current

      Promise.all([
        readFile(files.linksFile),
        readFile(files.positionsFile),
        optRead(files.buildingsFile),
        optRead(files.flowsFile),
        optRead(files.routesFile),
        optRead(files.nodesJsonFile),
        optRead(files.jammersJsonFile),
        optRead(files.mcsFile),
        optRead(files.rxPowerFile),
      ]).then(
        ([
          linksText,
          posText,
          buildingsText,
          flowsText,
          routesText,
          nodesJsonText,
          jammersJsonText,
          mcsText,
          rxPowerText,
        ]) => {
          if (token !== loadTokenRef.current) return
          stopInterval()
          const meta = parseMeta(posText)
          const frames = parseFiles({
            linksText,
            posText,
            flowsText,
            routesText,
            nodesJsonText,
            mcsText,
            rxPowerText,
          })
          const buildings = buildingsText ? parseBuildings(buildingsText) : []
          const jammers = jammersJsonText ? parseJammers(jammersJsonText) : []
          const sceneBounds = computeBounds(frames, buildings, jammers)
          const declaredNodeIds = parseArchivedNodeIds(nodesJsonText)
          framesLenRef.current = frames.length
          frameIndexRef.current = 0
          frameAlphaRef.current = 0
          frameTimesRef.current = Float64Array.from(frames, (f) => f.time)
          setState({
            frames,
            frameIndex: 0,
            playing: false,
            speed: speedRef.current,
            compact: compactRef.current,
            meta,
            buildings,
            jammers,
            sceneBounds,
            declaredNodeIds,
          })
        }
      )
    },
    [stopInterval]
  )

  const reset = useCallback(() => {
    loadTokenRef.current++
    stopInterval()
    frameAlphaRef.current = 0
    framesLenRef.current = 0
    frameIndexRef.current = 0
    frameTimesRef.current = new Float64Array(0)
    setState({
      frames: [],
      frameIndex: 0,
      playing: false,
      speed: speedRef.current,
      compact: compactRef.current,
      meta: null,
      buildings: [],
      jammers: [],
      sceneBounds: DEFAULT_BOUNDS,
      declaredNodeIds: { status: 'absent' },
    })
  }, [stopInterval])

  const play = useCallback(() => {
    if (!framesLenRef.current) return
    setState((prev) => {
      const atEnd = prev.frameIndex >= framesLenRef.current - 1
      const newIndex = atEnd ? 0 : prev.frameIndex
      frameIndexRef.current = newIndex
      return { ...prev, playing: true, frameIndex: newIndex }
    })
    accumulatedMs.current = 0
    frameAlphaRef.current = 0
    startInterval()
  }, [startInterval])

  const pause = useCallback(() => {
    stopInterval()
    setState((prev) => ({ ...prev, playing: false }))
  }, [stopInterval])

  const seek = useCallback((index: number) => {
    const last = Math.max(0, framesLenRef.current - 1)
    const clamped = Math.min(last, Math.max(0, Number.isFinite(index) ? Math.floor(index) : 0))
    accumulatedMs.current = 0
    frameAlphaRef.current = 0
    frameIndexRef.current = clamped
    setState((prev) => ({ ...prev, frameIndex: clamped }))
  }, [])

  const seekDecisionWindow = useCallback(
    (startExclusiveS: number, endInclusiveS: number) => {
      const index = frameIndexForDecisionWindow(
        frameTimesRef.current,
        startExclusiveS,
        endInclusiveS,
        SEEK_TOLERANCE_S
      )
      if (index === null) return null
      stopInterval()
      frameIndexRef.current = index
      setState((prev) => ({ ...prev, playing: false, frameIndex: index }))
      return index
    },
    [stopInterval]
  )

  const seekInstant = useCallback(
    (atS: number) => {
      const index = frameIndexAtTime(frameTimesRef.current, atS, SEEK_TOLERANCE_S)
      if (index === null) return null
      stopInterval()
      frameIndexRef.current = index
      setState((prev) => ({ ...prev, playing: false, frameIndex: index }))
      return index
    },
    [stopInterval]
  )

  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    speedRef.current = speed
    setState((prev) => {
      if (prev.playing) accumulatedMs.current = 0
      return { ...prev, speed }
    })
  }, [])

  const setCompact = useCallback((compact: boolean) => {
    compactRef.current = compact
    setState((prev) => ({ ...prev, compact }))
  }, [])

  return {
    ...state,
    currentFrame: state.frames[state.frameIndex] ?? null,
    nextFrame: state.frames[state.frameIndex + 1] ?? null,
    loaded: state.frames.length > 0,
    frameAlphaRef,
    loadFiles,
    reset,
    play,
    pause,
    seek,
    seekDecisionWindow,
    seekInstant,
    setSpeed,
    setCompact,
  }
}
