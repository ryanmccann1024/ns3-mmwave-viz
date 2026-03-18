import { useRef, useState, useMemo } from 'react'
import { Button } from './ui/Button'

// -------------------------------------------------------------------------
// Run discovery from a directory input (webkitdirectory)
// File.webkitRelativePath looks like:
//   data/2026/03/16/130201442/output/links.csv
// -------------------------------------------------------------------------
interface RunEntry {
  date: string
  time: string
  runId: string
  linksFile: File
  posFile: File
}

function parseRuns(files: FileList): RunEntry[] {
  type Partial = { date: string; time: string; runId: string; links?: File; pos?: File }
  const byKey = new Map<string, Partial>()

  for (const file of Array.from(files)) {
    const parts = file.webkitRelativePath.split('/')
    if (parts.length < 7) continue
    if (parts[parts.length - 2] !== 'output') continue
    const fname = parts[parts.length - 1]
    if (fname !== 'links.csv' && fname !== 'positions.csv') continue

    const year = parts[parts.length - 6]
    const month = parts[parts.length - 5]
    const day = parts[parts.length - 4]
    const runId = parts[parts.length - 3]
    const key = `${year}/${month}/${day}/${runId}`

    if (!byKey.has(key)) {
      const h = runId.slice(0, 2),
        m = runId.slice(2, 4),
        s = runId.slice(4, 6)
      byKey.set(key, { date: `${year}-${month}-${day}`, time: `${h}:${m}:${s}`, runId })
    }
    const entry = byKey.get(key)!
    if (fname === 'links.csv') entry.links = file
    if (fname === 'positions.csv') entry.pos = file
  }

  const runs: RunEntry[] = []
  for (const e of byKey.values()) {
    if (e.links && e.pos)
      runs.push({ date: e.date, time: e.time, runId: e.runId, linksFile: e.links, posFile: e.pos })
  }
  return runs.sort((a, b) => `${b.date}${b.runId}`.localeCompare(`${a.date}${a.runId}`))
}

// -------------------------------------------------------------------------

interface Props {
  onLoad: (linksFile: File, positionsFile: File) => void
}

export function FileLoader({ onLoad }: Props) {
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [runs, setRuns] = useState<RunEntry[]>([])
  const [dirName, setDirName] = useState<string | null>(null)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<string | null>(null)

  function onDirSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const firstName = files[0].webkitRelativePath.split('/')[0]
    setDirName(firstName)
    const found = parseRuns(files)
    setRuns(found)
    if (found.length > 0) setExpandedDate(found[0].date)
  }

  function selectRun(run: RunEntry) {
    setActiveRun(run.runId)
    onLoad(run.linksFile, run.posFile)
  }

  const grouped = useMemo(() => {
    const map = new Map<string, RunEntry[]>()
    for (const r of runs) {
      if (!map.has(r.date)) map.set(r.date, [])
      map.get(r.date)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [runs])

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <div className="text-2xl font-semibold text-slate-200 mb-1">NYU Mesh Visualizer</div>
        <div className="text-sm text-slate-400">
          Open your simulation data folder to get started
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button variant="primary" onClick={() => dirInputRef.current?.click()}>
          {dirName ? `${dirName}  ·  change` : 'Open Data Folder'}
        </Button>
        {!dirName && (
          <div className="text-xs text-slate-600 text-center">
            Navigate to <span className="font-mono text-slate-500">scratch/nyu-mesh-sim/data</span>
          </div>
        )}
        <input
          ref={dirInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is non-standard but widely supported
          webkitdirectory=""
          className="hidden"
          onChange={onDirSelect}
        />
      </div>

      {runs.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-slate-500 font-mono">{dirName}/</span>
            <span className="text-xs text-slate-600">
              {runs.length} run{runs.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="rounded-lg border border-slate-700 overflow-hidden bg-slate-900/60 max-h-72 overflow-y-auto">
            {grouped.map(([date, dateRuns]) => (
              <div key={date} className="border-b border-slate-700/60 last:border-0">
                <button
                  onClick={() => setExpandedDate(expandedDate === date ? null : date)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs">
                      {expandedDate === date ? '▾' : '▸'}
                    </span>
                    <span className="text-slate-300 text-sm font-mono">{date}</span>
                  </div>
                  <span className="text-xs text-slate-600">
                    {dateRuns.length} run{dateRuns.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {expandedDate === date && (
                  <div className="border-t border-slate-700/40">
                    {dateRuns.map((run) => (
                      <button
                        key={run.runId}
                        onClick={() => selectRun(run)}
                        className={`w-full flex items-center justify-between px-4 py-2 transition-colors border-b border-slate-700/30 last:border-0 text-left
                          ${activeRun === run.runId ? 'bg-sky-900/40' : 'hover:bg-sky-900/20'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 text-xs">└</span>
                          <span className="text-sky-300 text-sm font-mono">{run.time}</span>
                        </div>
                        <span className="text-xs text-slate-500 font-mono">{run.runId}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {dirName && runs.length === 0 && (
        <div className="text-center text-xs text-slate-500 py-2">
          No runs found — make sure you opened the <span className="font-mono">data/</span> folder.
        </div>
      )}
    </div>
  )
}
