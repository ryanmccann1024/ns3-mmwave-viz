import { useState, useRef, useCallback, useEffect } from 'react'
import Papa from 'papaparse'
import type { SimFrame, NodeState, LinkState, SimMeta, NodeType } from '../types'

export type PlaybackSpeed = 0.5 | 1 | 2 | 5 | 10

interface SimDataState {
  frames: SimFrame[]
  frameIndex: number
  frameAlpha: number
  playing: boolean
  speed: PlaybackSpeed
  threshold: number
  meta: SimMeta | null
}

export type UseSimDataReturn = SimDataState & {
  currentFrame: SimFrame | null
  nextFrame: SimFrame | null
  loaded: boolean
  loadFiles: (linksFile: File, positionsFile: File) => void
  play: () => void
  pause: () => void
  seek: (index: number) => void
  setSpeed: (speed: PlaybackSpeed) => void
  setThreshold: (t: number) => void
}

// -------------------------------------------------------------------------
// Parsing helpers
// -------------------------------------------------------------------------
function parseMeta(text: string): SimMeta {
  const meta: Partial<SimMeta> = {}
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) break
    const m = line.match(/^#\s*(\w+)=(.+)$/)
    if (!m) continue
    const [, key, val] = m
    if (key === 'scenario') meta.scenario = val.trim()
    if (key === 'frequency') meta.frequency = parseFloat(val)
    if (key === 'txPower') meta.txPower = parseFloat(val)
    if (key === 'numNodes') meta.numNodes = parseInt(val)
    if (key === 'simDuration') meta.simDuration = parseInt(val)
    if (key === 'tickMs') meta.tickMs = parseInt(val)
    if (key === 'dimensions') meta.dimensions = parseInt(val) as 1 | 2 | 3
  }
  return {
    scenario: meta.scenario ?? 'Unknown',
    frequency: meta.frequency ?? 28e9,
    txPower: meta.txPower ?? 23,
    numNodes: meta.numNodes ?? 0,
    simDuration: meta.simDuration ?? 0,
    tickMs: meta.tickMs ?? 100,
    dimensions: meta.dimensions ?? 3,
  }
}

interface LinkRow {
  time_s: string
  node_a: string
  node_b: string
  dist_m: string
  pathloss_dB: string
  rx_power_dBm: string
  condition: string
}
interface PosRow {
  time_s: string
  node_id: string
  x: string
  y: string
  z: string
  node_type: string
  active?: string
}

function stripComments(t: string) {
  return t
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
}

function parseFiles(linksText: string, posText: string, threshold: number): SimFrame[] {
  const linkRows = Papa.parse<LinkRow>(stripComments(linksText), {
    header: true,
    skipEmptyLines: true,
  }).data
  const posRows = Papa.parse<PosRow>(stripComments(posText), {
    header: true,
    skipEmptyLines: true,
  }).data

  const posByTime = new Map<number, NodeState[]>()
  for (const r of posRows) {
    const t = parseFloat(r.time_s)
    if (!posByTime.has(t)) posByTime.set(t, [])
    posByTime.get(t)!.push({
      id: parseInt(r.node_id),
      x: parseFloat(r.x),
      y: parseFloat(r.y),
      z: parseFloat(r.z),
      nodeType: (r.node_type?.trim() as NodeType) ?? 'ground',
      active: r.active !== undefined ? r.active.trim() !== '0' : true,
    })
  }

  const linksByTime = new Map<number, LinkState[]>()
  for (const r of linkRows) {
    const t = parseFloat(r.time_s)
    if (!linksByTime.has(t)) linksByTime.set(t, [])
    const rxPower = parseFloat(r.rx_power_dBm)
    linksByTime.get(t)!.push({
      nodeA: parseInt(r.node_a),
      nodeB: parseInt(r.node_b),
      dist: parseFloat(r.dist_m),
      pathloss: parseFloat(r.pathloss_dB),
      rxPower,
      condition: r.condition.trim() as 'LOS' | 'NLOS',
      connected: rxPower >= threshold,
    })
  }

  const times = Array.from(new Set([...posByTime.keys(), ...linksByTime.keys()])).sort(
    (a, b) => a - b
  )
  return times.map((t) => ({
    time: t,
    nodes: (posByTime.get(t) ?? []).sort((a, b) => a.id - b.id),
    links: linksByTime.get(t) ?? [],
  }))
}

function applyThreshold(frames: SimFrame[], threshold: number): SimFrame[] {
  return frames.map((f) => ({
    ...f,
    links: f.links.map((l) => ({ ...l, connected: l.rxPower >= threshold })),
  }))
}

