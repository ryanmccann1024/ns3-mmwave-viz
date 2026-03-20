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
  return hz >= 1e9 ? `${(hz / 1e9).toFixed(1)} GHz` : `${(hz / 1e6).toFixed(0)} MHz`
}

export default function App() {
  const sim = useSimData()
  const { logs, log, clear: clearLogs } = useSimLog()
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [selectedLink, setSelectedLink] = useState<string | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(true)

  // Log when files are loaded; clear log on each new load
  const prevLoadedRef = useRef(false)
  useEffect(() => {
    if (sim.loaded && !prevLoadedRef.current && sim.meta) {
      clearLogs()
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
    if (!sim.loaded || !sim.currentFrame) return

    const playing = sim.playing
    const frameIndex = sim.frameIndex
    const frame = sim.currentFrame
    const prevPlaying = prevPlayingRef.current
    const prevFrameIndex = prevFrameIdxRef.current

    if (playing && !prevPlaying) {
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
          const label =
            node.nodeType === 'air'
              ? 'UAV'
              : node.nodeType === 'bs'
                ? 'BS'
                : node.nodeType === 'vehicle'
                  ? 'VEH'
                  : 'GND'
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

  function handleSelectNode(id: number | null) {
    setSelectedNode(id)
    setSelectedLink(null)
  }

  // When a new sim is selected while already loaded, clear selection
  function handleLoad(linksFile: File, positionsFile: File, buildingsFile?: File) {
    setSelectedNode(null)
    setSelectedLink(null)
    sim.loadFiles(linksFile, positionsFile, buildingsFile)
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 text-gray-900 font-mono overflow-hidden">
      {sim.loaded ? (
        <>
          <StatsBar
            frame={sim.currentFrame!}
            meta={sim.meta}
            onChangeSim={() => {
              setSelectedNode(null)
              setSelectedLink(null)
              sim.reset()
            }}
          />

          <div className="flex flex-1 min-h-0">
            <div className="flex-1 relative">
              <NetworkCanvas
                frame={sim.currentFrame!}
                nextFrame={sim.nextFrame}
                frameAlphaRef={sim.frameAlphaRef}
                buildings={sim.buildings}
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
              />

              <div className="absolute top-3 left-3 text-xs text-gray-400 pointer-events-none hidden sm:block">
                Drag to orbit · Scroll to zoom · Right-drag to pan
              </div>
            </div>

            <InfoPanel
              frame={sim.currentFrame!}
              selectedNode={selectedNode}
              selectedLink={selectedLink}
              onSelectNode={handleSelectNode}
            />
          </div>

          <div className="hidden sm:block">
            <Terminal
              logs={logs}
              collapsed={!terminalOpen}
              onToggle={() => setTerminalOpen((o) => !o)}
              onClear={clearLogs}
            />
          </div>

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
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <FileLoader onLoad={handleLoad} />
          </div>
        </div>
      )}
    </div>
  )
}
