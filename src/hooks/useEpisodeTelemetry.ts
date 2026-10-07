import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResultCatalog } from '../lib/resultCatalog'
import { parseSteps } from '../lib/episodeTelemetry'
import type { EpisodeTelemetry } from '../lib/decisionExplorer'

export type TelemetryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; telemetry: EpisodeTelemetry; bytes: number; parseMs: number }
  | { status: 'needs_explicit_load'; bytes: number; reason: string }
  | { status: 'error'; error: string }

/**
 * Auto-load limit for steps.jsonl. Measured: the real producer writes ~1.9 KB per
 * record with `facts`, so 64 MiB is roughly 33k decisions; parsing 36 MB of
 * synthetic records took ~0.2 s in Node. Above the limit the user gets an explicit
 * "Load this episode" action instead of a silent cutoff. Override at dev time with
 * VITE_TELEMETRY_AUTO_LOAD_BYTES.
 */
export const DEFAULT_TELEMETRY_AUTO_LOAD_BYTES = 64 * 1024 * 1024

export function telemetryAutoLoadBytes(): number {
  // No vite/client types are declared in this project, so read the env loosely.
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const raw = env?.VITE_TELEMETRY_AUTO_LOAD_BYTES
  const parsed = typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TELEMETRY_AUTO_LOAD_BYTES
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`
  return `${bytes} B`
}

/**
 * Reads and parses one episode's steps.jsonl once per mount, shared by every
 * consumer on the player. In-memory only; a superseded request never updates state.
 */
export function useEpisodeTelemetry(
  catalog: ResultCatalog | null,
  stepsPath: string | null,
  options: { maxAutoBytes: number; allowLarge: boolean }
): TelemetryState & { loadExplicitly: () => void } {
  const [state, setState] = useState<TelemetryState>({ status: 'idle' })
  const [explicit, setExplicit] = useState(false)
  const requestRef = useRef(0)
  const { maxAutoBytes, allowLarge } = options

  useEffect(() => {
    const request = ++requestRef.current
    if (!catalog || !stepsPath) {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading' })
    let cancelled = false
    ;(async () => {
      try {
        const file = await catalog.getFile(stepsPath)
        if (cancelled || request !== requestRef.current) return
        if (!file) {
          setState({ status: 'error', error: `could not read ${stepsPath}` })
          return
        }
        const bytes = file.size
        if (bytes > maxAutoBytes && !(allowLarge || explicit)) {
          setState({
            status: 'needs_explicit_load',
            bytes,
            reason: `steps.jsonl is ${formatBytes(bytes)}, above the ${formatBytes(maxAutoBytes)} automatic limit`,
          })
          return
        }
        const text = await file.text()
        if (cancelled || request !== requestRef.current) return
        const started = performance.now()
        const parsed = parseSteps(text)
        const parseMs = performance.now() - started
        if (cancelled || request !== requestRef.current) return
        if (!parsed.ok) setState({ status: 'error', error: parsed.message })
        else setState({ status: 'ready', telemetry: parsed, bytes, parseMs })
      } catch (err) {
        if (cancelled || request !== requestRef.current) return
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, stepsPath, maxAutoBytes, allowLarge, explicit])

  const loadExplicitly = useCallback(() => setExplicit(true), [])
  return { ...state, loadExplicitly }
}