// -------------------------------------------------------------------------
// Hook
// -------------------------------------------------------------------------
export function useSimData(): UseSimDataReturn {
  const [state, setState] = useState<SimDataState>({
    frames: [],
    frameIndex: 0,
    frameAlpha: 0,
    playing: false,
    speed: 1,
    threshold: -90,
    meta: null,
  })

  // Use refs to hold current speed/framesLen so interval callbacks don't go stale
  // This is the critical fix: startInterval must NOT be called inside setState()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const accumulatedMs = useRef(0)
  const framesLenRef = useRef(0)
  const speedRef = useRef<PlaybackSpeed>(1)
  const tickMsRef = useRef(50) // frame spacing in ms, read from CSV metadata

  // Keep refs in sync with state
  useEffect(() => {
    framesLenRef.current = state.frames.length
  }, [state.frames.length])
  useEffect(() => {
    speedRef.current = state.speed
  }, [state.speed])
  useEffect(() => {
    if (state.meta) tickMsRef.current = state.meta.tickMs
  }, [state.meta])

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    accumulatedMs.current = 0
  }, [])

  const startInterval = useCallback(() => {
    stopInterval()
    const TICK_MS = 16
    const getFrameMs = () => tickMsRef.current / speedRef.current

    intervalRef.current = setInterval(() => {
      accumulatedMs.current += TICK_MS
      const FRAME_MS = getFrameMs()

      // Compute advances OUTSIDE setState so ref mutations never happen
      // inside an updater — StrictMode double-invokes updaters, which would
      // cause the accumulator to subtract twice and stall at slow speeds.
      let framesToAdvance = 0
      while (accumulatedMs.current >= FRAME_MS) {
        accumulatedMs.current -= FRAME_MS
        framesToAdvance++
      }
      const newAlpha = Math.min(accumulatedMs.current / FRAME_MS, 1)

      setState((prev) => {
        if (prev.frameIndex >= framesLenRef.current - 1) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          return { ...prev, playing: false, frameAlpha: 0 }
        }
        if (framesToAdvance > 0) {
          const newIndex = Math.min(prev.frameIndex + framesToAdvance, framesLenRef.current - 1)
          return { ...prev, frameIndex: newIndex, frameAlpha: newAlpha }
        }
        return { ...prev, frameAlpha: newAlpha }
      })
    }, TICK_MS)
  }, [stopInterval])

  useEffect(() => () => stopInterval(), [stopInterval])

  const loadFiles = useCallback(
    (linksFile: File, positionsFile: File) => {
      const readFile = (f: File) =>
        new Promise<string>((res) => {
          const r = new FileReader()
          r.onload = (e) => res(e.target!.result as string)
          r.readAsText(f)
        })
      Promise.all([readFile(linksFile), readFile(positionsFile)]).then(([linksText, posText]) => {
        stopInterval()
        const meta = parseMeta(posText)
        setState((prev) => {
          const frames = parseFiles(linksText, posText, prev.threshold)
          framesLenRef.current = frames.length
          return { ...prev, frames, frameIndex: 0, frameAlpha: 0, playing: false, meta }
        })
      })
    },
    [stopInterval]
  )

  // play: update state THEN call startInterval — never inside setState
  // If already at the last frame, restart from frame 0
  const play = useCallback(() => {
    if (!framesLenRef.current) return
    setState((prev) => {
      const atEnd = prev.frameIndex >= framesLenRef.current - 1
      return { ...prev, playing: true, frameIndex: atEnd ? 0 : prev.frameIndex, frameAlpha: 0 }
    })
    accumulatedMs.current = 0
    startInterval()
  }, [startInterval])

  const pause = useCallback(() => {
    stopInterval()
    setState((prev) => ({ ...prev, playing: false }))
  }, [stopInterval])

  const seek = useCallback((index: number) => {
    // Keep playing if already playing — just jump to new frame
    accumulatedMs.current = 0
    setState((prev) => ({ ...prev, frameIndex: index, frameAlpha: 0 }))
  }, [])

  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    speedRef.current = speed
    setState((prev) => ({ ...prev, speed }))
    // If already playing, restart interval with new speed (accum resets)
    setState((prev) => {
      if (prev.playing) {
        accumulatedMs.current = 0
      }
      return prev
    })
  }, [])

  const setThreshold = useCallback(
    (threshold: number) =>
      setState((prev) => ({
        ...prev,
        threshold,
        frames: applyThreshold(prev.frames, threshold),
      })),
    []
  )

  return {
    ...state,
    currentFrame: state.frames[state.frameIndex] ?? null,
    nextFrame: state.frames[state.frameIndex + 1] ?? null,
    loaded: state.frames.length > 0,
    loadFiles,
    play,
    pause,
    seek,
    setSpeed,
    setThreshold,
  }
}
