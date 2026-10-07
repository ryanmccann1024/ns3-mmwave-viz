import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { PlaybackSpeed } from '../hooks/useSimData'
import { PLAYBACK_SPEEDS } from '../styles/tokens'
import { SECONDARY_BUTTON } from './ui/Button'
import { Segmented } from './ui/Segmented'

interface Props {
  playing: boolean
  speed: PlaybackSpeed
  frameIndex: number
  totalFrames: number
  currentTime: number
  /** time of the last frame, for the "of" readout */
  duration?: number
  /** 0..1 progress between the current and next frame, advanced every animation frame */
  frameAlphaRef?: MutableRefObject<number>
  onPlay: () => void
  onPause: () => void
  onSeek: (index: number) => void
  onSetSpeed: (s: PlaybackSpeed) => void
}

const seconds = (t: number) => `${t.toFixed(1)} s`

export function PlaybackControls({
  playing,
  speed,
  frameIndex,
  totalFrames,
  currentTime,
  duration,
  frameAlphaRef,
  onPlay,
  onPause,
  onSeek,
  onSetSpeed,
}: Props) {
  // The bar is drawn imperatively every animation frame from frameIndex plus the in-between
  // alpha, so it glides continuously instead of stepping once per saved frame
  const fillRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ frameIndex, totalFrames, playing })
  useEffect(() => {
    stateRef.current = { frameIndex, totalFrames, playing }
  }, [frameIndex, totalFrames, playing])
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const { frameIndex: i, totalFrames: n, playing: on } = stateRef.current
      const alpha = on && frameAlphaRef ? frameAlphaRef.current : 0
      const p = n > 1 ? Math.min(1, Math.max(0, (i + alpha) / (n - 1))) : 0
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`
      if (thumbRef.current) thumbRef.current.style.transform = `translateX(${p * 100}%)`
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frameAlphaRef])

  return (
    <div className="glass flex items-center gap-4 sm:gap-5 px-4 sm:px-5 py-3 flex-shrink-0">
      <button
        type="button"
        onClick={playing ? onPause : onPlay}
        title={playing ? 'Pause' : 'Play'}
        aria-label={playing ? 'Pause' : 'Play'}
        className={`${SECONDARY_BUTTON} !w-11 !h-11 !px-0 flex-shrink-0`}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <rect x="2" y="1" width="4" height="12" rx="1" />
            <rect x="8" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <polygon points="3,1 13,7 3,13" />
          </svg>
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div className="relative h-5 flex items-center">
          <div className="absolute inset-x-0 h-2 rounded-full bg-ink/10 overflow-hidden">
            <div ref={fillRef} className="h-full w-full bg-accent origin-left scale-x-0" />
          </div>
          {/* The native range input handles pointer and keyboard but is invisible; the drawn
              handle after it shows the smooth position and its focus ring */}
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={frameIndex}
            onChange={(e) => onSeek(parseInt(e.target.value))}
            aria-label="Playback position"
            className="peer absolute inset-0 w-full h-full cursor-pointer opacity-0"
          />
          <div
            ref={thumbRef}
            className="absolute inset-x-0 top-0 h-5 pointer-events-none peer-focus-visible:[&>span]:ring-2 peer-focus-visible:[&>span]:ring-accent/40"
          >
            <span className="absolute -left-2 top-0.5 w-4 h-4 rounded-full bg-white border-4 border-accent shadow-control" />
          </div>
        </div>
        <div className="flex justify-between gap-4 text-sm text-ink-2 tabular-nums">
          <span>
            <span className="font-semibold text-ink">{seconds(currentTime)}</span>
            {duration !== undefined && ` of ${seconds(duration)}`}
          </span>
          <span>
            Frame {frameIndex + 1} of {totalFrames}
          </span>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
        <span className="text-base font-medium text-ink-2">Speed</span>
        <Segmented
          size="lg"
          options={PLAYBACK_SPEEDS.map((s) => ({ value: s as number, label: `${s}×` }))}
          value={speed}
          onChange={(s) => onSetSpeed(s as PlaybackSpeed)}
        />
      </div>
    </div>
  )
}
