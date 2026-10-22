import { useState, type ReactNode } from 'react'
import {
  gradedRewardExplanation,
  rewardComponentLabel,
  rewardWeightLabel,
} from '../../lib/rlLabels'
import type { Evaluation } from '../../lib/experimentIndex'
import { describeFeature } from '../../lib/observationHelp'
import { Segmented } from '../ui/Segmented'
import { MOTION } from '../../styles/motion'
import { Disclosure } from '../ui/Disclosure'

type Rec = Record<string, unknown>
const rec = (value: unknown): Rec =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {}
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const bounds = (value: unknown): (number | null)[] =>
  Array.isArray(value) ? value.map((item) => (typeof item === 'number' ? item : null)) : []

function featureGroup(name: string): string {
  if (/sinr|cap_|is_los/.test(name)) return 'Radio / link'
  if (/demand|deliver|connect|unroutable|service_gap/.test(name)) return 'Service'
  if (/\.active|\.present|\.valid/.test(name)) return 'Presence / validity'
  return 'Position / motion'
}

const REWARD_HELP: Record<string, string> = {
  level0_coverage_v1: '+1 at each decision meeting the coverage target; otherwise −0.001.',
  level0_investigation_v1:
    '+1 at each decision when every available peer is inside the target radius; otherwise −0.001. No dwell or connectivity requirement.',
  level0_recovery_v1:
    '+1 when at least 90% of survivor traffic demand is delivered; otherwise −0.001. Zero while waiting and in the event-boundary window; zero demand never earns success.',
  level0_jamming_v1:
    '+1 when at least 90% of traffic demand is delivered during jamming; otherwise −0.001. Zero while waiting and in the event-boundary window; zero demand never earns success.',
  active_sinr_quality_v1: 'Mean SINR over links between peers still up.',
  survivor_delivery_ratio: 'Traffic delivered between peers still up.',
  survivor_fair_service: 'Balanced service across surviving peers.',
  survivor_worst_service: 'Service of the worst-served surviving peer.',
  fair_node_service: 'Balanced service across peers with demand.',
  coverage_fraction: 'Share of outdoor area the mesh covers.',
  adaptive_movement_cost: 'Moving costs more while the network is healthy.',
  recovery_movement_cost: 'Moving costs more while service and coverage are healthy.',
  recovery_delivery_deficit: 'Shortfall below the post-failure delivery target.',
  recovery_coverage_deficit: 'Shortfall below the post-failure coverage target.',
  recovery_worst_service: 'Worst surviving-peer service after the failure.',
  recovery_complete: 'Once, when recovery targets hold long enough.',
  investigation_complete: 'Once, when the team reaches the target and holds.',
  goal_progress: 'Progress of the team towards the target.',
  goal_coverage: 'Radio coverage around the target.',
  connected_arrival: 'While the team is at the target and connected.',
  team_arrival_fraction: 'Share of peers inside the target radius.',
  team_disconnected: 'While the team is split apart.',
  investigator_disconnected: 'While the investigator is cut off.',
  weak_service_deficit: 'Shortfall of the weakest peer below the service floor.',
  unsafe_proximity_fraction: 'Share of ticks with peers too close.',
  collision_attempt_fraction: 'Share of moves blocked by a wall or another peer.',
  decision_travel_v1: 'Distance moved, out of the most possible.',
  team_goal_proximity_v1: 'How close the team is to the target.',
  survivor_service_maintained_v1: 'Each decision after the failure that service holds.',
  service_success: '+1 when 95% of demand is delivered, otherwise −1.',
  sinr_quality: 'Mean link SINR, scaled to 0–1.',
  unmet_sinr_quality: 'SINR quality, only while service is below target.',
  delivery_ratio: 'Traffic delivered out of traffic requested.',
  connectivity: 'Share of link-ticks connected.',
  travel_fraction: 'Distance moved, out of the most possible.',
  origin_fraction: 'Distance from the starting position.',
}

function boundLabel(value: number | null | undefined): string {
  return value === null || value === undefined ? 'unbounded / not recorded' : String(value)
}

