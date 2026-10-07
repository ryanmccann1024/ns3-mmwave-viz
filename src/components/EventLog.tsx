import { useEffect, useRef } from 'react'
import type { LogEntry } from '../types'

const LEVEL_DOT: Record<LogEntry['level'], string> = {
  info: 'bg-faint',
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
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted">{logs.length} events</span>
        {logs.length > 0 && (
          <button onClick={onClear} className="text-[11px] font-medium text-muted hover:text-ink">
            Clear
          </button>
        )}
      </div>
      {logs.length === 0 && <div className="text-faint">No events yet. Press play to begin.</div>}
      {logs.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2">
          <span className="text-faint font-mono tabular-nums flex-shrink-0 w-14 text-right">
            {entry.timestamp.toFixed(2)}s
          </span>
          <span
            className={`w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0 ${LEVEL_DOT[entry.level]}`}
          />
          <span className={LEVEL_TEXT[entry.level]}>{entry.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
