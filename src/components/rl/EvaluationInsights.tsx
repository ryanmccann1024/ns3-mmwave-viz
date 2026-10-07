import { useMemo } from 'react'
import type { ResultCatalog } from '../../lib/resultCatalog'
import type { Evaluation } from '../../lib/experimentIndex'
import { actionShares, meanComponents, rewardByDecision } from '../../lib/rlStats'
import { useEvaluationTelemetry } from '../../hooks/useRlData'
import { ActionShareChart, RewardByDecisionChart, RewardSourceChart } from '../charts/RlCharts'
import { Note } from '../ExperimentStatus'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {}

/** Behaviour behind the numbers: reward over the episode, actions chosen, reward make-up */
export function EvaluationInsights({
  catalog,
  evaluation,
}: {
  catalog: ResultCatalog
  evaluation: Evaluation
}) {
  const telemetry = useEvaluationTelemetry(catalog, evaluation)

  const { components, sourceRows } = useMemo(() => {
    const schema = rec(evaluation.rewardSchema)
    const components = Array.isArray(schema.components)
      ? (schema.components as unknown[]).filter((c): c is string => typeof c === 'string')
      : []
    const weights = Array.isArray(schema.weights) ? (schema.weights as number[]) : []
    const sourceRows = evaluation.policies.map((policy) => {
      const done = evaluation.episodes.filter(
        (e) => e.policy === policy && e.status === 'completed'
      )
      const means = meanComponents(done.map((e) => e.rewardComponentsSum))
      return {
        policy,
        contributions: Object.fromEntries(
          components.map((c, i) => [c, (means[c] ?? 0) * (weights[i] ?? 1)])
        ),
      }
    })
    return { components, sourceRows }
  }, [evaluation])

  const ready = telemetry?.state === 'ready' ? telemetry.value : null
  const decisionSeries = ready
    ? evaluation.policies
        .filter((p) => ready.byPolicy[p]?.length)
        .map((policy) => ({ policy, points: rewardByDecision(ready.byPolicy[policy]) }))
    : []
  const actionRows = ready
    ? evaluation.policies
        .filter((p) => ready.byPolicy[p]?.length)
        .map((policy) => ({
          policy,
          shares: Object.fromEntries(
            actionShares(ready.byPolicy[policy], ready.actionMeanings).map((a) => [
              a.action,
              a.share,
            ])
          ),
        }))
    : []

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {telemetry?.state === 'loading' && (
        <div className="glass p-6 text-base text-ink-2">Reading decision telemetry…</div>
      )}
      {telemetry?.state === 'error' && <Note tone="warn">{telemetry.message}</Note>}
      {decisionSeries.length > 0 && <RewardByDecisionChart series={decisionSeries} />}
      <div className="flex flex-col gap-4 sm:gap-5">
        {actionRows.length > 0 && ready && (
          <ActionShareChart rows={actionRows} actions={ready.actionMeanings} />
        )}
        {components.length > 0 && <RewardSourceChart rows={sourceRows} components={components} />}
      </div>
      {ready && ready.missing > 0 && (
        <div className="text-base text-ink-2">
          {ready.missing} completed episode{ready.missing === 1 ? '' : 's'} saved no readable
          decision telemetry and {ready.missing === 1 ? 'is' : 'are'} left out of the decision and
          action charts.
        </div>
      )}
    </div>
  )
}
