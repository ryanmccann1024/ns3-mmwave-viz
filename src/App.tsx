import { useState, useEffect, useRef } from 'react'
import { useSimData } from './hooks/useSimData'
import { useSimLog } from './hooks/useSimLog'
import { FileLoader } from './components/FileLoader'
import { NetworkCanvas } from './components/canvas/NetworkCanvas'
import { PlaybackControls } from './components/PlaybackControls'
import { InfoPanel } from './components/InfoPanel'
import { StatsBar } from './components/StatsBar'
import { Terminal } from './components/ui/Terminal'

function freqLabel(hz: number): string {
  return hz >= 1e9 ? `${(hz / 1e9).toFixed(0)} GHz` : `${(hz / 1e6).toFixed(0)} MHz`
}

export default function App() {
  const sim = useSimData()
  const { logs, log } = useSimLog()
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [selectedLink, setSelectedLink] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<1 | 2 | 3>(3)
  const [terminalOpen, setTerminalOpen] = useState(true)

  // Initialize dimension from CSV metadata; user can still override via toggle
  useEffect(() => {
    if (sim.meta?.dimensions) setDimensions(sim.meta.dimensions)
  }, [sim.meta])

  // Log when files are loaded
  const prevLoadedRef = useRef(false)
  useEffect(() => {
    if (sim.loaded && !prevLoadedRef.current && sim.meta) {
      log(
        'info',
        `Loaded ${sim.meta.scenario} · ${freqLabel(sim.meta.frequency)} · ${sim.meta.numNodes} nodes · ${sim.frames.length} frames`,
        0
      )
    }
    prevLoadedRef.current = sim.loaded
  }, [sim.loaded, sim.meta, sim.frames.length, log])

  // Log playback events and frame-level events
  const prevPlayingRef = useRef(false)
  const prevFrameIdxRef = useRef(0)

  useEffect(() => {
    if (!sim.loaded || !sim.currentFrame) return

    const playing = sim.playing
    const frameIndex = sim.frameIndex
    const frame = sim.currentFrame
    const prevPlaying = prevPlayingRef.current
    const prevFrameIndex = prevFrameIdxRef.current

    // Play / pause transitions
    if (playing && !prevPlaying) {
      log('info', `Playback started at frame ${frameIndex + 1}`, frame.time)
    } else if (!playing && prevPlaying && frameIndex < sim.frames.length - 1) {
      log('info', `Paused at t=${frame.time.toFixed(3)}s`, frame.time)
    } else if (!playing && prevPlaying && frameIndex >= sim.frames.length - 1) {
      log('info', `Playback finished (${sim.frames.length} frames)`, frame.time)
    }

    // Frame-level events (node/link changes)
    if (frameIndex !== prevFrameIndex && frameIndex > 0) {
      const prevFrame = sim.frames[prevFrameIndex]
      if (prevFrame) {
        // Node activation / deactivation
        for (const node of frame.nodes) {
          const prev = prevFrame.nodes.find((n) => n.id === node.id)
          if (!prev) continue
          if (node.active && !prev.active) {
            const label =
              node.nodeType === 'air'
                ? 'UAV'
                : node.nodeType === 'bs'
                  ? 'BS'
                  : node.nodeType === 'vehicle'
                    ? 'VEH'
                    : 'GND'
            log('event', `Node ${node.id} (${label}) activated`, frame.time)
          } else if (!node.active && prev.active) {
            const label =
              node.nodeType === 'air'
                ? 'UAV'
                : node.nodeType === 'bs'
                  ? 'BS'
                  : node.nodeType === 'vehicle'
                    ? 'VEH'
                    : 'GND'
            log('warn', `Node ${node.id} (${label}) went offline`, frame.time)
          }
        }

        // Link connect / disconnect
        for (const link of frame.links) {
          const prev = prevFrame.links.find((l) => l.nodeA === link.nodeA && l.nodeB === link.nodeB)
          if (!prev) continue
          if (link.connected && !prev.connected) {
            log(
              'event',
              `Link ${link.nodeA}-${link.nodeB} connected (${link.condition}, ${link.rxPower.toFixed(1)} dBm)`,
              frame.time
            )
          } else if (!link.connected && prev.connected) {
            log(
              'warn',
              `Link ${link.nodeA}-${link.nodeB} dropped below threshold (${link.rxPower.toFixed(1)} dBm)`,
              frame.time
            )
          }
        }
      }
    }

    prevPlayingRef.current = playing
    prevFrameIdxRef.current = frameIndex
  })

  function handleDimensionsChange(d: 1 | 2 | 3) {
    setDimensions(d)
  }

  function handleSeek(index: number) {
    if (sim.currentFrame) {
      const targetFrame = sim.frames[index]
      if (targetFrame)
        log(
          'info',
          `Seeking to frame ${index + 1} (t=${targetFrame.time.toFixed(3)}s)`,
          targetFrame.time
        )
    }
    sim.seek(index)
  }

  function handleSetSpeed(s: Parameters<typeof sim.setSpeed>[0]) {
    log('info', `Speed set to ${s}×`, sim.currentFrame?.time ?? 0)
    sim.setSpeed(s)
  }

  function handleThresholdChange(t: number) {
    log('info', `Threshold updated to ${t} dBm`, sim.currentFrame?.time ?? 0)
    sim.setThreshold(t)
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-900 text-slate-200 font-mono overflow-hidden">
      {sim.loaded ? (
        <>
          {/* Top stats bar */}
          <StatsBar
            frame={sim.currentFrame!}
            meta={sim.meta}
            threshold={sim.threshold}
            onThresholdChange={handleThresholdChange}
            dimensions={dimensions}
            onDimensionsChange={handleDimensionsChange}
          />

          {/* Main area */}
          <div className="flex flex-1 min-h-0">
            {/* 3D Canvas */}
            <div className="flex-1 relative">
              <NetworkCanvas
                frame={sim.currentFrame!}
                nextFrame={sim.nextFrame}
                alpha={sim.frameAlpha}
                selectedNode={selectedNode}
                selectedLink={selectedLink}
                onSelectNode={(id) => {
                  setSelectedNode(id)
                  setSelectedLink(null)
                }}
                onSelectLink={(key) => {
                  setSelectedLink(key)
                  setSelectedNode(null)
                }}
                dimensions={dimensions}
              />

              {/* Camera hint overlay */}
              <div className="absolute top-3 left-3 text-xs text-slate-600 pointer-events-none hidden sm:block">
                {dimensions === 3
                  ? 'Drag to orbit · Scroll to zoom · Right-drag to pan'
                  : 'Scroll to zoom · Right-drag to pan'}
              </div>
            </div>

            {/* Right info panel — desktop only */}
            <InfoPanel
              frame={sim.currentFrame!}
              selectedNode={selectedNode}
              selectedLink={selectedLink}
            />
          </div>

          {/* Terminal — hidden on mobile */}
          <div className="hidden sm:block">
            <Terminal
              logs={logs}
              collapsed={!terminalOpen}
              onToggle={() => setTerminalOpen((o) => !o)}
            />
          </div>

          {/* Bottom playback controls */}
          <PlaybackControls
            playing={sim.playing}
            speed={sim.speed}
            frameIndex={sim.frameIndex}
            totalFrames={sim.frames.length}
            currentTime={sim.currentFrame?.time ?? 0}
            onPlay={sim.play}
            onPause={sim.pause}
            onSeek={handleSeek}
            onSetSpeed={handleSetSpeed}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="w-full max-w-md bg-slate-800/60 border border-slate-700 rounded-2xl p-8">
            <FileLoader onLoad={sim.loadFiles} />
          </div>
        </div>
      )}
    </div>
  )
}
