import Papa from 'papaparse'

// Display rows for the simulator's comparison.json. Nothing here computes statistics:
// every number is passed through exactly as the simulator wrote it.

export const SUPPORTED_COMPARISON_VERSION = 1

export const PAIRED_INTERVAL_SCOPE = 'across held-out evaluation seeds, fixed model'
export const GROUP_INTERVAL_SCOPE = 'across training runs'

export interface RawInterval {
  kind: string
  variability_source?: string
  fixed_model?: boolean
  level: number
  n: number
  df?: number
  t?: number
  half_width?: number
  low: number
  high: number
}

export interface RawExcludedSeed {
  seed: number
  reasons: string[]
}

export interface RawPairedComparison {
  baseline: string
  metric: string
  n_expected: number
  n_used: number
  model_mean: number | null
  baseline_mean: number | null
  mean_difference: number | null
  std_difference: number | null
  zero_variance: boolean
  interval: RawInterval | null
  interval_omitted?: string
  pairs?: { seed: number; model: number; baseline: number; difference: number }[]
  excluded?: RawExcludedSeed[]
}

export interface RawGroupComparison {
  baseline: string
  metric: string
  common_seeds: number[]
  seeds_dropped_for_commonality: number[]
  per_run?: { training_seed: number; eval_dir?: string; mean_difference: number | null }[]
  mean_difference: number | null
  std_across_runs: number | null
  interval: RawInterval | null
  interval_omitted?: string
}

export interface RawHealth {
  mask_violations: number | null
  revalidated_slots: number | null
}

export interface RawComparisonEvaluation {
  label: string | null
  training_seed: number
  held_out: boolean | null
  eval_dir?: string
  health?: Record<string, RawHealth>
  comparisons: RawPairedComparison[]
}

export interface RawExcludedRun {
  training_seed: number | null
  reason: string
}

export interface RawComparisonGroup {
  label: string
  runs_expected: number
  runs_used: number
  excluded_runs: RawExcludedRun[]
  comparisons: RawGroupComparison[]
}

export interface RawMissingEvaluation {
  label: string | null
  training_seed: number | null
  eval_dir?: string
  reason: string
}

export interface RawComparison {
  comparison_version: number
  status: string
  primary_metric: string
  metric_source?: { kind?: string; warmup_excluded?: boolean } | null
  metrics?: Record<
    string,
    { higher_is_better?: boolean; comparable_across_reward_definitions?: boolean }
  >
  missing_evaluations?: RawMissingEvaluation[]
  evaluations?: RawComparisonEvaluation[]
  groups?: RawComparisonGroup[]
}

export type ComparisonCheck =
  | { kind: 'rl'; comparison: RawComparison; message: null }
  | { kind: 'regression' | 'unsupported' | 'invalid'; comparison: null; message: string }

/** Recognise an RL policy comparison by comparison_version, never by filename. */
export function checkComparison(data: unknown): ComparisonCheck {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { kind: 'invalid', comparison: null, message: 'comparison.json is not a JSON object' }
  }
  const record = data as Record<string, unknown>
  if (!('comparison_version' in record)) {
    return {
      kind: 'regression',
      comparison: null,
      message:
        'not an RL policy comparison: comparison.json has no comparison_version ' +
        '(this looks like a regression-check comparison, which this view does not display)',
    }
  }
  if (record.comparison_version !== SUPPORTED_COMPARISON_VERSION) {
    return {
      kind: 'unsupported',
      comparison: null,
      message:
        `unsupported comparison_version ${String(record.comparison_version)} ` +
        `(this viewer supports ${SUPPORTED_COMPARISON_VERSION})`,
    }
  }
  return { kind: 'rl', comparison: record as unknown as RawComparison, message: null }
}

export interface IntervalView {
  low: number
  high: number
  level: number
  n: number
  kind: string
}

export interface PairedRow {
  label: string
  trainingSeed: number
  heldOut: boolean | null
  baseline: string
  metric: string
  isPrimaryMetric: boolean
  /** null when the comparison does not declare a direction for this metric */
  higherIsBetter: boolean | null
  /** false: do not compare this metric between rows with different reward definitions */
  comparable: boolean | null
  modelMean: number | null
  baselineMean: number | null
  meanDifference: number | null
  nUsed: number
  nExpected: number
  /** null means no interval was produced; it is never a zero-width interval */
  interval: IntervalView | null
  intervalOmitted: string | null
  intervalScope: string
  zeroVariance: boolean
  excluded: RawExcludedSeed[]
  health: Record<string, RawHealth>
}

