import { useState } from 'react'
import type { Episode, Evaluation } from '../../lib/experimentIndex'
import { policyLabel, rewardLabel } from '../../lib/rlLabels'
import { Button } from '../ui/Button'

interface Props {
  evaluations: Evaluation[]
  current?: Episode | null
  onOpen: (episode: Episode) => void
  opening?: Episode | null
  compact?: boolean
  preferredEvaluationKey?: string
}

const SELECT =
  'w-full rounded-xl border border-hairline bg-white/85 px-3 py-2 text-base text-ink focus:outline-none focus:border-accent'

/** Pick one actual saved replay; variant, policy and test seed are separate choices. */
export function ReplayPicker({
  evaluations,
  current,
  onOpen,
  opening,
  compact = false,
  preferredEvaluationKey,
}: Props) {
  const ready = evaluations.filter((evaluation) =>
    evaluation.episodes.some((episode) => episode.playable)
  )
  const [expanded, setExpanded] = useState(!compact)
  const [chosenEvaluation, setChosenEvaluation] = useState(
    current?.evaluationKey ?? preferredEvaluationKey ?? ready[0]?.key ?? ''
  )
  const [chosenPolicy, setChosenPolicy] = useState(current?.policy ?? 'model')
  const [chosenSeed, setChosenSeed] = useState(current?.seed ?? 301)
  const evaluation = ready.find((item) => item.key === chosenEvaluation) ?? ready[0]
  if (!evaluation) return null

  const playable = evaluation.episodes.filter((episode) => episode.playable)
  const policies = [...new Set(playable.map((episode) => episode.policy))]
  const policy = policies.includes(chosenPolicy) ? chosenPolicy : policies[0]
  const seeds = [
    ...new Set(
      playable.filter((episode) => episode.policy === policy).map((episode) => episode.seed)
    ),
  ].sort((a, b) => a - b)
  const seed = seeds.includes(chosenSeed) ? chosenSeed : seeds[0]
  const target = playable.find((episode) => episode.policy === policy && episode.seed === seed)
  const isCurrent = current?.dir === target?.dir

  return (
    <section
      className={`${compact ? 'rounded-xl border border-hairline bg-white/75 p-4' : 'glass p-5'} flex flex-col gap-3`}
      aria-label="Choose a replay"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink-title">Replay</h2>
        {compact ? (
          <Button variant="secondary" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Done' : 'Change replay'}
          </Button>
        ) : (
          <span className="text-sm text-muted">
            These are evaluation episodes, not training episodes.
          </span>
        )}
      </div>
      {compact && current && (
        <div className="text-sm text-ink-2 leading-relaxed">
          <strong className="text-ink">
            {rewardLabel(ready.find((item) => item.key === current.evaluationKey) ?? evaluation)}
          </strong>
          {' · '}
          {policyLabel(current.policy)}
          {' · '}evaluation seed {current.seed}
        </div>
      )}
      {expanded && (
        <div
          className={
            compact
              ? 'grid grid-cols-2 gap-3 items-end'
              : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,.8fr)_auto] gap-3 items-end'
          }
        >
          <label
            className={`flex flex-col gap-1.5 text-sm font-medium text-ink-2 ${compact ? 'col-span-2' : ''}`}
          >
            Reward variant
            <select
              className={SELECT}
              value={evaluation.key}
              onChange={(event) => setChosenEvaluation(event.target.value)}
            >
              {ready.map((item) => (
                <option key={item.key} value={item.key}>
                  {rewardLabel(item)} · trained seed {item.trainingSeed ?? 'none'}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
            Policy being replayed
            <select
              className={SELECT}
              value={policy}
              onChange={(event) => setChosenPolicy(event.target.value)}
            >
              {policies.map((item) => (
                <option key={item} value={item}>
                  {policyLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-2">
            Evaluation seed
            <select
              className={SELECT}
              value={seed}
              onChange={(event) => setChosenSeed(Number(event.target.value))}
            >
              {seeds.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            className={compact ? 'col-span-2 w-full' : ''}
            disabled={!target || isCurrent || (opening !== null && opening !== undefined)}
            onClick={() => target && onOpen(target)}
          >
            {opening ? 'Opening…' : isCurrent ? 'Viewing now' : 'Watch in 3D'}
          </Button>
        </div>
      )}
      {!compact && (
        <p className="text-sm text-muted">
          Training seed {evaluation.trainingSeed ?? 'none'} made the model. Evaluation seed {seed}{' '}
          chooses the independent simulator replay. Press Play to watch its movement; 3D and Charts
          show the same selected replay.
        </p>
      )}
    </section>
  )
}
