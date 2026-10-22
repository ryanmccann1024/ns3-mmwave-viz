import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { missionScenarios, isMissionInternal } from '../lib/missionCampaignIndex'
import type { BaselineRun } from '../lib/baselineRuns'
import { attachBaselineMeta, discoverBaselineRuns } from '../lib/baselineRuns'
import {
  filterCatalog,
  folderTree,
  isFolderIncluded,
  loadIncluded,
  saveIncluded,
} from '../lib/folderFilter'

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
  const sourceRef = useRef<
    | { kind: 'dev' }
    | { kind: 'handle'; handle: FileSystemDirectoryHandle }
    | { kind: 'files' }
    | null
  >(null)
  // Everything in the open folder; the pages see only the chosen subfolders (below)
  const [allRuns, setRuns] = useState<RunEntry[]>([])
  const [dirName, setDirName] = useState<string | null>(null)
  const [loadingDir, setLoadingDir] = useState(false)
  const [fullCatalog, setCatalog] = useState<ResultCatalog | null>(null)
  const [allBaselineRuns, setBaselineRuns] = useState<BaselineRun[]>([])
  const [allUnplayable, setUnplayableBaselines] = useState<BaselineRun[]>([])
  /** Chosen subfolders of the open folder; none until the first choice is made */
  const [includedFolders, setIncluded] = useState<string[]>([])
  const [baselineDiscoveryError, setBaselineDiscoveryError] = useState<string | null>(null)
  // Bumped on every source change; async results from an older source are dropped
  const sourceToken = useRef(0)

  const applyCatalog = useCallback((next: ResultCatalog | null) => setCatalog(next), [])

  const applyRuns = useCallback((name: string, found: RunEntry[]) => {
    setDirName(name)
    setRuns(found)
    setIncluded(loadIncluded(name) ?? [])
  }, [])

  const folders = useMemo(() => (fullCatalog ? folderTree(fullCatalog.paths()) : []), [fullCatalog])

  const setIncludedFolders = useCallback(
    (next: string[]) => {
      setIncluded(next)
      if (dirName !== null) saveIncluded(dirName, next)
    },
    [dirName]
  )

  const catalog = useMemo(
    () => (fullCatalog ? filterCatalog(fullCatalog, includedFolders) : null),
    [fullCatalog, includedFolders]
  )
  const runs = useMemo(
    () => allRuns.filter((r) => isFolderIncluded(r.runDir, includedFolders)),
    [allRuns, includedFolders]
  )
  const baselineRuns = useMemo(
    () => allBaselineRuns.filter((b) => isFolderIncluded(b.runDir, includedFolders)),
    [allBaselineRuns, includedFolders]
  )
  const unplayableBaselines = useMemo(
    () => allUnplayable.filter((b) => isFolderIncluded(b.runDir, includedFolders)),
    [allUnplayable, includedFolders]
  )

  // Experiment folders are indexed from path names only; no file is read here
  const experimentRoots = useMemo<ExperimentRoot[]>(
    () => (catalog ? discoverExperiments(catalog) : []),
    [catalog]
  )
  // Every training run, shown or not, so an experiment can still link to its training
  const allTrainingRoots = useMemo(
    () => (fullCatalog ? discoverTrainingRuns(fullCatalog) : []),
    [fullCatalog]
  )
  const trainingRoots = useMemo(() => {
    if (!catalog) return []
    // Training inside an experiment plan is reached through that experiment
    const plans = experimentRoots
      .filter((r) => r.kind === 'plan' || r.kind === 'campaign')
      .map((r) => r.root)
    const missions = missionScenarios(catalog.paths())
    return discoverTrainingRuns(catalog).filter(
      (t) =>
        !isMissionInternal(t, missions) &&
        !plans.some((p) => p === '' || t === p || t.startsWith(p + '/'))
    )
  }, [catalog, experimentRoots])

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
        sourceRef.current = { kind: 'handle', handle }
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
          sourceRef.current = { kind: 'dev' }
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
      sourceRef.current = { kind: 'files' }
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

  const refresh = useCallback(async () => {
    const source = sourceRef.current
    if (source?.kind === 'handle') {
      await openWithFSA(source.handle)
      return
    }
    if (source?.kind !== 'dev') {
      await openFolder()
      return
    }
    const token = beginSource()
    setLoadingDir(true)
    try {
      const [found, next] = await Promise.all([fetchRunsFromDevServer(), catalogFromDevServer()])
      const discovery = await discoverBaselines(next)
      if (token !== sourceToken.current) return
      applyRuns('outputs', found ?? [])
      applyCatalog(next)
      applyBaselines(found ?? [], discovery)
    } finally {
      if (token === sourceToken.current) setLoadingDir(false)
    }
  }, [openWithFSA, openFolder, beginSource, applyRuns, applyCatalog, applyBaselines])

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
    /** The unfiltered catalog, for reading an opened experiment's cross-folder references */
    fullCatalog,
    folders,
    includedFolders,
    setIncludedFolders,
    experimentRoots,
    baselineRuns,
    unplayableBaselines,
    baselineDiscoveryError,
    trainingRoots,
    allTrainingRoots,
    loadingDir,
    canForget: hasFSA() && dirName !== null,
    openFolder,
    refresh,
    forgetFolder,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
