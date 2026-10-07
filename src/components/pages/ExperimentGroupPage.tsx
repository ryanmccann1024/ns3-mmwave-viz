import type { ExperimentRoot } from '../../lib/experimentIndex'
import type { ResultCatalog } from '../../lib/resultCatalog'
import { PageHeader } from '../ui/PageHeader'
import { ScenarioCard } from './ExperimentCard'

interface Props {
  catalog: ResultCatalog | null
  title: string
  roots: ExperimentRoot[]
  onHome: () => void
  onExperiments: () => void
  onOpenScenario: (root: ExperimentRoot) => void
}

/** One experiment's scenarios, each opening its own results */
export function ExperimentGroupPage({
  catalog,
  title,
  roots,
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
        {roots.map((root) => (
          <ScenarioCard
            key={root.root}
            catalog={catalog}
            root={root}
            onOpen={() => onOpenScenario(root)}
          />
        ))}
      </div>
    </div>
  )
}
