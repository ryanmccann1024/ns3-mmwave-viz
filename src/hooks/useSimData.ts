import { useState, useRef, useCallback, useEffect } from 'react'
import type { SimFrame, SimMeta, BuildingState } from '../types'
import { parseMeta, parseBuildings, parseFiles } from '../lib/parseSimFiles'

export type PlaybackSpeed = 0.5 | 1 | 2 | 5 | 10

export interface SceneBounds {
  cx: number
  cy: number
  gridSize: number
  planeSize: number
}

const DEFAULT_BOUNDS: SceneBounds = { cx: 75, cy: 75, gridSize: 500, planeSize: 600 }

interface SimDataState {
  frames: SimFrame[]
  frameIndex: number
  playing: boolean
  speed: PlaybackSpeed
  meta: SimMeta | null
  buildings: BuildingState[]
  sceneBounds: SceneBounds
}

function computeBounds(frames: SimFrame[], buildings: BuildingState[]): SceneBounds {
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

  if (!isFinite(minX)) return DEFAULT_BOUNDS

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const maxSpan = Math.max(maxX - minX, maxY - minY)
  const gridSize = Math.max(500, Math.ceil((maxSpan * 1.3) / 50) * 50)
  const planeSize = gridSize * 1.2

  return { cx, cy, gridSize, planeSize }
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
  }) => void
  reset: () => void
  play: () => void
  pause: () => void
  seek: (index: number) => void
  setSpeed: (speed: PlaybackSpeed) => void
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
    meta: null,
    buildings: [],
    sceneBounds: DEFAULT_BOUNDS,
  })

  const rafRef = useRef<number | null>(null)
  const lastRafTimeRef = useRef<number | null>(null)
  const accumulatedMs = useRef(0)
  const framesLenRef = useRef(0)
  const frameIndexRef = useRef(0)
  const speedRef = useRef<PlaybackSpeed>(1)
  const tickMsRef = useRef(100)
  /** Updated every RAF tick — read in R3F useFrame for smooth interpolation */
  const frameAlphaRef = useRef(0)

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
    }) => {
      const readFile = (f: File) =>
        new Promise<string>((res) => {
          const r = new FileReader()
          r.onload = (e) => res(e.target!.result as string)
          r.readAsText(f)
        })

      const optRead = (f?: File) => (f ? readFile(f) : Promise.resolve(undefined))

      Promise.all([
        readFile(files.linksFile),
        readFile(files.positionsFile),
        optRead(files.buildingsFile),
        optRead(files.flowsFile),
        optRead(files.routesFile),
        optRead(files.nodesJsonFile),
      ]).then(([linksText, posText, buildingsText, flowsText, routesText, nodesJsonText]) => {
        stopInterval()
        const meta = parseMeta(posText)
        const frames = parseFiles({
          linksText,
          posText,
          flowsText,
          routesText,
          nodesJsonText,
        })
        const buildings = buildingsText ? parseBuildings(buildingsText) : []
        const sceneBounds = computeBounds(frames, buildings)
        framesLenRef.current = frames.length
        frameIndexRef.current = 0
        frameAlphaRef.current = 0
        setState({
          frames,
          frameIndex: 0,
          playing: false,
          speed: speedRef.current,
          meta,
          buildings,
          sceneBounds,
        })
      })
    },
    [stopInterval]
  )

  const reset = useCallback(() => {
    stopInterval()
    frameAlphaRef.current = 0
    framesLenRef.current = 0
    frameIndexRef.current = 0
    setState({
      frames: [],
      frameIndex: 0,
      playing: false,
      speed: speedRef.current,
      meta: null,
      buildings: [],
      sceneBounds: DEFAULT_BOUNDS,
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
    accumulatedMs.current = 0
    frameAlphaRef.current = 0
    frameIndexRef.current = index
    setState((prev) => ({ ...prev, frameIndex: index }))
  }, [])

  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    speedRef.current = speed
    setState((prev) => {
      if (prev.playing) accumulatedMs.current = 0
      return { ...prev, speed }
    })
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
    setSpeed,
  }
}
