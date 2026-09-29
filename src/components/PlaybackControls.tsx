import type { PlaybackSpeed } from '../hooks/useSimData'
import { PLAYBACK_SPEEDS } from '../styles/tokens'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'

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
    <div className="glass flex items-center gap-3 px-3 py-2 flex-shrink-0">
      {/* Play / Pause */}
      <Button
        variant="icon-round"
        className="!w-8 !h-8"
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
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div className="relative h-4 flex items-center">
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-ink/10" />
          <div
            className="absolute left-0 h-1.5 rounded-full bg-accent"
            style={{ width: `${totalFrames > 1 ? (frameIndex / (totalFrames - 1)) * 100 : 0}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={frameIndex}
            onChange={(e) => onSeek(parseInt(e.target.value))}
            className="relative w-full h-1.5 cursor-pointer !bg-transparent"
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted font-mono tabular-nums">
          <span>
            t = <span className="text-ink font-semibold">{currentTime.toFixed(3)}s</span>
          </span>
          <span>
            frame {frameIndex + 1} / {totalFrames}
          </span>
        </div>
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[11px] text-muted hidden sm:inline">Speed</span>
        <Segmented
          size="sm"
          options={PLAYBACK_SPEEDS.map((s) => ({ value: s as number, label: `${s}×` }))}
          value={speed}
          onChange={(s) => onSetSpeed(s as PlaybackSpeed)}
        />
      </div>
    </div>
  )
}
