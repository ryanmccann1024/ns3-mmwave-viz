import { useState, useCallback, useRef } from 'react'
import type { LogEntry } from '../types'

const MAX_LOGS = 500

export interface UseSimLogReturn {
  logs: LogEntry[]
  log: (level: LogEntry['level'], message: string, timestamp?: number) => void
  clear: () => void
}

export function useSimLog(): UseSimLogReturn {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const counterRef = useRef(0)

  const log = useCallback((level: LogEntry['level'], message: string, timestamp = 0) => {
    const entry: LogEntry = {
      id: counterRef.current++,
      timestamp,
      wallTime: new Date(),
      level,
      message,
    }
    setLogs((prev) => {
      const next = [...prev, entry]
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next
    })
  }, [])

  const clear = useCallback(() => setLogs([]), [])

  return { logs, log, clear }
}
