import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { Button } from './ui/Button'
import {
  hasFSA,
  loadDirectoryHandle,
  saveDirectoryHandle,
  clearDirectoryHandle,
} from '../lib/directoryCache'
import type { RunEntry } from '../lib/assembleRuns'
import {
  assembleRuns,
  fetchRunsFromDevServer,
  parseRunsFromFileList,
  walkDirectory,
} from '../lib/assembleRuns'

interface Props {
  onLoad: (run: RunEntry) => void
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
  // On mount: try dev-server auto-discovery first, then cached FSA handle
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      // 1. Try the dev-server API (no permission prompt needed)
      const devRuns = await fetchRunsFromDevServer()
      if (!cancelled && devRuns && devRuns.length > 0) {
        applyRuns('outputs', devRuns)
        return
      }

      // 2. Fall back to cached FSA handle
      if (!hasFSA()) return
      const handle = await loadDirectoryHandle()
      if (cancelled || !handle) return
      try {
        const perm = await handle.requestPermission({ mode: 'read' })
        if (perm === 'granted' && !cancelled) {
          await openWithFSA(handle)
        }
      } catch {
        await clearDirectoryHandle()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [openWithFSA, applyRuns])

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
    onLoad(run)
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
          <Button variant="link" onClick={handleForgetFolder}>
            Forget saved folder
          </Button>
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
                          {run.point && (
                            <span className="text-[10px] text-violet-600 font-mono bg-violet-50 border border-violet-100 rounded px-1">
                              {run.point}
                            </span>
                          )}
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