export function ExperimentSetup({
  evaluation,
  reference,
}: {
  evaluation: Evaluation
  reference?: Evaluation
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('All')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const observation = rec(evaluation.observationSchema)
  const reward = rec(evaluation.rewardSchema)
  const contract = evaluation.contract
  const names = strings(observation.feature_names)
  const low = bounds(observation.low)
  const high = bounds(observation.high)
  const normalization = rec(observation.normalization)
  const components = strings(reward.components)
  const weights = bounds(reward.weights)
  const referenceReward = rec(reference?.rewardSchema)
  const referenceComponents = strings(referenceReward.components)
  const referenceWeights = bounds(referenceReward.weights)
  const differences = [...new Set([...referenceComponents, ...components])]
    .map((name) => {
      const current = components.indexOf(name),
        previous = referenceComponents.indexOf(name)
      return {
        name,
        current: current < 0 ? 0 : (weights[current] ?? 1),
        previous: previous < 0 ? 0 : (referenceWeights[previous] ?? 1),
      }
    })
    .filter((term) => term.current !== term.previous)
  const actions = contract?.action_meanings ?? strings(observation.action_meanings)
  const slots = contract?.slot_node_ids ?? strings(observation.slot_node_ids)
  const groups = [...new Set(names.map(featureGroup))].map((name) => ({
    name,
    count: names.filter((feature) => featureGroup(feature) === name).length,
  }))
  const filtered = names
    .map((name, index) => ({ name, index }))
    .filter(
      ({ name }) =>
        (group === 'All' || featureGroup(name) === group) &&
        name.toLowerCase().includes(query.trim().toLowerCase())
    )
  const selected = names[selectedIndex] ?? null
  const help = selected === null ? null : describeFeature(selected, contract)
  const decisionSeconds = contract?.decision_interval_s
  const decisions = typeof contract?.num_decisions === 'number' ? contract.num_decisions : null

  const nodes = slots.filter(Boolean).length
  const words = (key: string) => {
    const t = key
      .replace(/_+/g, ' ')
      .trim()
      .replace(/\b(sinr|snr|los|nlos|mcs)\b/gi, (w) => w.toUpperCase())
    return t.charAt(0).toUpperCase() + t.slice(1)
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <SetupSection title="At a glance">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          <SetupFigure
            value={String(names.length || observation.obs_dim || '–')}
            label="Values the model sees at each decision"
          />
          <SetupFigure
            value={String(nodes)}
            label={nodes === 1 ? 'Node it controls' : 'Nodes it controls'}
          />
          <SetupFigure
            value={decisions === null ? '–' : decisions.toLocaleString()}
            label={`Decisions per episode, one every ${decisionSeconds ?? '?'} s`}
          />
        </div>
      </SetupSection>

      {actions.length > 0 && (
        <SetupSection title="Actions">
          <div className="glass p-6 flex flex-col gap-4">
            <p className="text-base text-ink-2 leading-relaxed max-w-3xl">
              At each decision every controlled node picks one of these moves. Moves that would
              leave the area are blocked; hold is always allowed.
            </p>
            <div className="self-start max-w-full flex rounded-xl border border-hairline bg-white overflow-hidden divide-x divide-hairline">
              {actions.map((action, index) => (
                <span
                  key={`${action}-${index}`}
                  className="h-11 leading-[2.75rem] px-6 text-center text-base font-medium text-ink whitespace-nowrap"
                >
                  {words(action)}
                </span>
              ))}
            </div>
          </div>
        </SetupSection>
      )}

      <SetupSection title="Reward">
        <div className="glass p-6 flex flex-col gap-4">
          <p className="text-base text-ink-2 leading-relaxed max-w-3xl">
            Reward = measured value × weight. Weight ×1 leaves it unchanged. Episode return adds the
            decision rewards.
          </p>
          {components.length > 0 ? (
            <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
              {components.map((component, index) => {
                const explanation = gradedRewardExplanation(component, reward)
                return (
                  <div
                    key={component}
                    className="py-4 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 items-baseline"
                  >
                    <span className="text-base font-semibold tabular-nums text-ink-title whitespace-nowrap">
                      Weight {rewardWeightLabel(weights[index] ?? 1)}
                    </span>
                    <span className="text-lg font-medium text-ink">
                      {rewardComponentLabel(component, reward) === component
                        ? words(component)
                        : rewardComponentLabel(component, reward)}
                    </span>
                    <div className="col-span-2 sm:col-span-1 sm:col-start-2 text-base text-ink-2 leading-relaxed flex flex-col gap-2">
                      {explanation ? (
                        <>
                          <p>{explanation.calculation}</p>
                          <p>
                            <strong className="font-medium text-ink">Example: </strong>
                            {explanation.example}
                          </p>
                          <p>
                            <strong className="font-medium text-ink">Scored: </strong>
                            {explanation.timing}
                          </p>
                        </>
                      ) : (
                        <p>
                          {REWARD_HELP[component] ??
                            'Measured after the completed decision window.'}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-base text-ink-2">{String(reward.authority ?? 'Not recorded')}</div>
          )}
        </div>
      </SetupSection>
      {reference && differences.length > 0 && (
        <SetupSection title="Differences from Dynamic Balance">
          <div className="glass p-6 overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="text-sm text-ink-2">
                  <th className="font-medium text-left pb-3">Term</th>
                  <th className="font-medium text-right pb-3">Dynamic Balance</th>
                  <th className="font-medium text-right pb-3">This reward</th>
                </tr>
              </thead>
              <tbody>
                {differences.map((term) => (
                  <tr key={term.name} className="border-t border-hairline">
                    <td className="py-3 text-ink">{words(term.name)}</td>
                    <td className="text-right font-mono tabular-nums text-ink-2">
                      {rewardWeightLabel(term.previous)}
                    </td>
                    <td className="text-right font-mono tabular-nums text-ink">
                      {rewardWeightLabel(term.current)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SetupSection>
      )}

      {names.length > 0 && (
        <section className="flex flex-col gap-4">
          <header className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-title">
              Observation features
            </h2>
            <label className="w-full sm:w-72">
              <span className="sr-only">Search observation features</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search, such as SINR or x_n"
                className={`w-full h-11 px-4 rounded-xl text-base text-ink bg-white border border-hairline shadow-control placeholder:text-ink-2/60 focus-visible:border-accent ${MOTION.colors}`}
              />
            </label>
          </header>
          <div className="max-w-full overflow-x-auto">
            <Segmented
              size="lg"
              options={['All', ...groups.map((item) => item.name)].map((item) => ({
                value: item,
                label: `${item} · ${item === 'All' ? names.length : groups.find((g) => g.name === item)?.count}`,
              }))}
              value={group}
              onChange={setGroup}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            <div
              className="glass p-2 h-[30rem] overflow-y-auto"
              aria-label="Observation feature list"
            >
              {filtered.length === 0 && (
                <div className="p-4 text-base text-ink-2">No features match this search.</div>
              )}
              {filtered.map(({ name, index }) => (
                <button
                  key={`${name}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  aria-pressed={selectedIndex === index}
                  className={`w-full flex items-center gap-3 text-left rounded-xl px-4 py-2.5 ${MOTION.colors} ${selectedIndex === index ? 'bg-accent-wash text-accent-ink' : 'text-ink hover:bg-white/80'}`}
                >
                  <span className="w-8 flex-shrink-0 text-sm text-ink-2 tabular-nums">{index}</span>
                  <span className="text-base font-mono break-all">{name}</span>
                </button>
              ))}
            </div>
            <div
              className="glass p-6 h-[30rem] overflow-y-auto flex flex-col gap-4"
              aria-live="polite"
            >
              {help && (
                <>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-xl font-semibold tracking-tight text-ink-title">
                      {help.title}
                    </h3>
                    <span className="flex-shrink-0 text-base text-ink-2 tabular-nums">
                      Feature {selectedIndex}
                    </span>
                  </div>
                  <div className="text-base text-ink-2">{help.owner}</div>
                  <p className="text-base text-ink leading-relaxed">{help.meaning}</p>
                  <div className="tile p-4 text-base text-ink-2 leading-relaxed">
                    <div className="font-semibold text-ink mb-1">How it is calculated</div>
                    {help.calculation}
                  </div>
                  <div className="text-base text-ink-2">
                    Allowed range{' '}
                    <span className="font-mono text-ink">
                      [{boundLabel(low[selectedIndex])}, {boundLabel(high[selectedIndex])}]
                    </span>
                  </div>
                  <div className="text-sm text-ink-2 font-mono break-all">{selected}</div>
                </>
              )}
            </div>
          </div>
          {Object.keys(normalization).length > 0 && (
            <div className="glass px-6">
              <Disclosure title="Saved normalization rules">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-base text-ink-2">
                  {Object.entries(normalization).map(([key, value]) => (
                    <div key={key} className="tile p-4">
                      <span className="font-medium text-ink">{words(key)}:</span>{' '}
                      {Array.isArray(value) ? value.join(' to ') : String(value)}
                    </div>
                  ))}
                </div>
              </Disclosure>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function SetupSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-title">{title}</h2>
      {children}
    </section>
  )
}

function SetupFigure({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass p-6 min-w-0">
      <div className="text-4xl font-semibold tracking-tight text-ink-title">{value}</div>
      <div className="mt-1 text-base font-medium text-ink-2">{label}</div>
    </div>
  )
}
