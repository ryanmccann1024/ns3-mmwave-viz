import { useMemo } from 'react'
import type { SimFrame } from '../types'

export interface SinrSeries {
  linkKey: string
  data: { time: number; sinr: number }[]
}

export function useSinrSeries(frames: SimFrame[]): SinrSeries[] {
  return useMemo(() => {
    const seriesMap = new Map<string, { time: number; sinr: number }[]>()

    for (const frame of frames) {
      for (const link of frame.links) {
        if (link.sinr === undefined) continue
        const key = `${link.nodeA}-${link.nodeB}`
        let arr = seriesMap.get(key)
        if (!arr) {
          arr = []
          seriesMap.set(key, arr)
        }
        arr.push({ time: frame.time, sinr: link.sinr })
      }
    }

    return Array.from(seriesMap.entries()).map(([linkKey, data]) => ({
      linkKey,
      data,
    }))
  }, [frames])
}
