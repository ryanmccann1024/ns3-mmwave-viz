import { useState, type ReactNode } from 'react'
import type { RunEntry } from '../../lib/assembleRuns'
import type { Scenario } from '../../lib/scenarioGroups'
import { scenarioLabel } from '../../lib/format'
import { policyLabel } from '../../lib/rlLabels'
import { Button, SECONDARY_BUTTON } from '../ui/Button'
import { RunPreviewPanel } from './RunPreviewPanel'
import { ScenarioScene } from './ScenarioScene'
import { MOTION } from '../../styles/motion'

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

// ---------------------------------------------------------------------------
// Large list cards shared by Home and Simulation runs
// ---------------------------------------------------------------------------

/** One row height everywhere, so side-by-side cards line up row for row */
export const LIST_ROW = 'w-full h-16 flex items-center gap-4 px-6 text-left last:rounded-b-2xl'

/** A glass card with a large title, optional right-hand content, and divided rows */
export function ListCard({
  title,
  aside,
  showAll,
  onShowAll,
  children,
}: {
  title: ReactNode
  /** quiet text on the right of the header */
  aside?: ReactNode
  showAll?: boolean
  onShowAll?: () => void
  children: ReactNode
}) {
  return (
    <section className="glass flex flex-col min-w-0">
      <header className="h-20 flex items-center justify-between gap-4 px-6">
        <h2 className="text-xl font-semibold tracking-tight text-ink-title truncate">{title}</h2>
        {aside && <span className="flex-shrink-0 text-base text-ink-2 tabular-nums">{aside}</span>}
        {showAll && onShowAll && (
          <Button variant="secondary" onClick={onShowAll}>
            View all
          </Button>
        )}
      </header>
      <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {children}
      </div>
    </section>
  )
}

/**
 * A folder of cards that folds to a single bar. Children mount on first open (a folded group
 * reads none of its data) and then stay mounted, so both opening and closing animate.
 */
export function GroupSection({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: ReactNode
  /** quiet detail beside the toggle, e.g. a count */
  meta?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [mounted, setMounted] = useState(defaultOpen)
  const toggle = () => {
    setMounted(true)
    setOpen((o) => !o)
  }
  return (
    <section className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
        className={`glass w-full h-20 flex items-center gap-4 px-6 cursor-pointer hover:bg-white/80 ${MOTION.surface}`}
      >
        <span className="flex-1 min-w-0 text-xl font-semibold tracking-tight text-ink-title truncate">
          {title}
        </span>
        {meta && (
          <span className="hidden sm:inline flex-shrink-0 text-base text-ink-2 tabular-nums">
            {meta}
          </span>
        )}
        <span className={`flex-shrink-0 w-[4.5rem] ${SECONDARY_BUTTON}`}>
          {open ? 'Hide' : 'Show'}
        </span>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-slow ease-standard"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          {mounted && (
            <div
              className={`pt-4 pb-1 ${MOTION.fade} ${open ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={!open}
              // inert keeps Tab out of a folded group; React 18's types predate the attribute
              {...({ inert: open ? undefined : '' } as Record<string, string | undefined>)}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function ListEmpty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-8 text-lg text-ink-2">{children}</div>
}

/** Shown on a list page before any outputs folder is open: what to do, and the way to do it */
export function NoFolder({ what, onOpen }: { what: string; onOpen: () => void }) {
  return (
    <div
      className={`glass px-6 py-6 flex items-center justify-between gap-4 flex-wrap ${MOTION.enterFade}`}
    >
      <span className="text-lg text-ink-2">Open your outputs folder to see {what}.</span>
      <Button variant="secondary" onClick={onOpen}>
        Open folder
      </Button>
    </div>
  )
}

function BuildingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      className="flex-shrink-0 text-ink-2"
      role="img"
      aria-label="Has buildings"
    >
      <title>Has buildings</title>
      <path d="M4 21V5l8-2v18M12 21V9l8 3v9M2 21h20M7 8h2M7 12h2M7 16h2M15 14h2M15 17h2" />
    </svg>
  )
}

/** Joined group of seed buttons; `stretch` fills the width with equal buttons */
function SeedButtons({
  scenario,
  title,
  onOpen,
  stretch = false,
}: {
  scenario: Scenario
  title: string
  onOpen: (run: RunEntry) => void
  stretch?: boolean
}) {
  if (scenario.runs.length === 0) {
    return <span className="flex-shrink-0 text-base text-ink-2">No playback</span>
  }
  return (
    <div
      className={`${stretch ? 'w-full' : 'flex-shrink-0'} flex rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-x divide-hairline`}
    >
      {scenario.runs.map((run) => {
        const seed = run.seed.replace(/^seed-/, '')
        return (
          <button
            key={run.key}
            type="button"
            onClick={() => onOpen(run)}
            title={`Play seed ${seed}`}
            aria-label={`Play ${title} seed ${seed}`}
            className={`${stretch ? 'flex-1 h-11' : 'min-w-10 h-10'} px-3 text-sm font-medium tabular-nums text-ink-2 hover:bg-accent-wash hover:text-accent-ink ${MOTION.colors}`}
          >
            {seed}
          </button>
        )
      })}
    </div>
  )
}

/** Name, buildings icon and baseline method for one scenario */
function ScenarioName({ scenario, title }: { scenario: Scenario; title: string }) {
  const method = (scenario.baseline?.manifest ?? scenario.runs[0]?.baseline?.manifest)?.method
  return (
    <div className="flex-1 min-w-0 flex items-center gap-2">
      <span className="text-lg font-medium text-ink truncate" title={scenario.name}>
        {title}
      </span>
      {scenario.buildings && <BuildingsIcon />}
      {method && <span className="flex-shrink-0 text-base text-ink-2">{policyLabel(method)}</span>}
    </div>
  )
}

/** One scenario as a list row: name, then a joined group of seed buttons */
export function ScenarioItem({
  scenario,
  onOpen,
}: {
  scenario: Scenario
  onOpen: (run: RunEntry) => void
}) {
  const { title } = scenarioLabel(scenario.name)
  return (
    <div className={LIST_ROW}>
      <ScenarioName scenario={scenario} title={title} />
      <SeedButtons scenario={scenario} title={title} onOpen={onOpen} />
    </div>
  )
}

/** One scenario as its own card: name on top, full-width seed buttons below */
export function ScenarioCard({
  scenario,
  onOpen,
}: {
  scenario: Scenario
  onOpen: (run: RunEntry) => void
}) {
  const { title } = scenarioLabel(scenario.name)
  return (
    <div className="glass p-6 flex flex-col gap-5 min-w-0">
      <ScenarioScene run={scenario.runs[0]} />
      <ScenarioName scenario={scenario} title={title} />
      <RunPreviewPanel run={scenario.runs[0]} />
      <SeedButtons scenario={scenario} title={title} onOpen={onOpen} stretch />
    </div>
  )
}
