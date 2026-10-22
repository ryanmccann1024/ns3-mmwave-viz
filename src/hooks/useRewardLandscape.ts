import { useEffect, useRef, useState } from 'react'
import type { ResultCatalog } from '../lib/resultCatalog'
import type { RewardLandscape } from '../lib/rewardLandscape'
import { parseRewardLandscape } from '../lib/rewardLandscape'

export type RewardLandscapeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; landscape: RewardLandscape }
  | { status: 'error'; error: string }

/**
 * Reading limit for reward_landscape.json. A 41×41 grid with six fields is ~100 KB per
 * slice as JSON, so 64 MiB is several hundred slices; anything larger is refused rather
 * than freezing the page.
 */
export const MAX_LANDSCAPE_BYTES = 64 * 1024 * 1024

/** Reads and parses one episode's reward_landscape.json; a superseded read never lands. */
export function useRewardLandscape(
  catalog: ResultCatalog | null,
  path: string | null
): RewardLandscapeState {
  const [state, setState] = useState<RewardLandscapeState>({ status: 'idle' })
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    if (!catalog || !path) {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading' })
    let cancelled = false
    const stale = () => cancelled || request !== requestRef.current
    ;(async () => {
      try {
        const file = await catalog.getFile(path)
        if (stale()) return
        if (!file) {
          setState({ status: 'error', error: `could not read ${path}` })
          return
        }
        if (file.size > MAX_LANDSCAPE_BYTES) {
          const mib = (file.size / (1024 * 1024)).toFixed(0)
          setState({ status: 'error', error: `reward_landscape.json is ${mib} MiB, too large` })
          return
        }
        const text = await file.text()
        if (stale()) return
        const parsed = parseRewardLandscape(text)
        if (stale()) return
        setState(
          parsed.ok
            ? { status: 'ready', landscape: parsed.value }
            : { status: 'error', error: parsed.message }
        )
      } catch (err) {
        if (stale()) return
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, path])

  return state
}
