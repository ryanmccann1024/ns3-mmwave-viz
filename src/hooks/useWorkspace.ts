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
import type { BaselineRun } from '../lib/baselineRuns'
import { attachBaselineMeta, discoverBaselineRuns } from '../lib/baselineRuns'

const BASELINE_DISCOVERY_ERROR = 'Baseline run manifests could not be listed'

type BaselineDiscovery = { baselines: BaselineRun[]; error: string | null }

async function discoverBaselines(catalog: ResultCatalog | null): Promise<BaselineDiscovery> {
  if (!catalog) return { baselines: [], error: null }
  try {
    return { baselines: await discoverBaselineRuns(catalog), error: null }
  } catch (err) {
    console.warn('Baseline discovery failed:', err)
    return { baselines: [], error: BASELINE_DISCOVERY_ERROR }
  }
}

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
  const [baselineRuns, setBaselineRuns] = useState<BaselineRun[]>([])
  const [unplayableBaselines, setUnplayableBaselines] = useState<BaselineRun[]>([])
  const [baselineDiscoveryError, setBaselineDiscoveryError] = useState<string | null>(null)
  // Bumped on every source change; async results from an older source are dropped
  const sourceToken = useRef(0)

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

  /**
   * Starts a new source: older async results (and their loading flag) are ignored and
   * baseline state is cleared
   */
  const beginSource = useCallback(() => {
    sourceToken.current += 1
    setLoadingDir(false)
    setBaselineRuns([])
    setUnplayableBaselines([])
    setBaselineDiscoveryError(null)
    return sourceToken.current
  }, [])

  /** Attaches discovered baselines to the playable runs; nonfatal on failure */
  const applyBaselines = useCallback((found: RunEntry[], discovery: BaselineDiscovery) => {
    const attached = attachBaselineMeta(found, discovery.baselines)
    setRuns(attached.runs)
    setBaselineRuns(discovery.baselines)
    setUnplayableBaselines(attached.unplayable)
    setBaselineDiscoveryError(discovery.error)
  }, [])

  const openWithFSA = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      const token = beginSource()
      setLoadingDir(true)
      try {
        const pairs = await walkDirectory(handle)
        const found = assembleRuns(pairs)
        const next = await catalogFromDirectoryHandle(handle).catch(() => null)
        const discovery = await discoverBaselines(next)
        if (token !== sourceToken.current) return
        applyRuns(handle.name, found)
        applyCatalog(next)
        applyBaselines(found, discovery)
        await saveDirectoryHandle(handle)
      } finally {
        if (token === sourceToken.current) setLoadingDir(false)
      }
    },
    [applyRuns, applyCatalog, applyBaselines, beginSource]
  )

  // On mount: try dev-server auto-discovery first, then the cached FSA handle
  useEffect(() => {
    let cancelled = false
    const token = beginSource()
    const stale = () => cancelled || token !== sourceToken.current
    ;(async () => {
      setLoadingDir(true)
      try {
        const devRuns = await fetchRunsFromDevServer()
        const devCatalog = await catalogFromDevServer()
        const discovery = await discoverBaselines(devCatalog)
        if (stale()) return
        const devRoots = devCatalog ? discoverExperiments(devCatalog) : []
        // A folder holding only baseline manifests (e.g. failed runs) is still a result
        if (
          (devRuns && devRuns.length > 0) ||
          devRoots.length > 0 ||
          discovery.baselines.length > 0
        ) {
          applyRuns('outputs', devRuns ?? [])
          applyCatalog(devCatalog)
          applyBaselines(devRuns ?? [], discovery)
          return
        }
        if (!hasFSA()) return
        const handle = await loadDirectoryHandle()
        if (stale() || !handle) return
        try {
          const perm = await handle.requestPermission({ mode: 'read' })
          if (perm === 'granted' && !stale()) await openWithFSA(handle)
        } catch {
          await clearDirectoryHandle()
        }
      } finally {
        if (!stale()) setLoadingDir(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openWithFSA, applyRuns, applyCatalog, applyBaselines, beginSource])

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
      const token = beginSource()
      const found = parseRunsFromFileList(files)
      const next = catalogFromFileList(files)
      // Runs are usable at once; baseline metadata follows when its manifests are read
      applyRuns(files[0].webkitRelativePath.split('/')[0], found)
      applyCatalog(next)
      void discoverBaselines(next).then((discovery) => {
        if (token === sourceToken.current) applyBaselines(found, discovery)
      })
    },
    [applyRuns, applyCatalog, applyBaselines, beginSource]
  )

  const forgetFolder = useCallback(async () => {
    beginSource()
    await clearDirectoryHandle()
    setDirName(null)
    setRuns([])
    applyCatalog(null)
  }, [applyCatalog, beginSource])

  return {
    dirInputRef,
    onDirSelect,
    dirName,
    runs,
    catalog,
    experimentRoots,
    baselineRuns,
    unplayableBaselines,
    baselineDiscoveryError,
    trainingRoots,
    allTrainingRoots,
    loadingDir,
    canForget: hasFSA() && dirName !== null,
    openFolder,
    forgetFolder,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
