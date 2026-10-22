import type { ExperimentRoot } from '../../lib/experimentIndex'
import type { ResultCatalog } from '../../lib/resultCatalog'
import { experimentLabel } from '../../lib/rlLabels'
import { groupScenarioSizes } from '../../lib/scenarioSizes'
import { PageHeader } from '../ui/PageHeader'
import { ScenarioCard, ScenarioFamilyCard } from './ExperimentCard'

interface Props {
  catalog: ResultCatalog | null
  title: string
  roots: ExperimentRoot[]
  /** team size last picked, so the next scenario opens at the same size when it has one */
  preferredPeers: number | null
  onHome: () => void
  onExperiments: () => void
  onOpenScenario: (root: ExperimentRoot) => void
}

/** One experiment's scenarios, each opening its own results; team sizes share one card */
export function ExperimentGroupPage({
  catalog,
  title,
  roots,
  preferredPeers,
  onHome,
  onExperiments,
  onOpenScenario,
}: Props) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8 py-4 sm:py-8">
      <PageHeader
        parents={[
          { label: 'Home', onClick: onHome },
          { label: 'RL experiments', onClick: onExperiments },
        ]}
        title={title}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
        {groupScenarioSizes(roots).map((family) =>
          family.sizes.length === 1 ? (
            <ScenarioCard
              key={family.key}
              catalog={catalog}
              root={family.sizes[0].root}
              onOpen={() => onOpenScenario(family.sizes[0].root)}
            />
          ) : (
            <ScenarioFamilyCard
              key={family.key}
              catalog={catalog}
              title={experimentLabel(family.stem)}
              sizes={family.sizes}
              onOpen={() =>
                onOpenScenario(
                  (family.sizes.find((s) => s.peers === preferredPeers) ?? family.sizes[0]).root
                )
              }
            />
          )
        )}
      </div>
    </div>
  )
}
