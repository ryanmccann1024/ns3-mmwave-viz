import { useState } from 'react'
import type { Evaluation } from '../../lib/experimentIndex'
import { describeFeature } from '../../lib/observationHelp'
import { Panel } from '../ui/Panel'
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

const GROUP_COLORS: Record<string, string> = {
  'Position / motion': '#3566c6',
  'Radio / link': '#b96b25',
  Service: '#22846c',
  'Presence / validity': '#8160b7',
}

const REWARD_HELP: Record<string, string> = {
  service_success: '+1 when at least 95% of demand is delivered and routable; otherwise −1.',
  sinr_quality:
    'Mean current link SINR, clipped from −20…40 dB and scaled to 0…1; invalid links score 0. This is a link snapshot, not delivered traffic.',
  unmet_sinr_quality: 'SINR quality bonus only while delivered service is below its target.',
  delivery_ratio:
    'Delivered traffic divided by requested traffic in the completed decision window.',
  connectivity: 'Fraction of link-ticks connected in the completed decision window.',
  travel_fraction:
    'Distance actually moved this decision, divided by the maximum possible distance.',
  origin_fraction:
    'Distance from the episode’s starting position, divided by the configured area diagonal.',
}

function weightLabel(value: number): string {
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 4 })}`
}

function boundLabel(value: number | null | undefined): string {
  return value === null || value === undefined ? 'unbounded / not recorded' : String(value)
}

export function ExperimentSetup({ evaluation }: { evaluation: Evaluation }) {
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

  return (
    <Panel
      title={`Observation · action · reward — ${evaluation.label}`}
      meta={`trained with seed ${evaluation.trainingSeed ?? 'none'}`}
      bodyClassName="px-5 pb-6"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 text-sm leading-relaxed">
        <div className="tile p-5">
          <div className="text-sm font-semibold text-accent-ink mb-2">1 · What the model sees</div>
          <div className="text-lg font-semibold text-ink">
            {String(observation.schema_id ?? 'Not recorded')}
          </div>
          <p className="text-sm text-ink-2 mt-2">
            {names.length || observation.obs_dim?.toString() || '?'} values at each decision. The
            feature explorer below explains every value and its saved bounds.
          </p>
          {names.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {groups.map((item) => (
                <span
                  key={item.name}
                  className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-hairline px-3 py-1 text-xs text-ink-2"
                >
                  <i
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: GROUP_COLORS[item.name] }}
                  />
                  {item.name} · {item.count}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="tile p-5">
          <div className="text-sm font-semibold text-accent-ink mb-2">2 · What it can do</div>
          <div className="text-lg font-semibold text-ink">
            {slots.filter(Boolean).length} controlled node
            {slots.filter(Boolean).length === 1 ? '' : 's'}
          </div>
          <p className="text-sm text-ink-2 mt-2">
            One choice per active slot each decision. A mask disables moves that cross the
            configured boundary; hold remains available.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {actions.map((action, index) => (
              <span
                key={`${action}-${index}`}
                className="rounded-lg bg-white/80 border border-hairline px-2.5 py-1 text-sm text-ink-2"
              >
                {index} · {action}
              </span>
            ))}
          </div>
        </div>
        <div className="tile p-5">
          <div className="text-sm font-semibold text-accent-ink mb-2">
            3 · What it is rewarded for
          </div>
          <div className="text-lg font-semibold text-ink">
            {components.length === 1
              ? components[0].replace(/_/g, ' ')
              : components.length
                ? 'Weighted measured terms'
                : String(reward.authority ?? 'Not recorded')}
          </div>
          <div className="flex flex-col gap-2 mt-3">
            {components.map((component, index) => (
              <div key={component} className="bg-white/80 rounded-lg border border-hairline p-3">
                <div className="font-medium text-ink">
                  {weightLabel(weights[index] ?? 1)} × {component.replace(/_/g, ' ')}
                </div>
                <div className="text-sm text-ink-2 mt-1">
                  {REWARD_HELP[component] ?? 'Measured after the completed decision window.'}
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted mt-3">
            One reward per {decisionSeconds ?? '?'}-second decision. Episode return sums up to{' '}
            {decisions ?? '?'} such rewards.
          </p>
        </div>
      </div>

      {names.length > 0 && (
        <section className="mt-6 border-t border-ink/[0.08] pt-5">
          <div className="flex flex-col gap-1 mb-4">
            <h3 className="text-lg font-semibold text-ink-title">Explore the observation</h3>
            <p className="text-sm text-ink-2">
              Select any feature to see what it means, which node it belongs to, and how its number
              is calculated. “_n” means normalized; the bounds below are allowed values, not the
              current value.
            </p>
          </div>
          <div className="flex flex-col gap-3 mb-4">
            <input
              aria-label="Search observation features"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by feature, such as SINR, x_n, or present"
              className="w-full rounded-xl bg-white/80 border border-hairline px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-2">
              {['All', ...groups.map((item) => item.name)].map((item) => (
                <button
                  key={item}
                  onClick={() => setGroup(item)}
                  className={`rounded-full px-3 py-1.5 text-sm border transition-colors ${group === item ? 'bg-accent text-white border-accent' : 'bg-white/70 text-ink-2 border-hairline hover:bg-white'}`}
                >
                  {item}
                  {item === 'All'
                    ? ` · ${names.length}`
                    : ` · ${groups.find((g) => g.name === item)?.count}`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">
            <div
              className="tile p-2 max-h-96 overflow-y-auto"
              aria-label="Observation feature list"
            >
              {filtered.length === 0 && (
                <div className="p-4 text-sm text-muted">No features match this search.</div>
              )}
              {filtered.map(({ name, index }) => (
                <button
                  key={`${name}-${index}`}
                  onClick={() => setSelectedIndex(index)}
                  aria-pressed={selectedIndex === index}
                  className={`w-full text-left rounded-lg px-3 py-2.5 mb-1 border transition-colors ${selectedIndex === index ? 'bg-accent-wash border-accent/30' : 'bg-white/60 border-transparent hover:bg-white'}`}
                >
                  <span className="text-xs text-muted tabular-nums mr-2">{index}</span>
                  <span className="text-sm font-mono text-ink break-all">{name}</span>
                </button>
              ))}
            </div>
            <div className="tile p-5 min-h-56" aria-live="polite">
              {help && (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wide text-accent-ink">
                    Feature {selectedIndex}
                  </div>
                  <h4 className="text-lg font-semibold text-ink-title mt-1">{help.title}</h4>
                  <div className="text-sm text-muted mt-1">{help.owner}</div>
                  <p className="text-sm text-ink-2 leading-relaxed mt-4">{help.meaning}</p>
                  <div className="mt-4 rounded-lg bg-white/80 border border-hairline p-3 text-sm text-ink-2">
                    <div className="font-semibold text-ink mb-1">How this value is calculated</div>
                    {help.calculation}
                  </div>
                  <div className="text-sm text-ink-2 mt-4">
                    Allowed bounds:{' '}
                    <span className="font-mono text-ink">
                      [{boundLabel(low[selectedIndex])}, {boundLabel(high[selectedIndex])}]
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-2 font-mono break-all">
                    Saved name: {selected}
                  </div>
                </>
              )}
            </div>
          </div>
          {Object.keys(normalization).length > 0 && (
            <div className="mt-4">
              <Disclosure title="Show the original saved normalization rules">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-ink-2">
                  {Object.entries(normalization).map(([key, value]) => (
                    <div key={key} className="tile p-3">
                      <span className="font-medium text-ink">{key.replace(/_/g, ' ')}:</span>{' '}
                      {Array.isArray(value) ? value.join(' to ') : String(value)}
                    </div>
                  ))}
                </div>
              </Disclosure>
            </div>
          )}
        </section>
      )}
      <p className="text-sm text-muted mt-5">
        Training seed updates the model; model-selection seed chooses its checkpoint; evaluation
        seeds test the frozen model. These are different jobs.
      </p>
    </Panel>
  )
}
