import { useCallback, useEffect, useRef, useState } from 'react'
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
import type { ResultCatalog } from '../lib/resultCatalog'
import {
  catalogFromDevServer,
  catalogFromDirectoryHandle,
  catalogFromFileList,
} from '../lib/resultCatalog'
import type { ExperimentRoot } from '../lib/experimentIndex'
import { discoverExperiments } from '../lib/experimentIndex'
import { discoverTrainingRuns } from '../lib/trainingRun'

/**
 * The open outputs folder: legacy simulation runs plus the RL experiment roots found in it.
 * Lives above every page so the folder survives navigation.
 */
export function useWorkspace() {
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [runs, setRuns] = useState<RunEntry[]>([])
  const [dirName, setDirName] = useState<string | null>(null)
  const [loadingDir, setLoadingDir] = useState(false)
  const [catalog, setCatalog] = useState<ResultCatalog | null>(null)
  const [experimentRoots, setExperimentRoots] = useState<ExperimentRoot[]>([])
  const [trainingRoots, setTrainingRoots] = useState<string[]>([])
  const [allTrainingRoots, setAllTrainingRoots] = useState<string[]>([])

  // Experiment folders are indexed from path names only; no file is read here
  const applyCatalog = useCallback((next: ResultCatalog | null) => {
    setCatalog(next)
    const roots = next ? discoverExperiments(next) : []
    setExperimentRoots(roots)
    // Training inside an experiment plan is reached through that experiment
    const plans = roots.filter((r) => r.kind === 'plan').map((r) => r.root)
    const discovered = next ? discoverTrainingRuns(next) : []
    setAllTrainingRoots(discovered)
    setTrainingRoots(
      next
        ? discovered.filter((t) => !plans.some((p) => p === '' || t === p || t.startsWith(p + '/')))
        : []
    )
  }, [])

  const applyRuns = useCallback((name: string, found: RunEntry[]) => {
    setDirName(name)
    setRuns(found)
  }, [])

  const openWithFSA = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      setLoadingDir(true)
      try {
        const pairs = await walkDirectory(handle)
        applyRuns(handle.name, assembleRuns(pairs))
        applyCatalog(await catalogFromDirectoryHandle(handle).catch(() => null))
        await saveDirectoryHandle(handle)
      } finally {
        setLoadingDir(false)
      }
    },
    [applyRuns, applyCatalog]
  )

  // On mount: try dev-server auto-discovery first, then the cached FSA handle
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingDir(true)
      try {
        const devRuns = await fetchRunsFromDevServer()
        const devCatalog = await catalogFromDevServer()
        if (cancelled) return
        const devRoots = devCatalog ? discoverExperiments(devCatalog) : []
        if ((devRuns && devRuns.length > 0) || devRoots.length > 0) {
          applyRuns('outputs', devRuns ?? [])
          applyCatalog(devCatalog)
          return
        }
        if (!hasFSA()) return
        const handle = await loadDirectoryHandle()
        if (cancelled || !handle) return
        try {
          const perm = await handle.requestPermission({ mode: 'read' })
          if (perm === 'granted' && !cancelled) await openWithFSA(handle)
        } catch {
          await clearDirectoryHandle()
        }
      } finally {
        if (!cancelled) setLoadingDir(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openWithFSA, applyRuns, applyCatalog])

  const openFolder = useCallback(async () => {
    if (!hasFSA()) {
      dirInputRef.current?.click()
      return
    }
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

  /** Classic <input webkitdirectory> fallback */
  const onDirSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return
      applyRuns(files[0].webkitRelativePath.split('/')[0], parseRunsFromFileList(files))
      applyCatalog(catalogFromFileList(files))
    },
    [applyRuns, applyCatalog]
  )

  const forgetFolder = useCallback(async () => {
    await clearDirectoryHandle()
    setDirName(null)
    setRuns([])
    applyCatalog(null)
  }, [applyCatalog])

  return {
    dirInputRef,
    onDirSelect,
    dirName,
    runs,
    catalog,
    experimentRoots,
    trainingRoots,
    allTrainingRoots,
    loadingDir,
    canForget: hasFSA() && dirName !== null,
    openFolder,
    forgetFolder,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
