import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ResultCatalog } from '../lib/resultCatalog'
import { readText } from '../lib/resultCatalog'
import type { Experiment } from '../lib/experimentIndex'
import type { EpisodesTable, GroupRow, IntervalView, PairedRow } from '../lib/comparisonView'
import { buildComparisonView, formatNumber, parseEpisodesCsv } from '../lib/comparisonView'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'
import { Note, Section } from './ExperimentStatus'

const NOT_COMPARABLE = 'not comparable across rows with different reward definitions'

function primaryFirst<T extends { isPrimaryMetric: boolean }>(rows: T[]): T[] {
  return [...rows.filter((r) => r.isPrimaryMetric), ...rows.filter((r) => !r.isPrimaryMetric)]
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const row of rows) map.set(keyOf(row), [...(map.get(keyOf(row)) ?? []), row])
  return [...map.entries()]
}

function directionLabel(higherIsBetter: boolean | null) {
  if (higherIsBetter === null) return 'direction not declared'
  return higherIsBetter ? 'higher is better' : 'lower is better'
}

function MetricCell({
  row,
}: {
  row: { metric: string; isPrimaryMetric: boolean; comparable: boolean | null }
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-ink">{row.metric}</span>
        {row.isPrimaryMetric && (
          <Badge
            label="primary"
            colorClass="bg-accent-wash text-accent-ink border border-accent/20"
          />
        )}
      </div>
      {row.comparable === false && <span className="text-amber-700">{NOT_COMPARABLE}</span>}
    </div>
  )
}

function IntervalCell({
  interval,
  omitted,
}: {
  interval: IntervalView | null
  omitted: string | null
}) {
  if (!interval) {
    return (
      <div className="text-amber-700">
        not available
        <div className="text-muted">{omitted ?? 'no reason recorded'}</div>
      </div>
    )
  }
  return (
    <div>
      <span className="text-ink">
        [{formatNumber(interval.low)}, {formatNumber(interval.high)}]
      </span>
      <div className="text-muted">
        level {formatNumber(interval.level)} · n {formatNumber(interval.n)}
      </div>
    </div>
  )
}

const TH = 'font-normal text-left text-muted pr-4 py-1 align-bottom whitespace-nowrap'
const TD = 'pr-4 py-1.5 align-top'

