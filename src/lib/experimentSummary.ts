import type { Experiment } from './experimentIndex'

export interface PolicyDelivery {
  policy: string
  /** mean delivery_ratio over completed episodes across every evaluation, 0..1 */
  delivery: number
}

/**
 * Mean delivered share per policy across all of an experiment's evaluations, the trained
 * model first and the rest best-first. Policies with no completed, measured episode are left out.
 */
export function policyDelivery(experiment: Pick<Experiment, 'evaluations'>): PolicyDelivery[] {
  const sums = new Map<string, { sum: number; n: number }>()
  for (const evaluation of experiment.evaluations) {
    // Adaptation and its sampled control are a separate comparison, not extra
    // held-out model evaluations in the scenario overview.
    if (evaluation.provenance?.kind === 'online' || evaluation.provenance?.kind === 'fixed')
      continue
    for (const episode of evaluation.episodes) {
      if (episode.status !== 'completed') continue
      const value = episode.metrics?.delivery_ratio
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const acc = sums.get(episode.policy) ?? { sum: 0, n: 0 }
      acc.sum += value
      acc.n += 1
      sums.set(episode.policy, acc)
    }
  }
  return [...sums.entries()]
    .map(([policy, { sum, n }]) => ({ policy, delivery: sum / n }))
    .sort((a, b) =>
      a.policy === 'model' ? -1 : b.policy === 'model' ? 1 : b.delivery - a.delivery
    )
}
