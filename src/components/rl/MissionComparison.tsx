import { useEffect, useState } from 'react'
import { readJson, type ResultCatalog } from '../../lib/resultCatalog'
import type { Evaluation } from '../../lib/experimentIndex'
import {
  ALL_FILTERS,
  comparisonRows,
  historyEvaluations,
  mergedComparisonRows,
  matchesMissionFilters,
  executionMode,
  missionColumns,
  type MissionFilters,
} from '../../lib/missionComparison'
import { Button } from '../ui/Button'
import { PhasePill } from '../ui/PhasePill'
import { Segmented } from '../ui/Segmented'
import { MOTION } from '../../styles/motion'
import { DotPlot, Overview, RankedBars, Scorecard, TradeOff } from './MissionComparisonViews'

const VIEWS = [
  { key: 'bars', label: 'Ranked bars' },
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'dots', label: 'Dot plot' },
  { key: 'tradeoff', label: 'Trade-off' },
  { key: 'overview', label: 'Overview' },
] as const
export type ComparisonView = (typeof VIEWS)[number]['key']

export function MissionComparison({
  catalog,
  root,
  evaluations,
  visible,
  mission,
  filters,
  onFilters,
  onSelect,
  selectedKey,
  view,
  onView,
  metricKey,
  onMetricKey,
}: {
  catalog: ResultCatalog
  root: string
  evaluations: Evaluation[]
  visible: Evaluation[]
  mission: string
  filters: MissionFilters
  onFilters: (f: MissionFilters) => void
  onSelect: (e: Evaluation) => void
  selectedKey?: string
  /** view and ranking metric are held by the page, so they survive a team-size switch */
  view: ComparisonView
  onView: (view: ComparisonView) => void
  metricKey: string
  onMetricKey: (key: string) => void
}) {
  const [history, setHistory] = useState<Evaluation[]>([])
  const [historyError, setHistoryError] = useState('')
  useEffect(() => {
    let current = true
    setHistory([])
    setHistoryError('')
    readJson(catalog, `${root}/phase_comparison.json`)
      .then((data) => {
        if (current) setHistory(historyEvaluations(data))
      })
      .catch((error) => {
        if (current) setHistoryError(String(error))
      })
    return () => {
      current = false
    }
  }, [catalog, root])
  const columns = missionColumns(mission),
    rows = mergedComparisonRows(
      visible,
      history.filter((e) => matchesMissionFilters(e, filters)),
      mission
    )
  const baselinePolicies = new Set(rows.filter((r) => r.policy !== 'model').map((r) => r.policy))
  rows.push(
    ...comparisonRows(evaluations, mission).filter(
      (r) => r.policy !== 'model' && !baselinePolicies.has(r.policy)
    )
  )
  const all = [...evaluations, ...history]
  const phases = [
    ...new Set(all.flatMap((e) => (e.missionTags?.phase == null ? [] : [e.missionTags.phase]))),
  ].sort((a, b) => a - b)
  const controls = [
    {
      key: 'term' as const,
      label: 'Reward term',
      values: [...new Set(all.flatMap((e) => e.missionTags?.terms ?? []))].sort(),
    },
    {
      key: 'mode' as const,
      label: 'Execution',
      values: [...new Set(all.map(executionMode))].sort(),
    },
    {
      key: 'origin' as const,
      label: 'Result origin',
      values: ['New', 'Historical'],
    },
  ]
  const chosen = columns.find((c) => c.key === metricKey) ?? columns[0]
  // the trade-off already puts travel on x, so it never ranks by travel too
  const metric = view === 'tradeoff' && chosen.key === 'travel_m_total' ? columns[0] : chosen
  const viewProps = { rows, columns, metric, onMetric: onMetricKey, onSelect, selectedKey }
  return (
    <section
      className="glass p-6 sm:p-7 flex flex-col gap-5"
      aria-label="Reward comparison across phases"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-ink-title">Reward comparison</h2>
        <Segmented
          options={VIEWS.map((v) => ({ value: v.key, label: v.label }))}
          value={view}
          onChange={onView}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {phases.map((p) => {
          const active = filters.phase === 'All' || filters.phase === String(p)
          return (
            <button
              key={p}
              type="button"
              aria-pressed={filters.phase === String(p)}
              onClick={() =>
                onFilters({ ...filters, phase: filters.phase === String(p) ? 'All' : String(p) })
              }
              className={`rounded-full ${MOTION.fade} ${active ? '' : 'opacity-35 hover:opacity-70'}`}
            >
              <PhasePill phase={p} />
            </button>
          )
        })}
        <span className="w-px h-6 bg-hairline-strong mx-2" />
        {controls.map((c) => (
          <select
            key={c.key}
            aria-label={c.label}
            className="rounded-lg border border-hairline bg-white px-3 py-1.5 text-sm text-ink"
            value={filters[c.key]}
            onChange={(event) => onFilters({ ...filters, [c.key]: event.target.value })}
          >
            <option value="All">
              {c.label === 'Result origin' ? 'New and historical' : `Any ${c.label.toLowerCase()}`}
            </option>
            {c.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ))}
        {(Object.keys(filters) as (keyof MissionFilters)[]).some((k) => filters[k] !== 'All') && (
          <Button variant="ghost" onClick={() => onFilters(ALL_FILTERS)}>
            Clear
          </Button>
        )}
      </div>
      {(view === 'bars' || view === 'dots' || view === 'tradeoff') && (
        <Segmented
          options={columns
            .filter((c) => view !== 'tradeoff' || c.key !== 'travel_m_total')
            .map((c) => ({ value: c.key, label: c.label }))}
          value={metric.key}
          onChange={onMetricKey}
        />
      )}
      <div key={view} className={MOTION.enterFade}>
        {view === 'bars' && <RankedBars {...viewProps} />}
        {view === 'scorecard' && <Scorecard {...viewProps} />}
        {view === 'dots' && <DotPlot {...viewProps} />}
        {view === 'tradeoff' && <TradeOff {...viewProps} />}
        {view === 'overview' && <Overview {...viewProps} />}
      </div>
      {historyError && (
        <p className="text-sm text-ink-2">
          Earlier-phase summary could not be read: {historyError}
        </p>
      )}
      {!rows.length && (
        <p className="text-base text-ink-2">No completed results match these filters.</p>
      )}
    </section>
  )
}