function TableShell({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function PairedTable({ rows }: { rows: PairedRow[] }) {
  const first = rows[0]
  const health = Object.entries(first.health)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-ink font-semibold">{first.label || 'unlabelled evaluation'}</span>
        <span className="text-muted">training seed {first.trainingSeed}</span>
        {first.heldOut === true && (
          <Badge
            label="held-out seeds"
            colorClass="bg-emerald-100 text-emerald-800 border border-emerald-200"
          />
        )}
        {first.heldOut === false && (
          <Badge
            label="not held-out"
            colorClass="bg-amber-100 text-amber-800 border border-amber-200"
          />
        )}
      </div>
      <TableShell
        head={[
          'baseline',
          'metric',
          'direction',
          'model mean',
          'baseline mean',
          'model − baseline',
          `interval (${first.intervalScope})`,
          'n used / expected',
          'notes',
        ]}
      >
        {primaryFirst(rows).map((r) => (
          <tr key={`${r.baseline}-${r.metric}`} className="border-t border-ink/[0.06]">
            <td className={TD}>{r.baseline}</td>
            <td className={TD}>
              <MetricCell row={r} />
            </td>
            <td className={`${TD} text-muted`}>{directionLabel(r.higherIsBetter)}</td>
            <td className={TD}>{formatNumber(r.modelMean)}</td>
            <td className={TD}>{formatNumber(r.baselineMean)}</td>
            <td className={`${TD} text-ink font-semibold`}>{formatNumber(r.meanDifference)}</td>
            <td className={TD}>
              <IntervalCell interval={r.interval} omitted={r.intervalOmitted} />
            </td>
            <td className={TD}>
              {formatNumber(r.nUsed)} / {formatNumber(r.nExpected)}
            </td>
            <td className={`${TD} text-muted`}>
              {r.zeroVariance && <div>zero variance across seeds</div>}
              {r.excluded.map((e) => (
                <div key={e.seed} className="text-amber-700">
                  seed {e.seed} excluded: {e.reasons.join('; ')}
                </div>
              ))}
            </td>
          </tr>
        ))}
      </TableShell>
      {health.length > 0 && (
        <div className="text-xs text-muted flex flex-wrap gap-x-4">
          <span className="text-muted">health</span>
          {health.map(([policy, h]) => (
            <span key={policy}>
              {policy}: mask violations {formatNumber(h.mask_violations)}, revalidated slots{' '}
              {formatNumber(h.revalidated_slots)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupTable({ rows }: { rows: GroupRow[] }) {
  const first = rows[0]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-ink font-semibold">{first.label}</span>
        <span className="text-muted">
          training runs used {formatNumber(first.runsUsed)} / expected{' '}
          {formatNumber(first.runsExpected)}
        </span>
      </div>
      {first.excludedRuns.map((r, i) => (
        <Note key={i} tone="warn">
          training seed {r.training_seed ?? 'unknown'} excluded: {r.reason}
        </Note>
      ))}
      <TableShell
        head={[
          'baseline',
          'metric',
          'direction',
          'model − baseline',
          `interval (${first.intervalScope})`,
          'common seeds',
          'dropped seeds',
        ]}
      >
        {primaryFirst(rows).map((r) => (
          <tr key={`${r.baseline}-${r.metric}`} className="border-t border-ink/[0.06]">
            <td className={TD}>{r.baseline}</td>
            <td className={TD}>
              <MetricCell row={r} />
            </td>
            <td className={`${TD} text-muted`}>{directionLabel(r.higherIsBetter)}</td>
            <td className={`${TD} text-ink font-semibold`}>{formatNumber(r.meanDifference)}</td>
            <td className={TD}>
              <IntervalCell interval={r.interval} omitted={r.intervalOmitted} />
            </td>
            <td className={TD}>{r.commonSeeds.join(', ') || 'none'}</td>
            <td className={`${TD} ${r.droppedSeeds.length ? 'text-amber-700' : 'text-muted'}`}>
              {r.droppedSeeds.join(', ') || 'none'}
            </td>
          </tr>
        ))}
      </TableShell>
    </div>
  )
}

function ComparisonVisual({
  paired,
  groups,
  metric,
}: {
  paired: PairedRow[]
  groups: GroupRow[]
  metric: string
}) {
  const primary = paired.filter((row) => row.isPrimaryMetric)
  const grouped = groups.filter((row) => row.isPrimaryMetric)
  const trainingRuns = groupBy(primary, (row) => `${row.label}#${row.trainingSeed}`)
  const ratio = metric.endsWith('_ratio') || metric.endsWith('_fraction')
  const visualValue = (value: number | null) =>
    value === null ? 'n/a' : ratio ? `${(value * 100).toFixed(1)}%` : value.toFixed(3)
  const visualDelta = (value: number | null) =>
    value === null
      ? 'n/a'
      : ratio
        ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)} pp`
        : `${value >= 0 ? '+' : ''}${value.toFixed(3)}`
  const bar = (value: number | null, scale: number, color: string) => (
    <div className="h-2 rounded-full bg-white/80 overflow-hidden flex-1">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, (100 * (value ?? 0)) / scale))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted">
        The main physical question is {metric.replace(/_/g, ' ')}. Each card compares the same seeds
        under a fixed trained model and a baseline. Other metrics and exclusions remain in Tables.
      </div>
      {grouped.length > 0 && (
        <div className="tile p-4">
          <div className="font-semibold text-ink text-sm mb-2">
            Across independently trained models
          </div>
          {grouped.map((row) => (
            <div
              key={`${row.label}-${row.baseline}`}
              className="text-xs border-t border-ink/[0.06] py-2"
            >
              <span className="font-medium text-ink">
                {row.label} vs {row.baseline}
              </span>
              {' · '}
              <span className="tabular-nums">{visualDelta(row.meanDifference)}</span>
              {' · '}
              <span className="text-muted">
                {row.runsUsed} training run{row.runsUsed === 1 ? '' : 's'};{' '}
                {row.interval
                  ? `95% interval ${visualDelta(row.interval.low)} to ${visualDelta(row.interval.high)}${row.interval.low <= 0 && row.interval.high >= 0 ? ' includes zero' : ''}`
                  : (row.intervalOmitted ?? 'no interval')}
              </span>
            </div>
          ))}
        </div>
      )}
      <details className="tile p-4" open={trainingRuns.length <= 2}>
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Per-trained-model comparisons ({trainingRuns.length})
        </summary>
        <div className="flex flex-col gap-3 mt-3">
          {trainingRuns.map(([key, rows]) => (
            <div key={key} className="tile p-4">
              <div className="font-semibold text-ink text-sm mb-2">
                {rows[0].label} · trained with seed {rows[0].trainingSeed}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {rows.map((row) => {
                  const scale = ratio ? 1 : Math.max(1, row.modelMean ?? 0, row.baselineMean ?? 0)
                  const delta = row.meanDifference
                  const crosses = row.interval && row.interval.low <= 0 && row.interval.high >= 0
                  const favorable =
                    delta !== null && (row.higherIsBetter === false ? delta < 0 : delta >= 0)
                  return (
                    <div key={row.baseline} className="bg-white/60 rounded-lg p-3">
                      <div className="text-xs font-semibold text-ink mb-2">
                        PPO vs {row.baseline}
                      </div>
                      <div className="flex items-center gap-2 text-xs mb-1">
                        <span className="w-16">PPO</span>
                        {bar(row.modelMean, scale, '#3566c6')}
                        <span className="w-14 text-right tabular-nums">
                          {visualValue(row.modelMean)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-16">{row.baseline}</span>
                        {bar(row.baselineMean, scale, '#8191a9')}
                        <span className="w-14 text-right tabular-nums">
                          {visualValue(row.baselineMean)}
                        </span>
                      </div>
                      <div
                        className={`text-sm font-semibold mt-2 ${favorable ? 'text-emerald-800' : 'text-rose-700'}`}
                      >
                        {delta === null
                          ? 'Difference unavailable'
                          : `${visualDelta(delta)} PPO − ${row.baseline}`}
                      </div>
                      <div className="text-[11px] text-muted">
                        {row.nUsed}/{row.nExpected} paired seeds ·{' '}
                        {row.interval
                          ? `95% interval ${visualDelta(row.interval.low)} to ${visualDelta(row.interval.high)}${crosses ? ' (includes zero)' : ''}`
                          : (row.intervalOmitted ?? 'no interval')}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function EpisodesCsv({ catalog, path }: { catalog: ResultCatalog; path: string }) {
  const [table, setTable] = useState<EpisodesTable | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function toggle() {
    setOpen((o) => !o)
    if (table || open) return
    try {
      const text = await readText(catalog, path)
      if (text === null) setMessage(`${path} is not in the selected folder`)
      else setTable(parseEpisodesCsv(text))
    } catch (err) {
      setMessage(`could not read ${path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button onClick={toggle}>{open ? 'Hide' : 'Show'} per-episode table (episodes.csv)</Button>
      </div>
      {open && message && <Note tone="warn">{message}</Note>}
      {open && table && (
        <>
          <div className="text-xs text-muted break-all">source: {path}</div>
          {table.errors.map((e) => (
            <Note key={e} tone="warn">
              {e}
            </Note>
          ))}
          <div className="overflow-auto max-h-80 border border-ink/[0.06] rounded">
            <table className="text-[11px] whitespace-nowrap">
              <thead className="sticky top-0 bg-white/90 backdrop-blur">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="font-normal text-left text-muted px-2 py-1">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-ink/[0.06]">
                    {table.columns.map((c) => (
                      <td key={c} className="px-2 py-1 text-ink-2 max-w-[16rem] truncate">
                        <span title={row[c]}>{row[c]}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

interface Props {
  catalog: ResultCatalog
  experiment: Experiment
}

export function ComparisonSection({ catalog, experiment }: Props) {
  const [mode, setMode] = useState<'visual' | 'tables'>('visual')
  const view = useMemo(
    () => (experiment.comparison ? buildComparisonView(experiment.comparison) : null),
    [experiment.comparison]
  )
  const report = experiment.artifacts.find((a) => a.artifact === 'comparison')

  if (!view) {
    return (
      <Section title="Comparison">
        {report?.message ? (
          <Note tone="warn">{report.message}. Episodes below remain usable.</Note>
        ) : (
          <Note>
            No comparison.json in this folder. The comparison is produced by the simulator&apos;s
            compare command; episodes below remain usable.
          </Note>
        )}
      </Section>
    )
  }

  const episodesPath = experiment.comparisonPath
    ? experiment.comparisonPath.replace(/comparison\.json$/, 'episodes.csv')
    : null

  return (
    <Section
      title="Comparison (model vs baselines)"
      aside={
        view.complete ? (
          <Badge
            label="complete"
            colorClass="bg-emerald-100 text-emerald-800 border border-emerald-200"
          />
        ) : (
          <Badge
            label={`${view.status} — not a complete result`}
            colorClass="bg-amber-100 text-amber-900 border border-amber-300"
          />
        )
      }
    >
      <div className="text-xs text-ink-2">
        primary metric: <span className="text-ink font-semibold">{view.primaryMetric}</span>
      </div>
      <Note>
        {view.metricSourceCaveat}
        <div className="mt-1 break-all">source file: {experiment.comparisonPath}</div>
        <div className="mt-1">
          Episode summary.json statistics are a separate source and may cover a different time
          window. The tables retain the comparison file's original numbers; visual cards round for
          readability.
        </div>
      </Note>

      {view.missingEvaluations.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-amber-800 font-semibold">Missing evaluations</div>
          {view.missingEvaluations.map((m, i) => (
            <Note key={i} tone="warn">
              {m.label ?? 'unknown row'} / training seed {m.trainingSeed ?? 'unknown'}: {m.reason}
            </Note>
          ))}
        </div>
      )}

      <Segmented
        options={[
          { value: 'visual', label: 'Visual summary' },
          { value: 'tables', label: 'All metrics tables' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'visual' && (
        <ComparisonVisual
          paired={view.pairedRows}
          groups={view.groupRows}
          metric={view.primaryMetric}
        />
      )}

      {mode === 'tables' && view.pairedRows.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="text-[13px] font-semibold text-ink-title">Per evaluation (paired)</div>
          {groupBy(view.pairedRows, (r) => `${r.label}#${r.trainingSeed}`).map(([key, rows]) => (
            <PairedTable key={key} rows={rows} />
          ))}
        </div>
      )}

      {mode === 'tables' && view.groupRows.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="text-[13px] font-semibold text-ink-title">
            Per row, across training runs
          </div>
          {groupBy(view.groupRows, (r) => r.label).map(([key, rows]) => (
            <GroupTable key={key} rows={rows} />
          ))}
        </div>
      )}

      {mode === 'tables' && episodesPath && <EpisodesCsv catalog={catalog} path={episodesPath} />}
    </Section>
  )
}
