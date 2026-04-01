import { useMemo } from 'react'
import type { SimFrame, LinkState, FlowState } from '../types'

export type MetricId = 'sinr' | 'rxPower' | 'capacity' | 'throughput' | 'latency' | 'mcs'

export interface MetricConfig {
  id: MetricId
  label: string
  unit: string
  source: 'link' | 'flow' | 'mcs' | 'rxPower'
}

export const METRICS: MetricConfig[] = [
  { id: 'sinr', label: 'SINR', unit: 'dB', source: 'link' },
  { id: 'rxPower', label: 'RX Power', unit: 'dBm', source: 'rxPower' },
  { id: 'capacity', label: 'Capacity', unit: 'Mbps', source: 'link' },
  { id: 'throughput', label: 'Throughput', unit: 'Mbps', source: 'flow' },
  { id: 'latency', label: 'Latency', unit: 'ms', source: 'flow' },
  { id: 'mcs', label: 'MCS Index', unit: '', source: 'mcs' },
]

export interface MetricSeries {
  key: string
  data: { time: number; value: number }[]
}

function extractLinkValue(link: LinkState, metricId: MetricId): number | undefined {
  switch (metricId) {
    case 'sinr':
      return link.sinr
    case 'capacity':
      return link.capacityMbps
    default:
      return undefined
  }
}

function extractFlowValue(flow: FlowState, metricId: MetricId): number | undefined {
  switch (metricId) {
    case 'throughput':
      return flow.deliveredMbps
    case 'latency':
      return flow.latencyMs
    default:
      return undefined
  }
}

export function useMetricSeries(frames: SimFrame[], metricId: MetricId): MetricSeries[] {
  return useMemo(() => {
    const config = METRICS.find((m) => m.id === metricId)
    if (!config) return []

    const seriesMap = new Map<string, { time: number; value: number }[]>()

    for (const frame of frames) {
      if (config.source === 'link') {
        for (const link of frame.links) {
          const val = extractLinkValue(link, metricId)
          if (val === undefined || isNaN(val)) continue
          const key = `${link.nodeA}-${link.nodeB}`
          let arr = seriesMap.get(key)
          if (!arr) {
            arr = []
            seriesMap.set(key, arr)
          }
          arr.push({ time: frame.time, value: val })
        }
      } else if (config.source === 'flow') {
        for (const flow of frame.flows) {
          const val = extractFlowValue(flow, metricId)
          if (val === undefined || isNaN(val)) continue
          const key = `${flow.src}→${flow.dst}`
          let arr = seriesMap.get(key)
          if (!arr) {
            arr = []
            seriesMap.set(key, arr)
          }
          arr.push({ time: frame.time, value: val })
        }
      } else if (config.source === 'mcs') {
        for (const mcs of frame.mcs) {
          const val = mcs.mcsIndex
          if (val === undefined || isNaN(val)) continue
          const key = `${mcs.nodeA}-${mcs.nodeB}`
          let arr = seriesMap.get(key)
          if (!arr) {
            arr = []
            seriesMap.set(key, arr)
          }
          arr.push({ time: frame.time, value: val })
        }
      } else if (config.source === 'rxPower') {
        for (const rp of frame.rxPower) {
          const val = rp.rxPowerDbm
          if (val === undefined || isNaN(val)) continue
          const key = `${rp.nodeA}-${rp.nodeB}`
          let arr = seriesMap.get(key)
          if (!arr) {
            arr = []
            seriesMap.set(key, arr)
          }
          arr.push({ time: frame.time, value: val })
        }
      }
    }

    return Array.from(seriesMap.entries()).map(([key, data]) => ({ key, data }))
  }, [frames, metricId])
}

/** Check which metrics have data in the given frames */
export function useAvailableMetrics(frames: SimFrame[]): Set<MetricId> {
  return useMemo(() => {
    const available = new Set<MetricId>()
    if (frames.length === 0) return available

    // Sample first few frames to detect available data
    const sample = frames.slice(0, Math.min(5, frames.length))
    for (const frame of sample) {
      if (frame.links.some((l) => l.sinr !== undefined)) available.add('sinr')
      if (frame.links.some((l) => l.capacityMbps !== undefined)) available.add('capacity')
      if (frame.flows.length > 0) {
        available.add('throughput')
        available.add('latency')
      }
      if (frame.mcs.length > 0) available.add('mcs')
      if (frame.rxPower.length > 0) available.add('rxPower')
    }
    return available
  }, [frames])
}
