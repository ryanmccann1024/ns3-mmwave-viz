import { useEffect, useState } from 'react'
import type { ResultCatalog } from '../lib/resultCatalog'
import { readText } from '../lib/resultCatalog'
import type { Evaluation } from '../lib/experimentIndex'
import type { StepRecord } from '../lib/episodeTelemetry'
import { parseSteps } from '../lib/episodeTelemetry'
import type { TrainingRun } from '../lib/trainingRun'
import { loadTrainingRun } from '../lib/trainingRun'

type Loaded<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'error'; message: string }

/** A training run folder, read once per (catalog, root) */
export function useTrainingRun(catalog: ResultCatalog | null, root: string | null) {
  const [result, setResult] = useState<Loaded<TrainingRun> | null>(null)
  useEffect(() => {
    if (!catalog || root === null) {
      setResult(null)
      return
    }
    let cancelled = false
    setResult({ state: 'loading' })
    loadTrainingRun(catalog, root)
      .then((value) => !cancelled && setResult({ state: 'ready', value }))
      .catch((err) => !cancelled && setResult({ state: 'error', message: String(err) }))
    return () => {
      cancelled = true
    }
  }, [catalog, root])
  return result
}

export interface EvaluationTelemetry {
  /** per policy, one step list per episode that saved telemetry */
  byPolicy: Record<string, StepRecord[][]>
  actionMeanings: string[]
  missing: number
}

/** Decision telemetry (steps.jsonl) for every completed episode of an evaluation */
export function useEvaluationTelemetry(catalog: ResultCatalog, evaluation: Evaluation) {
  const [result, setResult] = useState<Loaded<EvaluationTelemetry> | null>(null)
  useEffect(() => {
    let cancelled = false
    setResult({ state: 'loading' })
    const episodes = evaluation.episodes.filter((e) => e.status === 'completed')
    Promise.all(
      episodes.map(async (e) => {
        if (!e.files.steps) return null
        const text = await readText(catalog, e.files.steps)
        const parsed = text === null ? null : parseSteps(text)
        return parsed?.ok ? { policy: e.policy, parsed } : null
      })
    )
      .then((all) => {
        if (cancelled) return
        const byPolicy: Record<string, StepRecord[][]> = {}
        let actionMeanings: string[] = []
        let missing = 0
        for (const r of all) {
          if (!r) {
            missing++
            continue
          }
          ;(byPolicy[r.policy] ??= []).push(r.parsed.steps)
          if (!actionMeanings.length)
            actionMeanings = r.parsed.header.contract.action_meanings ?? []
        }
        setResult({ state: 'ready', value: { byPolicy, actionMeanings, missing } })
      })
      .catch((err) => !cancelled && setResult({ state: 'error', message: String(err) }))
    return () => {
      cancelled = true
    }
  }, [catalog, evaluation])
  return result
}
