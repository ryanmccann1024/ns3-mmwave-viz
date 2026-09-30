import type { ReactNode } from 'react'
import type { RunEntry } from '../../lib/assembleRuns'
import type { BaselineRun } from '../../lib/baselineRuns'
import { unmatchedSeedRecords } from '../../lib/baselineRuns'
import type { ExperimentRoot } from '../../lib/experimentIndex'
import type { Scenario } from '../../lib/scenarioGroups'
import { folderLabel } from '../../lib/format'
import { experimentLabel } from '../../lib/rlLabels'
import { BaselineBadges, BaselineSetupLine, truncateText } from './BaselineInfo'

export { groupRuns, groupScenarios, unplayableForBatch } from '../../lib/scenarioGroups'
export type { Scenario } from '../../lib/scenarioGroups'

export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'good' | 'bad'
}) {
  const cls =
    tone === 'accent'
      ? 'bg-accent-wash text-accent-ink border-accent/20'
      : tone === 'good'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : tone === 'bad'
          ? 'bg-red-500/10 text-red-700 border-red-200'
          : 'bg-white/70 text-muted border-hairline'
  return (
    <span
      className={`text-xs font-medium border rounded-full px-2.5 py-0.5 whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  )
}

const seedNumber = (seed: string) => seed.replace(/^seed-/, '')

const ERROR_MAX = 120

/** The standalone baseline behind a playable scenario, rebuilt from its seeds' metadata if needed */
function playableBaseline(scenario: Scenario): BaselineRun | null {
  if (scenario.baseline) return scenario.baseline
  const first = scenario.runs[0]
  const meta = first?.baseline
  if (!meta) return null
  return {
    runDir: meta.runDir,
    yearMonth: first.yearMonth,
    day: first.day,
    time: first.time,
    manifestPath: `${meta.runDir}/baseline_manifest.json`,
    manifest: meta.manifest,
    manifestError: meta.manifestError,
    planPath: meta.planPath,
  }
}

/** A baseline run that produced no telemetry: status only, nothing to open */
function UnplayableScenarioRow({
  scenario,
  baseline,
  showBatch,
}: {
  scenario: Scenario
  baseline: BaselineRun | undefined
  showBatch?: boolean
}) {
  const manifest = baseline?.manifest ?? null
  const detail = manifest
    ? manifest.error
      ? truncateText(manifest.error, ERROR_MAX)
      : null
    : 'manifest unreadable'
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-ink truncate">{scenario.name}</span>
          <BaselineBadges
            compact
            method={manifest?.method ?? null}
            objective={manifest?.objective ?? null}
            status={manifest?.status ?? null}
            manifestError={manifest ? null : (baseline?.manifestError ?? 'unreadable')}
          />
        </div>
        {showBatch && <div className="text-[11px] text-muted truncate">{scenario.batch}</div>}
        {detail && <div className="text-[11px] text-muted truncate">{detail}</div>}
      </div>
      <span className="text-[11px] text-muted flex-shrink-0">No playable telemetry</span>
    </div>
  )
}

/** One scenario: its name, then one button per seed */
export function ScenarioRow({
  scenario,
  onOpen,
  showBatch,
}: {
  scenario: Scenario
  onOpen: (run: RunEntry) => void
  showBatch?: boolean
}) {
  if (scenario.runs.length === 0) {
    return (
      <UnplayableScenarioRow
        scenario={scenario}
        baseline={scenario.baseline}
        showBatch={showBatch}
      />
    )
  }

  const baseline = scenario.runs[0].baseline ? playableBaseline(scenario) : null
  const manifest = baseline?.manifest ?? null
  const missingSeeds = baseline
    ? unmatchedSeedRecords(
        baseline,
        scenario.runs.map((run) => Number(seedNumber(run.seed))).filter(Number.isFinite)
      )
    : []

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/60 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-ink truncate">{scenario.name}</span>
          {baseline && (
            <BaselineBadges
              compact
              method={manifest?.method ?? null}
              objective={manifest?.objective ?? null}
              status={manifest?.status ?? null}
              manifestError={manifest ? null : (baseline.manifestError ?? 'unreadable')}
            />
          )}
        </div>
        {showBatch && <div className="text-[11px] text-muted truncate">{scenario.batch}</div>}
        {manifest && (
          <BaselineSetupLine
            initialDisplacementMTotal={manifest.initialDisplacementMTotal}
            plannerWallS={manifest.plannerWallS}
            className="text-[11px] text-muted truncate"
          />
        )}
        {missingSeeds.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-1">
            {missingSeeds.map((record) => (
              <Tag key={record.seed}>
                seed {record.seed} ·{' '}
                {record.status === 'complete'
                  ? 'telemetry not found'
                  : record.status === 'unknown'
                    ? (record.rawStatus ?? 'unknown')
                    : record.status}
              </Tag>
            ))}
          </div>
        )}
      </div>
      {scenario.point && <Tag>{scenario.point}</Tag>}
      {scenario.buildings && <Tag tone="good">buildings</Tag>}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[11px] text-muted mr-1">Seed</span>
        {scenario.runs.map((run) => (
          <button
            key={run.key}
            onClick={() => onOpen(run)}
            title={`Play ${scenario.name} ${run.seed}`}
            className="min-w-[1.75rem] h-7 px-1.5 rounded-lg text-xs font-medium tabular-nums bg-white border border-hairline text-ink-2 shadow-control hover:border-accent hover:text-accent-ink transition-colors"
          >
            {seedNumber(run.seed)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** One row in a list of RL experiment folders */
export function ExperimentRow({ root, onOpen }: { root: ExperimentRoot; onOpen: () => void }) {
  const { name, date } = folderLabel(root.root)
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-white/80 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-ink truncate">
          {experimentLabel(name || 'This experiment')}
        </div>
        <div className="text-sm text-muted">
          {date ? `${date} · ` : ''}Compare policies and watch replays
        </div>
      </div>
      <Tag tone="accent">Open →</Tag>
    </button>
  )
}
