import { useEffect, useRef } from 'react'
import type { LogEntry } from '../../types'

interface Props {
  logs: LogEntry[]
  collapsed: boolean
  onToggle: () => void
}

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: 'text-slate-400',
  event: 'text-sky-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
}

const LEVEL_LABEL: Record<LogEntry['level'], string> = {
  info: 'INFO ',
  event: 'EVENT',
  warn: 'WARN ',
  error: 'ERROR',
}

export function Terminal({ logs, collapsed, onToggle }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, collapsed])

  return (
    <div className="bg-slate-950 border-t border-slate-700 font-mono text-xs flex-shrink-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 h-8 cursor-pointer select-none hover:bg-slate-900 transition-colors"
        onClick={onToggle}
      >
        <span className="text-slate-500 uppercase tracking-widest text-[10px]">Terminal</span>
        <div className="flex items-center gap-3">
          <span className="text-slate-600">{logs.length} entries</span>
          <span className="text-slate-500">{collapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {/* Log body */}
      {!collapsed && (
        <div className="h-40 sm:h-52 overflow-y-auto px-3 pb-2">
          {logs.length === 0 && (
            <div className="text-slate-700 pt-2">No events yet — load a simulation to begin.</div>
          )}
          {logs.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-0.5 leading-relaxed">
              <span className="text-slate-600 flex-shrink-0">
                [t={entry.timestamp.toFixed(3)}s]
              </span>
              <span className={`flex-shrink-0 ${LEVEL_COLOR[entry.level]}`}>
                {LEVEL_LABEL[entry.level]}
              </span>
              <span className="text-slate-300">{entry.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
