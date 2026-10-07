import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import type { ExperimentRoot } from '../../lib/experimentIndex'
import { folderLabel, runTimeLabel } from '../../lib/format'
import { PageHeader } from '../ui/PageHeader'
import { Tag } from './shared'
import { experimentLabel } from '../../lib/rlLabels'
import { Button } from '../ui/Button'
import { MOTION } from '../../styles/motion'

interface Props {
  workspace: Workspace
  onHome: () => void
  onOpenExperiment: (root: ExperimentRoot) => void
  onOpenTrainingRun: (root: string) => void
}

function Card({
  title,
  tag,
  eyebrow,
  summary,
  foot,
  onClick,
}: {
  title: string
  tag: ReactNode
  eyebrow: string
  summary: string
  foot?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`glass p-5 text-left flex flex-col gap-4 hover:bg-white/85 hover:border-accent/30 ${MOTION.surface} min-h-44`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-accent-ink">{eyebrow}</div>
          <div className="text-lg font-semibold text-ink-title leading-snug mt-1">{title}</div>
        </div>
        {tag}
      </div>
      <div className="text-base text-ink-2 leading-relaxed">{summary}</div>
      <div className="border-t border-ink/[0.06] pt-3 text-sm text-muted mt-auto">
        {foot ?? 'Open experiment →'}
      </div>
    </button>
  )
}

function SectionHead({ title, count, hint }: { title: string; count: number; hint: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-ink/[0.08] pb-2">
      <h2 className="text-base font-semibold text-ink-title">{title}</h2>
      <span className="text-sm text-muted tabular-nums">{count}</span>
      <span className="text-sm text-muted ml-2 hidden md:inline">{hint}</span>
    </div>
  )
}

export function ExperimentsPage({ workspace, onHome, onOpenExperiment, onOpenTrainingRun }: Props) {
  const [showTraining, setShowTraining] = useState(false)
  const [showAllTraining, setShowAllTraining] = useState(false)
  const roots = [...workspace.experimentRoots].reverse()
  const training = [...workspace.trainingRoots].reverse()
  const [planLabels, setPlanLabels] = useState<
    Record<
      string,
      {
        name: string
        rows: string[]
        scenes: string[]
        input: string
        ready: number
        planned: number
      }
    >
  >({})
  useEffect(() => {
    let cancelled = false
    const catalog = workspace.catalog
    if (!catalog) {
      setPlanLabels({})
      return
    }
    Promise.all(
      workspace.experimentRoots
        .filter((root) => root.kind === 'plan')
        .map(async (root) => {
          const file = await catalog.getFile(
            `${root.root ? `${root.root}/` : ''}experiment_plan.json`
          )
          if (!file) return null
          try {
            const plan = JSON.parse(await file.text()) as {
              matrix?: { name?: string; path?: string }
              rows?: { name?: string; run_config?: string }[]
              evaluations?: { label?: string; training_seed?: number }[]
            }
            const rows = plan.rows ?? []
            const expected = plan.evaluations ?? []
            const ready = expected.filter(
              (item) =>
                item.label &&
                item.training_seed !== undefined &&
                catalog.has(
                  `${root.root}/eval/${item.label}/train-seed-${item.training_seed}/eval_manifest.json`
                )
            ).length
            return [
              root.root,
              {
                name: plan.matrix?.name ?? '',
                rows: rows.map((row) => row.name ?? '').filter(Boolean),
                scenes: Array.from(
                  new Set(rows.map((row) => row.run_config ?? '').filter(Boolean))
                ),
                input: plan.matrix?.path ?? 'Input matrix not recorded',
                ready,
                planned: expected.length,
              },
            ] as const
          } catch {
            return null
          }
        })
    ).then((entries) => {
      if (!cancelled) setPlanLabels(Object.fromEntries(entries.filter((entry) => entry !== null)))
    })
    return () => {
      cancelled = true
    }
  }, [workspace.catalog, workspace.experimentRoots])
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        parents={[{ label: 'Home', onClick: onHome }]}
        title="RL experiments"
        subtitle="Choose an experiment to compare rewards and policies, inspect learning, and play its episodes."
      />

      <div className="flex flex-col gap-3">
        <SectionHead
          title="Experiments"
          count={roots.length}
          hint="Each contains training, evaluation, and 3D replays"
        />
        {roots.length === 0 && (
          <div className="text-sm text-muted">No evaluations in this folder.</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roots.map((root) => {
            const { name } = folderLabel(root.root)
            const plan = planLabels[root.root]
            return (
              <Card
                key={root.root}
                title={experimentLabel(plan?.name || name || 'This experiment')}
                eyebrow={`${plan?.ready ?? '?'} of ${plan?.planned ?? '?'} comparisons ready`}
                tag={
                  <Tag tone={plan && plan.ready === plan.planned ? 'good' : 'accent'}>
                    {plan && plan.ready === plan.planned ? 'Ready' : 'In progress'}
                  </Tag>
                }
                summary={
                  plan
                    ? `${plan.rows.length} variant${plan.rows.length === 1 ? '' : 's'} · ${plan.scenes.length || 1} scene${plan.scenes.length === 1 ? '' : 's'}`
                    : 'Open results and saved episodes'
                }
                foot="Compare policies · Inspect learning · Watch in 3D →"
                onClick={() => onOpenExperiment(root)}
              />
            )
          })}
        </div>
      </div>

      {training.length > 0 && (
        <div className="glass p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-ink-title">Individual training runs</h2>
              <p className="text-sm text-ink-2 mt-1">
                Optional: inspect the model’s practice episodes and weight updates. For
                model-versus-hold comparisons, open an experiment above.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setShowTraining((value) => !value)}>
              {showTraining ? 'Hide training runs' : `Show ${training.length} training runs`}
            </Button>
          </div>
          {showTraining && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(showAllTraining ? training : training.slice(0, 6)).map((root) => {
                const time = runTimeLabel(root)
                const { name } = folderLabel(root)
                return (
                  <Card
                    key={root}
                    title={name || 'Training run'}
                    eyebrow={time ?? 'Model practice'}
                    tag={<Tag tone="good">Training</Tag>}
                    summary="Learning curve and practice episodes"
                    foot="Inspect training →"
                    onClick={() => onOpenTrainingRun(root)}
                  />
                )
              })}
            </div>
          )}
          {showTraining && training.length > 6 && (
            <Button variant="link" onClick={() => setShowAllTraining((value) => !value)}>
              {showAllTraining ? 'Show first 6 runs' : `Show all ${training.length} runs`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
