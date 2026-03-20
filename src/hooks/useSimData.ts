import { useState, useRef, useCallback, useEffect } from 'react'
import Papa from 'papaparse'
import type { SimFrame, NodeState, LinkState, SimMeta, NodeType, BuildingState } from '../types'

export type PlaybackSpeed = 0.5 | 1 | 2 | 5 | 10

interface SimDataState {
  frames: SimFrame[]
  frameIndex: number
  playing: boolean
  speed: PlaybackSpeed
  meta: SimMeta | null
  buildings: BuildingState[]
}

export type UseSimDataReturn = SimDataState & {
  currentFrame: SimFrame | null
  nextFrame: SimFrame | null
  loaded: boolean
  /** Mutable ref updated every RAF tick — read inside R3F useFrame, not React render */
  frameAlphaRef: React.MutableRefObject<number>
  loadFiles: (linksFile: File, positionsFile: File, buildingsFile?: File) => void
  reset: () => void
  play: () => void
  pause: () => void
  seek: (index: number) => void
  setSpeed: (speed: PlaybackSpeed) => void
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
  [key: string]: string
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

/**
 * Case-insensitive lookup of a field in a CSV row.
 * PapaParse preserves header casing, so we normalise to find the value.
 */
function field(row: Record<string, string>, name: string): string {
  const lower = name.toLowerCase()
  for (const k of Object.keys(row)) {
    if (k.trim().toLowerCase() === lower) return row[k] ?? ''
  }
  return ''
}

function normaliseCondition(raw: string): 'LOS' | 'NLOS' {
  const v = raw.trim().toUpperCase()
  if (v === 'LOS') return 'LOS'
  return 'NLOS'
}

/** Parse buildings.json — supports bbox (x_min/x_max/y_min/y_max/z_min/z_max) or
 *  centre+dims (x/y/z/width/depth/height) formats, and a top-level "buildings" wrapper. */
function parseBuildings(json: string): BuildingState[] {
  try {
    let raw = JSON.parse(json)
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.buildings)) {
      raw = raw.buildings
    }
    if (!Array.isArray(raw)) return []

    return (raw as Record<string, number>[]).map((b, i) => {
      if ('x_min' in b && 'x_max' in b) {
        return {
          id: b.id ?? i,
          x: (b.x_min + b.x_max) / 2,
          y: (b.y_min + b.y_max) / 2,
          z: b.z_min ?? 0,
          width: b.x_max - b.x_min,
          depth: b.y_max - b.y_min,
          height: (b.z_max ?? 10) - (b.z_min ?? 0),
        }
      }
      return {
        id: b.id ?? i,
        x: b.x ?? 0,
        y: b.y ?? 0,
        z: b.z ?? 0,
        width: b.width ?? 20,
        depth: b.depth ?? 20,
        height: b.height ?? 10,
      }
    })
  } catch {
    return []
  }
}

function parseFiles(linksText: string, posText: string): SimFrame[] {
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
    const t = parseFloat(field(r, 'time_s'))
    if (!linksByTime.has(t)) linksByTime.set(t, [])
    const sinrRaw =
      field(r, 'sinr_db') || field(r, 'sinr_dB') || field(r, 'snr_dB') || field(r, 'snr')
    const sinr = sinrRaw ? parseFloat(sinrRaw) : undefined
    linksByTime.get(t)!.push({
      nodeA: parseInt(field(r, 'node_a')),
      nodeB: parseInt(field(r, 'node_b')),
      dist: parseFloat(field(r, 'dist_m')),
      pathloss: parseFloat(field(r, 'pathloss_dB')),
      rxPower: parseFloat(field(r, 'rx_power_dBm')),
      sinr: sinr !== undefined && !isNaN(sinr) ? sinr : undefined,
      condition: normaliseCondition(field(r, 'condition')),
      connected: true,
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
  useEffect(() => {
    frameIndexRef.current = state.frameIndex
  }, [state.frameIndex])
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
          if (prev.frameIndex >= framesLenRef.current - 1) {
            frameAlphaRef.current = 0
            return { ...prev, playing: false }
          }
          return { ...prev, frameIndex: newIndex }
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
    (linksFile: File, positionsFile: File, buildingsFile?: File) => {
      const readFile = (f: File) =>
        new Promise<string>((res) => {
          const r = new FileReader()
          r.onload = (e) => res(e.target!.result as string)
          r.readAsText(f)
        })

      const tasks: Promise<string>[] = [readFile(linksFile), readFile(positionsFile)]
      if (buildingsFile) tasks.push(readFile(buildingsFile))

      Promise.all(tasks).then(([linksText, posText, buildingsText]) => {
        stopInterval()
        const meta = parseMeta(posText)
        const frames = parseFiles(linksText, posText)
        const buildings = buildingsText ? parseBuildings(buildingsText) : []
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
