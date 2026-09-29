import { useEffect, useRef } from 'react'
import type { UseSimDataReturn } from './useSimData'
import { useSimLog } from './useSimLog'
import { NODE_LABELS } from '../styles/tokens'
import { freqLabel } from '../lib/format'

/** Event log for the player: load, playback, node and link transitions */
export function usePlaybackLog(sim: UseSimDataReturn) {
  const { logs, log, clear: clearLogs } = useSimLog()

  // Log when files are loaded; clear log on each new load
  const prevLoadedRef = useRef(false)
  const resetFrameIdxRef = useRef<number | null>(null)
  useEffect(() => {
    if (sim.loaded && !prevLoadedRef.current && sim.meta) {
      clearLogs()
      resetFrameIdxRef.current = 0
      log(
        'info',
        `Loaded ${sim.meta.scenario} · ${freqLabel(sim.meta.frequency)} · ${sim.meta.numNodes} nodes · ${sim.frames.length} frames`,
        0
      )
    }
    prevLoadedRef.current = sim.loaded
  }, [sim.loaded, sim.meta, sim.frames.length, log, clearLogs])

  // Log playback events and frame-level events
  const prevPlayingRef = useRef(false)
  const prevFrameIdxRef = useRef(0)

  useEffect(() => {
    // Handle reset signals from load/clear handlers
    if (resetFrameIdxRef.current !== null) {
      prevFrameIdxRef.current = resetFrameIdxRef.current
      resetFrameIdxRef.current = null
    }

    if (!sim.loaded || !sim.currentFrame) return

    const playing = sim.playing
    const frameIndex = sim.frameIndex
    const frame = sim.currentFrame
    const prevPlaying = prevPlayingRef.current
    const prevFrameIndex = prevFrameIdxRef.current

    if (playing && !prevPlaying) {
      if (prevFrameIndex >= sim.frames.length - 1 && frameIndex === 0) {
        clearLogs()
      }
      log('info', `Playback started at frame ${frameIndex + 1}`, frame.time)
    } else if (!playing && prevPlaying && frameIndex < sim.frames.length - 1) {
      log('info', `Paused at t=${frame.time.toFixed(3)}s`, frame.time)
    } else if (!playing && prevPlaying && frameIndex >= sim.frames.length - 1) {
      log('info', `Playback finished (${sim.frames.length} frames)`, frame.time)
    }

    if (frameIndex !== prevFrameIndex && frameIndex > 0) {
      const prevFrame = sim.frames[prevFrameIndex]
      if (prevFrame) {
        for (const node of frame.nodes) {
          const prev = prevFrame.nodes.find((n) => n.id === node.id)
          if (!prev) continue
          const label = NODE_LABELS[node.nodeType] ?? node.nodeType.toUpperCase()
          if (node.active && !prev.active) {
            log('event', `Node ${node.id} (${label}) activated`, frame.time)
          } else if (!node.active && prev.active) {
            log('warn', `Node ${node.id} (${label}) went offline`, frame.time)
          }
        }

        for (const link of frame.links) {
          const prev = prevFrame.links.find((l) => l.nodeA === link.nodeA && l.nodeB === link.nodeB)
          if (!prev) continue
          if (link.connected && !prev.connected) {
            log(
              'event',
              `Link ${link.nodeA}-${link.nodeB} connected (${link.condition}${link.sinr !== undefined ? `, ${link.sinr.toFixed(1)} dB` : ''})`,
              frame.time
            )
          } else if (!link.connected && prev.connected) {
            log('warn', `Link ${link.nodeA}-${link.nodeB} dropped`, frame.time)
          }
        }
      }
    }

    prevPlayingRef.current = playing
    prevFrameIdxRef.current = frameIndex
  })

  function handleSeek(index: number) {
    if (sim.currentFrame) {
      const targetFrame = sim.frames[index]
      if (targetFrame)
        log(
          'info',
          `Seek → frame ${index + 1} (t=${targetFrame.time.toFixed(3)}s)`,
          targetFrame.time
        )
    }
    sim.seek(index)
  }

  function handleSetSpeed(s: Parameters<typeof sim.setSpeed>[0]) {
    log('info', `Speed set to ${s}×`, sim.currentFrame?.time ?? 0)
    sim.setSpeed(s)
  }

  function handleClearLogs() {
    clearLogs()
    resetFrameIdxRef.current = sim.frameIndex
  }

  return { logs, handleSeek, handleSetSpeed, handleClearLogs }
}
