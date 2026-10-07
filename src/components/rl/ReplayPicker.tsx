import { useState } from 'react'
import type { Episode, Evaluation } from '../../lib/experimentIndex'
import { policyLabel, rewardLabel } from '../../lib/rlLabels'
import { trailColor } from '../../styles/tokens'
import { MOTION } from '../../styles/motion'
import { Button } from '../ui/Button'

interface Props {
  evaluations: Evaluation[]
  current: Episode
  onOpen: (episode: Episode) => void
  opening?: Episode | null
}

/** coverage-strong-travel -> Coverage strong travel */
const variantTitle = (label: string) => {
  const words = label.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const POLICY_ORDER = ['model', 'hold', 'random_valid']
const rank = (policy: string) =>
  POLICY_ORDER.includes(policy) ? POLICY_ORDER.indexOf(policy) : POLICY_ORDER.length

/**
 * The replay being watched, and a way to switch: pick a reward variant, then click a policy's
 * evaluation seed to open that replay directly.
 */
export function ReplayPicker({ evaluations, current, onOpen, opening }: Props) {
  const ready = evaluations.filter((e) => e.episodes.some((episode) => episode.playable))
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState(current.evaluationKey)
  const currentEvaluation = ready.find((e) => e.key === current.evaluationKey)
  const evaluation = ready.find((e) => e.key === chosen) ?? currentEvaluation ?? ready[0]
  const seedLabel = (e: Evaluation) =>
    ready.filter((x) => x.label === e.label).length > 1 && e.trainingSeed !== null
      ? ` · seed ${e.trainingSeed}`
      : ''

  return (
    <section className="flex flex-col gap-4" aria-label="Replay">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-ink-title">
            {currentEvaluation ? variantTitle(currentEvaluation.label) : 'Replay'}
          </h2>
          <div className="mt-1 text-base text-ink-2">
            {policyLabel(current.policy)} · evaluation seed {current.seed}
          </div>
          {currentEvaluation && (
            <div className="text-base text-ink-2">{rewardLabel(currentEvaluation)}</div>
          )}
        </div>
        {ready.length > 0 && (
          <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Done' : 'Change'}
          </Button>
        )}
      </div>

      {open && evaluation && (
        <div className={`flex flex-col gap-4 ${MOTION.enterFade}`}>
          {ready.length > 1 && (
            <div className="flex flex-col rounded-xl border border-hairline bg-white overflow-hidden divide-y divide-hairline">
              {ready.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  aria-pressed={e.key === evaluation.key}
                  onClick={() => setChosen(e.key)}
                  className={`h-11 px-4 text-left text-base truncate ${MOTION.colors} ${
                    e.key === evaluation.key
                      ? 'bg-accent-wash text-accent-ink font-semibold'
                      : 'text-ink font-medium hover:bg-accent-wash/60'
                  }`}
                >
                  {variantTitle(e.label)}
                  {seedLabel(e)}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {[...new Set(evaluation.episodes.filter((e) => e.playable).map((e) => e.policy))]
              .sort((a, b) => rank(a) - rank(b))
              .map((policy) => {
                const episodes = evaluation.episodes
                  .filter((e) => e.policy === policy && e.playable)
                  .sort((a, b) => a.seed - b.seed)
                return (
                  <div key={policy} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-base font-medium text-ink">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: trailColor(policy) }}
                      />
                      {policyLabel(policy)}
                    </div>
                    <div className="flex rounded-xl border border-hairline bg-white shadow-control overflow-hidden divide-x divide-hairline">
                      {episodes.map((e) => {
                        const isCurrent = e.dir === current.dir
                        const busy = opening === e
                        return (
                          <button
                            key={e.dir}
                            type="button"
                            disabled={isCurrent || (opening !== null && opening !== undefined)}
                            aria-pressed={isCurrent}
                            aria-label={`Play ${policyLabel(policy)} on evaluation seed ${e.seed}`}
                            onClick={() => onOpen(e)}
                            className={`flex-1 h-10 px-2 text-base font-medium tabular-nums ${MOTION.colors} ${
                              isCurrent || busy
                                ? 'bg-accent-wash text-accent-ink font-semibold'
                                : 'text-ink hover:bg-accent-wash hover:text-accent-ink'
                            }`}
                          >
                            {busy ? 'Opening' : e.seed}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </section>
  )
}
