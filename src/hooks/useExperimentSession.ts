import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ResultCatalog } from '../lib/resultCatalog'
import { readText } from '../lib/resultCatalog'
import type { Episode, Evaluation, Experiment, ExperimentRoot } from '../lib/experimentIndex'
import { loadExperiment, matchingEpisodes } from '../lib/experimentIndex'
import { controlledNodeIndices, extractTrails } from '../lib/trajectory'
import type { Trail } from '../components/canvas/TrajectoryLayer'

export interface OverlayOption {
  policy: string
  episode: Episode
}

export interface TrailEntry {
  trails: Trail[]
  error: string | null
}

/** The controlled nodes' paths in one episode, drawn in that episode's policy colour */
export async function readTrails(
  catalog: ResultCatalog,
  evaluation: Evaluation,
  episode: Episode
): Promise<TrailEntry> {
  if (!evaluation.contract) {
    return {
      trails: [],
      error: 'the eval manifest has no contract, so controlled nodes are unknown',
    }
  }
  if (!episode.files.positions) return { trails: [], error: 'positions.csv is not available' }
  const text = await readText(catalog, episode.files.positions)
  if (text === null) return { trails: [], error: `could not read ${episode.files.positions}` }
  const { nodes } = controlledNodeIndices(evaluation.contract)
  const result = extractTrails(
    text,
    nodes.map((n) => n.index)
  )
  return {
    error: result.error,
    trails: nodes.map((n) => ({
      policy: episode.policy,
      nodeIndex: n.index,
      nodeId: n.nodeId,
      points: result.trails.get(n.index) ?? [],
    })),
  }
}

export function useExperimentSession() {
  const [catalog, setCatalog] = useState<ResultCatalog | null>(null)
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [episode, setEpisode] = useState<Episode | null>(null)
  // Policies whose paths are drawn; the episode's own policy starts on and can be switched off
  const [overlayPolicies, setOverlayPolicies] = useState<string[]>([])
  // One controlled node to follow, or null for all of them
  const [trailNode, setTrailNode] = useState<string | null>(null)
  const [trailsByPolicy, setTrailsByPolicy] = useState<Record<string, TrailEntry>>({})
  const requestRef = useRef(0)

  const openExperiment = useCallback(async (nextCatalog: ResultCatalog, root: ExperimentRoot) => {
    const request = ++requestRef.current
    setLoading(true)
    setError(null)
    setEpisode(null)
    try {
      const loaded = await loadExperiment(nextCatalog, root.root)
      if (request !== requestRef.current) return
      setCatalog(nextCatalog)
      setExperiment(loaded)
    } catch (err) {
      if (request !== requestRef.current) return
      setError(`Could not read this experiment folder: ${err instanceof Error ? err.message : err}`)
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [])

  const closeExperiment = useCallback(() => {
    requestRef.current++
    setCatalog(null)
    setExperiment(null)
    setEpisode(null)
    setLoading(false)
    setError(null)
  }, [])

  const evaluation = useMemo(
    () => experiment?.evaluations.find((e) => e.key === episode?.evaluationKey) ?? null,
    [experiment, episode]
  )

  // Other policies' episodes for the same row, training run and held-out seed
  const overlayOptions = useMemo<OverlayOption[]>(() => {
    if (!evaluation || !episode) return []
    return matchingEpisodes(evaluation, episode.seed)
      .filter((e) => e.policy !== episode.policy && e.files.positions !== null)
      .map((e) => ({ policy: e.policy, episode: e }))
  }, [evaluation, episode])

  // Trail data belongs to one selected episode; drop it when the selection changes
  const episodeRef = useRef<Episode | null>(null)
  const inflightRef = useRef(new Set<string>())
  useEffect(() => {
    episodeRef.current = episode
    inflightRef.current = new Set()
    setOverlayPolicies(episode ? [episode.policy] : [])
    setTrailNode(null)
    setTrailsByPolicy({})
  }, [episode])

  useEffect(() => {
    if (!catalog || !evaluation || !episode) return
    const wanted = [episode, ...overlayOptions.map((o) => o.episode)].filter((e) =>
      overlayPolicies.includes(e.policy)
    )
    for (const target of wanted) {
      if (trailsByPolicy[target.policy] || inflightRef.current.has(target.dir)) continue
      const inflight = inflightRef.current
      inflight.add(target.dir)
      readTrails(catalog, evaluation, target)
        .catch((err): TrailEntry => ({ trails: [], error: String(err) }))
        .then((entry) => {
          inflight.delete(target.dir)
          if (episodeRef.current !== episode) return
          setTrailsByPolicy((prev) => ({ ...prev, [target.policy]: entry }))
        })
    }
  }, [catalog, evaluation, episode, overlayOptions, overlayPolicies, trailsByPolicy])

  const toggleOverlay = useCallback((policy: string) => {
    setOverlayPolicies((prev) =>
      prev.includes(policy) ? prev.filter((p) => p !== policy) : [...prev, policy]
    )
    // Release an overlay's points as soon as it is switched off
    setTrailsByPolicy((prev) => {
      if (!(policy in prev)) return prev
      const next = { ...prev }
      delete next[policy]
      return next
    })
  }, [])

  const trails = useMemo<Trail[]>(() => {
    if (!episode) return []
    return overlayPolicies
      .flatMap((p) => trailsByPolicy[p]?.trails ?? [])
      .filter((t) => trailNode === null || t.nodeId === trailNode)
  }, [episode, overlayPolicies, trailsByPolicy, trailNode])

  const trailErrors = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [policy, entry] of Object.entries(trailsByPolicy)) {
      if (entry.error) out[policy] = entry.error
    }
    return out
  }, [trailsByPolicy])

  return {
    catalog,
    experiment,
    loading,
    error,
    episode,
    evaluation,
    overlayOptions,
    overlayPolicies,
    trails,
    trailErrors,
    openExperiment,
    closeExperiment,
    selectEpisode: setEpisode,
    clearEpisode: useCallback(() => setEpisode(null), []),
    toggleOverlay,
    trailNode,
    setTrailNode,
  }
}
