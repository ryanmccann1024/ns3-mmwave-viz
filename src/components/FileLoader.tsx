import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { Button } from './ui/Button'
import {
  hasFSA,
  loadDirectoryHandle,
  saveDirectoryHandle,
  clearDirectoryHandle,
} from '../lib/directoryCache'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------
interface RunEntry {
  yearMonth: string
  day: string
  time: string
  seed: string
  key: string
  linksFile: File
  posFile: File
  buildingsFile?: File
}

interface Props {
  onLoad: (linksFile: File, positionsFile: File, buildingsFile?: File) => void
}

// -------------------------------------------------------------------------
// Parsing helpers — shared by both the classic <input> and FSA paths
// -------------------------------------------------------------------------
type FilePair = { path: string; file: File }

function assembleRuns(pairs: FilePair[]): RunEntry[] {
  type Partial = {
    yearMonth: string
    day: string
    time: string
    seed: string
    key: string
    links?: File
    pos?: File
    buildings?: File
  }
  const byKey = new Map<string, Partial>()

  for (const { path, file } of pairs) {
    const parts = path.split('/')
    // Expected: outputs/YYYY-MM/DD/HH-MM-SS/seed-N/filename
    if (parts.length < 6) continue
    const fname = parts[parts.length - 1]
    if (fname !== 'links.csv' && fname !== 'positions.csv' && fname !== 'buildings.json') continue

    const seedDir = parts[parts.length - 2]
    if (!seedDir.startsWith('seed-')) continue

    const time = parts[parts.length - 3]
    const day = parts[parts.length - 4]
    const yearMonth = parts[parts.length - 5]
    const key = `${yearMonth}/${day}/${time}/${seedDir}`

    if (!byKey.has(key)) byKey.set(key, { yearMonth, day, time, seed: seedDir, key })
    const entry = byKey.get(key)!
    if (fname === 'links.csv') entry.links = file
    if (fname === 'positions.csv') entry.pos = file
    if (fname === 'buildings.json') entry.buildings = file
  }

  const runs: RunEntry[] = []
  for (const e of byKey.values()) {
    if (e.links && e.pos)
      runs.push({
        yearMonth: e.yearMonth,
        day: e.day,
        time: e.time,
        seed: e.seed,
        key: e.key,
        linksFile: e.links!,
        posFile: e.pos!,
        buildingsFile: e.buildings,
      })
  }
  return runs.sort((a, b) => b.key.localeCompare(a.key))
}

// Classic <input webkitdirectory> path
function parseRunsFromFileList(files: FileList): RunEntry[] {
  const pairs: FilePair[] = Array.from(files).map((f) => ({
    path: f.webkitRelativePath,
    file: f,
  }))
  return assembleRuns(pairs)
}

