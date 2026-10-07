import { useState } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import { folderLabel, groupExperimentRoots, groupProjects } from '../../lib/format'
import { experimentLabel } from '../../lib/rlLabels'
import { ExperimentCard, TrainingCard } from './ExperimentCard'
import { ListEmpty, NoFolder } from './shared'
import { MOTION } from '../../styles/motion'

interface Props {
  workspace: Workspace
  /** opens one experiment's page, by the folder key its scenarios share */
  onOpenGroup: (key: string) => void
  onOpenTrainingRun: (root: string) => void
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  )
}

const CONTROL = `w-full h-11 rounded-xl text-base text-ink bg-white border border-hairline shadow-control focus-visible:border-accent ${MOTION.colors}`

export function ExperimentsPage({ workspace, onOpenGroup, onOpenTrainingRun }: Props) {
  const [query, setQuery] = useState('')

  const projects = groupProjects(
    groupExperimentRoots(workspace.experimentRoots),
    [...workspace.trainingRoots].reverse()
  )

  const q = query.trim().toLowerCase()
  // A project matches on its name, its experiments, their scenarios or its training runs,
  // and then shows all of them
  const shown = q
    ? projects.filter((p) =>
        [
          p.title,
          ...p.experiments.flatMap((e) => [
            e.short,
            ...e.roots.map((r) => `${r.root} ${experimentLabel(folderLabel(r.root).name)}`),
          ]),
          ...p.training.map((t) => `${t.root} ${t.short}`),
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    : projects
  const empty = projects.length === 0

  return (
    <div className="flex flex-col gap-6 sm:gap-8 py-4 sm:py-8">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink-title">
          RL experiments
        </h1>
        {!empty && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <label className="relative flex-1 sm:flex-none sm:w-64">
              <span className="sr-only">Filter experiments</span>
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter"
                className={`${CONTROL} pl-10 pr-4 placeholder:text-ink-2/60`}
              />
            </label>
          </div>
        )}
      </header>

      {!workspace.dirName && !workspace.loadingDir ? (
        <NoFolder what="RL experiments" onOpen={workspace.openFolder} />
      ) : (
        (empty || shown.length === 0) && (
          <div className={`glass ${MOTION.enterFade}`}>
            <ListEmpty>
              {empty ? 'No RL experiments or training runs yet.' : 'Nothing matches that filter.'}
            </ListEmpty>
          </div>
        )
      )}

      {/* Keyed on the filter so a new result set fades in as a whole */}
      <div key={q} className={`flex flex-col gap-10 sm:gap-12 ${MOTION.enterFade}`}>
        {shown.map((p) => (
          <section key={p.key} className="flex flex-col gap-4 sm:gap-5">
            <header className="flex items-baseline justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-ink-title truncate">
                {p.title}
              </h2>
              {p.date && (
                <span className="flex-shrink-0 text-base text-ink-2 tabular-nums">{p.date}</span>
              )}
            </header>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
              {p.experiments.map((e) => (
                <ExperimentCard
                  key={e.key}
                  catalog={workspace.catalog}
                  title={e.short}
                  roots={e.roots}
                  onOpen={() => onOpenGroup(e.key)}
                />
              ))}
              {p.training.map((t) => (
                <TrainingCard
                  key={t.root}
                  catalog={workspace.catalog}
                  root={t.root}
                  title={t.short}
                  onOpen={() => onOpenTrainingRun(t.root)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
