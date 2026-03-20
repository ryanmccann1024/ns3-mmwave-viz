import type { PlaybackSpeed } from '../hooks/useSimData'
import { PLAYBACK_SPEEDS } from '../styles/tokens'
import { Button } from './ui/Button'

interface Props {
  playing: boolean
  speed: PlaybackSpeed
  frameIndex: number
  totalFrames: number
  currentTime: number
  onPlay: () => void
  onPause: () => void
  onSeek: (index: number) => void
  onSetSpeed: (s: PlaybackSpeed) => void
}

export function PlaybackControls({
  playing,
  speed,
  frameIndex,
  totalFrames,
  currentTime,
  onPlay,
  onPause,
  onSeek,
  onSetSpeed,
}: Props) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-white border-t border-gray-200">
      {/* Play / Pause */}
      <Button
        variant="icon-round"
        onClick={playing ? onPause : onPlay}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="1" width="4" height="12" rx="1" />
            <rect x="8" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <polygon points="2,1 13,7 2,13" />
          </svg>
        )}
      </Button>

      {/* Timeline scrubber */}
      <div className="flex-1 flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={frameIndex}
          onChange={(e) => onSeek(parseInt(e.target.value))}
          className="w-full h-1.5 accent-sky-500 cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-400 font-mono">
          <span>t = {currentTime.toFixed(3)}s</span>
          <span>
            frame {frameIndex + 1} / {totalFrames}
          </span>
        </div>
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs text-gray-400 mr-1 hidden sm:inline">Speed</span>
        {PLAYBACK_SPEEDS.map((s) => (
          <Button
            key={s}
            variant="ghost"
            active={speed === s}
            onClick={() => onSetSpeed(s as PlaybackSpeed)}
          >
            {s}×
          </Button>
        ))}
      </div>
    </div>
  )
}