export interface GroupRow {
  label: string
  baseline: string
  metric: string
  isPrimaryMetric: boolean
  higherIsBetter: boolean | null
  comparable: boolean | null
  meanDifference: number | null
  runsUsed: number
  runsExpected: number
  commonSeeds: number[]
  droppedSeeds: number[]
  interval: IntervalView | null
  intervalOmitted: string | null
  intervalScope: string
  excludedRuns: RawExcludedRun[]
}

export interface MissingEvaluationView {
  label: string | null
  trainingSeed: number | null
  reason: string
}

export interface ComparisonView {
  status: string
  /** true only when the simulator marked the comparison complete */
  complete: boolean
  primaryMetric: string
  metricSourceCaveat: string
  missingEvaluations: MissingEvaluationView[]
  pairedRows: PairedRow[]
  groupRows: GroupRow[]
}

function intervalView(interval: RawInterval | null | undefined): IntervalView | null {
  if (!interval) return null
  const { low, high, level, n, kind } = interval
  return { low, high, level, n, kind }
}

function omittedReason(c: { interval: RawInterval | null; interval_omitted?: string }) {
  if (c.interval) return null
  return c.interval_omitted ?? 'no interval recorded'
}

function metricSourceCaveat(source: RawComparison['metric_source']): string {
  const kind = source?.kind ?? 'unknown'
  const warmup =
    source?.warmup_excluded === undefined ? 'not stated' : String(source.warmup_excluded)
  return (
    `Metric source: ${kind} (warmup excluded: ${warmup}). These numbers come from ` +
    'comparison.json; per-episode summary.json statistics may cover a different time window ' +
    'and are shown separately.'
  )
}

export function buildComparisonView(comparison: RawComparison): ComparisonView {
  const metrics = comparison.metrics ?? {}
  const direction = (metric: string) => metrics[metric]?.higher_is_better ?? null
  const comparable = (metric: string) =>
    metrics[metric]?.comparable_across_reward_definitions ?? null

  const pairedRows: PairedRow[] = []
  for (const evaluation of comparison.evaluations ?? []) {
    for (const c of evaluation.comparisons ?? []) {
      pairedRows.push({
        label: evaluation.label ?? 'unlabelled evaluation',
        trainingSeed: evaluation.training_seed,
        heldOut: evaluation.held_out ?? null,
        baseline: c.baseline,
        metric: c.metric,
        isPrimaryMetric: c.metric === comparison.primary_metric,
        higherIsBetter: direction(c.metric),
        comparable: comparable(c.metric),
        modelMean: c.model_mean ?? null,
        baselineMean: c.baseline_mean ?? null,
        meanDifference: c.mean_difference ?? null,
        nUsed: c.n_used,
        nExpected: c.n_expected,
        interval: intervalView(c.interval),
        intervalOmitted: omittedReason(c),
        intervalScope: PAIRED_INTERVAL_SCOPE,
        zeroVariance: c.zero_variance === true,
        excluded: c.excluded ?? [],
        health: evaluation.health ?? {},
      })
    }
  }

  const groupRows: GroupRow[] = []
  for (const group of comparison.groups ?? []) {
    for (const c of group.comparisons ?? []) {
      groupRows.push({
        label: group.label,
        baseline: c.baseline,
        metric: c.metric,
        isPrimaryMetric: c.metric === comparison.primary_metric,
        higherIsBetter: direction(c.metric),
        comparable: comparable(c.metric),
        meanDifference: c.mean_difference ?? null,
        runsUsed: group.runs_used,
        runsExpected: group.runs_expected,
        commonSeeds: c.common_seeds ?? [],
        droppedSeeds: c.seeds_dropped_for_commonality ?? [],
        interval: intervalView(c.interval),
        intervalOmitted: omittedReason(c),
        intervalScope: GROUP_INTERVAL_SCOPE,
        excludedRuns: group.excluded_runs ?? [],
      })
    }
  }

  return {
    status: comparison.status,
    complete: comparison.status === 'complete',
    primaryMetric: comparison.primary_metric,
    metricSourceCaveat: metricSourceCaveat(comparison.metric_source),
    missingEvaluations: (comparison.missing_evaluations ?? []).map((m) => ({
      label: m.label ?? null,
      trainingSeed: m.training_seed ?? null,
      reason: m.reason,
    })),
    pairedRows,
    groupRows,
  }
}

/**
 * Digit-faithful rendering: no rounding. JSON `1.0` parses to the JS number 1, so a
 * trailing `.0` from the file is not preserved ("1.0" in the file shows as "1").
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return String(value)
}

export interface EpisodesTable {
  columns: string[]
  rows: Record<string, string>[]
  errors: string[]
}

/** On-demand parse of comparison/episodes.csv; every cell stays a string. */
export function parseEpisodesCsv(text: string): EpisodesTable {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })
  return {
    columns: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.map((e) => `row ${e.row ?? '?'}: ${e.message}`),
  }
}
