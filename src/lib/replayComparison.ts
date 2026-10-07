import type { Episode, Evaluation } from './experimentIndex.ts'
import { policyLabel } from './rlLabels.ts'

export interface ReplayChoice {
  key: string
  label: string
  episode: Episode
}

const variantName = (label: string) => {
  const words = label.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Reward variants' models and the current variant's baselines on the same held-out seed. */
export function replayChoices(evaluations: Evaluation[], current: Episode): ReplayChoice[] {
  const choices: ReplayChoice[] = []
  for (const evaluation of evaluations) {
    if (evaluation.trainingSeed !== current.trainingSeed) continue
    for (const episode of evaluation.episodes) {
      if (episode.seed !== current.seed || !episode.playable || episode.status !== 'completed')
        continue
      if (episode.policy !== 'model' && evaluation.key !== current.evaluationKey) continue
      choices.push({
        key: episode.dir,
        label:
          episode.policy === 'model' ? variantName(evaluation.label) : policyLabel(episode.policy),
        episode,
      })
    }
  }
  return choices.sort(
    (a, b) =>
      Number(b.episode.policy === 'model') - Number(a.episode.policy === 'model') ||
      a.label.localeCompare(b.label)
  )
}