// File System Access API path — walk directory recursively
async function walkDirectory(handle: FileSystemDirectoryHandle, prefix = ''): Promise<FilePair[]> {
  const pairs: FilePair[] = []
  for await (const [name, entry] of handle) {
    const path = prefix ? `${prefix}/${name}` : name
    if (entry.kind === 'file') {
      // Only materialise files we care about (avoid reading every file)
      if (name === 'links.csv' || name === 'positions.csv' || name === 'buildings.json') {
        const file = await (entry as FileSystemFileHandle).getFile()
        pairs.push({ path, file })
      }
    } else if (entry.kind === 'directory') {
      pairs.push(...(await walkDirectory(entry as FileSystemDirectoryHandle, path)))
    }
  }
  return pairs
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------
export function FileLoader({ onLoad }: Props) {
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [runs, setRuns] = useState<RunEntry[]>([])
  const [dirName, setDirName] = useState<string | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [loadingDir, setLoadingDir] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)

  // -----------------------------------------------------------------------
  // Apply runs from any source
  // -----------------------------------------------------------------------
  const applyRuns = useCallback((name: string, found: RunEntry[]) => {
    setDirName(name)
    setRuns(found)
    setPermissionDenied(false)
    if (found.length > 0) setExpandedGroup(`${found[0].yearMonth}/${found[0].day}`)
  }, [])

  // -----------------------------------------------------------------------
  // File System Access API path
  // -----------------------------------------------------------------------
  const openWithFSA = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      setLoadingDir(true)
      try {
        const pairs = await walkDirectory(handle)
        const found = assembleRuns(pairs)
        applyRuns(handle.name, found)
        await saveDirectoryHandle(handle)
      } finally {
        setLoadingDir(false)
      }
    },
    [applyRuns]
  )

  const pickDirectoryFSA = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' })
      await openWithFSA(handle)
    } catch (err) {
      // User cancelled or permission denied — do nothing
      if (err instanceof Error && err.name !== 'AbortError') {
        console.warn('Directory picker error:', err)
      }
    }
  }, [openWithFSA])

  // -----------------------------------------------------------------------
  // On mount: try to restore cached handle
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!hasFSA()) return
    let cancelled = false

    loadDirectoryHandle().then(async (handle) => {
      if (cancelled || !handle) return
      try {
        const perm = await handle.requestPermission({ mode: 'read' })
        if (perm === 'granted' && !cancelled) {
          await openWithFSA(handle)
        }
      } catch {
        // Handle may be stale or permission was rejected
        await clearDirectoryHandle()
      }
    })

    return () => {
      cancelled = true
    }
  }, [openWithFSA])

  // -----------------------------------------------------------------------
  // Classic <input> fallback
  // -----------------------------------------------------------------------
  function onDirSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const firstName = files[0].webkitRelativePath.split('/')[0]
    applyRuns(firstName, parseRunsFromFileList(files))
  }

  function handleOpenClick() {
    if (hasFSA()) {
      pickDirectoryFSA()
    } else {
      dirInputRef.current?.click()
    }
  }

  async function handleForgetFolder() {
    await clearDirectoryHandle()
    setDirName(null)
    setRuns([])
    setExpandedGroup(null)
    setActiveKey(null)
  }

  // -----------------------------------------------------------------------
  // Select a run
  // -----------------------------------------------------------------------
  function selectRun(run: RunEntry) {
    setActiveKey(run.key)
    onLoad(run.linksFile, run.posFile, run.buildingsFile)
  }

  // Group by YYYY-MM/DD
  const grouped = useMemo(() => {
    const map = new Map<string, RunEntry[]>()
    for (const r of runs) {
      const g = `${r.yearMonth}/${r.day}`
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [runs])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <div className="text-2xl font-semibold text-gray-900 mb-1">mmWave Sim Visualizer</div>
        <div className="text-sm text-gray-400">
          Open your simulation outputs folder to get started
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button variant="primary" onClick={handleOpenClick} disabled={loadingDir}>
          {loadingDir
            ? 'Reading folder…'
            : dirName
              ? `${dirName}  ·  change`
              : 'Open Outputs Folder'}
        </Button>

        {!dirName && (
          <div className="text-xs text-gray-400 text-center">
            Navigate to <span className="font-mono text-gray-500">scratch/mmwave-sim/outputs</span>
          </div>
        )}

        {dirName && hasFSA() && (
          <button
            onClick={handleForgetFolder}
            className="text-xs text-gray-400 hover:text-gray-500 transition-colors"
          >
            Forget saved folder
          </button>
        )}

        {permissionDenied && (
          <div className="text-xs text-amber-600 text-center">
            Permission denied — please click "Open Outputs Folder" to re-grant access.
          </div>
        )}

        {/* Fallback for non-FSA browsers */}
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
            <span className="text-xs text-gray-400 font-mono">{dirName}/</span>
            <span className="text-xs text-gray-400">
              {runs.length} run{runs.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden bg-white max-h-72 overflow-y-auto">
            {grouped.map(([group, groupRuns]) => (
              <div key={group} className="border-b border-gray-100 last:border-0">
                <button
                  onClick={() => setExpandedGroup(expandedGroup === group ? null : group)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">
                      {expandedGroup === group ? '▾' : '▸'}
                    </span>
                    <span className="text-gray-700 text-sm font-mono">{group}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {groupRuns.length} run{groupRuns.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {expandedGroup === group && (
                  <div className="border-t border-gray-100">
                    {groupRuns.map((run) => (
                      <button
                        key={run.key}
                        onClick={() => selectRun(run)}
                        className={`w-full flex items-center justify-between px-4 py-2 transition-colors border-b border-gray-50 last:border-0 text-left ${
                          activeKey === run.key
                            ? 'bg-sky-50 border-l-2 border-l-sky-500'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300 text-xs">└</span>
                          <span className="text-sky-600 text-sm font-mono">{run.time}</span>
                          <span className="text-gray-400 text-xs font-mono">{run.seed}</span>
                        </div>
                        {run.buildingsFile && (
                          <span className="text-[10px] text-emerald-600 font-mono bg-emerald-50 border border-emerald-100 rounded px-1">
                            bldg
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {dirName && runs.length === 0 && !loadingDir && (
        <div className="text-center text-xs text-gray-400 py-2">
          No runs found — make sure you opened the{' '}
          <span className="font-mono text-gray-500">outputs/</span> folder.
        </div>
      )}
    </div>
  )
}
