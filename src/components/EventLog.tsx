import { useEffect, useRef } from 'react'
import type { LogEntry } from '../types'
import { Button } from './ui/Button'

const LEVEL_DOT: Record<LogEntry['level'], string> = {
  info: 'bg-ink-2/40',
  event: 'bg-accent',
  warn: 'bg-amber-500',
  error: 'bg-rose-500',
}

const LEVEL_TEXT: Record<LogEntry['level'], string> = {
  info: 'text-ink-2',
  event: 'text-accent-ink',
  warn: 'text-amber-700',
  error: 'text-rose-700',
}

/** Playback events, newest at the bottom */
export function EventLog({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [logs])

  return (
    <div className="flex flex-col gap-2.5 text-base">
      <div className="flex items-center justify-between gap-4 pb-1">
        <span className="text-lg font-semibold tracking-tight text-ink-title">
          {logs.length} {logs.length === 1 ? 'event' : 'events'}
        </span>
        {logs.length > 0 && (
          <Button variant="secondary" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      {logs.length === 0 && <div className="text-ink-2">No events yet. Press play to begin.</div>}
      {logs.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2">
          <span className="text-ink-2 tabular-nums flex-shrink-0 w-16 text-right">
            {entry.timestamp.toFixed(1)} s
          </span>
          <span className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${LEVEL_DOT[entry.level]}`} />
          <span className={LEVEL_TEXT[entry.level]}>{entry.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
