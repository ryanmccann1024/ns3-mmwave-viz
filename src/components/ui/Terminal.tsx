import { useEffect, useRef } from 'react'
import type { LogEntry } from '../../types'

interface Props {
  logs: LogEntry[]
  collapsed: boolean
  onToggle: () => void
  onClear: () => void
}

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: 'text-gray-400',
  event: 'text-sky-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
}

const LEVEL_LABEL: Record<LogEntry['level'], string> = {
  info: 'INFO ',
  event: 'EVENT',
  warn: 'WARN ',
  error: 'ERROR',
}

export function Terminal({ logs, collapsed, onToggle, onClear }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, collapsed])

  return (
    <div className="bg-gray-50 border-t border-gray-200 font-mono text-xs flex-shrink-0">
      <div className="flex items-center justify-between px-3 h-8">
        <div
          className="flex items-center gap-2 cursor-pointer select-none flex-1 hover:text-gray-600 transition-colors"
          onClick={onToggle}
        >
          <span className="text-gray-400 uppercase tracking-widest text-[10px]">Event Log</span>
          <span className="text-gray-400">{logs.length} entries</span>
          <span className="text-gray-400">{collapsed ? '▸' : '▾'}</span>
        </div>
        {logs.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors px-1"
          >
            Clear
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="h-40 sm:h-52 overflow-y-auto px-3 pb-2">
          {logs.length === 0 && (
            <div className="text-gray-300 pt-2">No events yet — load a simulation to begin.</div>
          )}
          {logs.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-0.5 leading-relaxed">
              <span className="text-gray-400 flex-shrink-0">[t={entry.timestamp.toFixed(3)}s]</span>
              <span className={`flex-shrink-0 ${LEVEL_COLOR[entry.level]}`}>
                {LEVEL_LABEL[entry.level]}
              </span>
              <span className="text-gray-700">{entry.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
