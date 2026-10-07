import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ArtifactState, Experiment, FetchSnapshot } from '../lib/experimentIndex'
import { Button } from './ui/Button'
import { MOTION } from '../styles/motion'

const STATE_LABELS: Record<ArtifactState, string> = {
  ok: 'ok',
  incomplete: 'incomplete',
  failed: 'failed',
  missing: 'not run yet',
  not_fetched: 'not fetched',
}

/** The state as plain coloured text, not a pill: quiet when ok, amber or red when not */
export function StateBadge({ state }: { state: ArtifactState }) {
  const label = STATE_LABELS[state]
  const tone =
    state === 'failed' ? 'text-rose-700' : state === 'ok' ? 'text-ink-2' : 'text-amber-800'
  return (
    <span className={`text-base font-medium ${tone}`}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  )
}

export function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="glass p-6 flex flex-col gap-4 min-w-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold tracking-tight text-ink-title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Note({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error'
  children: ReactNode
}) {
  const cls =
    tone === 'error'
      ? 'bg-rose-50 border-rose-200 text-rose-800'
      : tone === 'warn'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-white/60 border-hairline text-ink-2'
  return (
    <div
      className={`text-base leading-relaxed border rounded-xl px-4 py-3 break-words ${cls} ${tone === 'error' ? MOTION.enter : MOTION.enterFade}`}
    >
      {children}
    </div>
  )
}

function FetchSnapshotView({ fetch }: { fetch: FetchSnapshot }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <Note>
        Saved snapshot from <span className="font-mono">{fetch.path}</span>, written when the
        results were fetched. It is not live queue status.
      </Note>
      {fetch.snapshotOfIncompleteRun === true && (
        <Note tone="warn">This is a snapshot of an incomplete run.</Note>
      )}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ink-2">
        <span className="text-muted">fetched at</span>
        <span>{fetch.fetchedAt ?? 'not recorded'}</span>
        <span className="text-muted">remote</span>
        <span className="break-all">
          {typeof fetch.remote === 'string' ? fetch.remote : JSON.stringify(fetch.remote)}
        </span>
        <span className="text-muted">selection</span>
        <span>{fetch.selection.join(', ') || 'not recorded'}</span>
        <span className="text-muted">comparison</span>
        <span>{fetch.comparison ?? 'not recorded'}</span>
        <span className="text-muted">snapshot of incomplete run</span>
        <span>
          {fetch.snapshotOfIncompleteRun === null
            ? 'not recorded'
            : String(fetch.snapshotOfIncompleteRun)}
        </span>
        <span className="text-muted">files listed</span>
        <span>{fetch.fileCount ?? 'not recorded'}</span>
      </div>
      {fetch.tasks.length > 0 && (
        <table className="text-xs w-full">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-normal pr-3 py-1">#</th>
              <th className="font-normal pr-3">task</th>
              <th className="font-normal">state at fetch time</th>
            </tr>
          </thead>
          <tbody>
            {fetch.tasks.map((t) => (
              <tr key={t.id} className="border-t border-ink/[0.06]">
                <td className="pr-3 py-1 text-muted">{t.index ?? ''}</td>
                <td className="pr-3 text-ink-2">{t.id}</td>
                <td className="text-ink-2">{t.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function ExperimentStatus({ experiment }: { experiment: Experiment }) {
  const [showFetch, setShowFetch] = useState(false)
  const { artifacts, issues, fetch } = experiment
  const topLevel = artifacts.filter((a) => a.artifact !== 'eval_manifest' || !a.usable)

  return (
    <Section title="Artifacts and status">
      <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {topLevel.map((a) => (
          <div key={a.path} className="py-3 flex items-start gap-4 text-base">
            <div className="flex-1 min-w-0">
              <div className="text-ink font-mono text-sm break-all">{a.path}</div>
              {a.message && <div className="text-rose-700 break-words mt-1">{a.message}</div>}
            </div>
            <span
              className={`flex-shrink-0 font-medium ${a.usable ? 'text-ink-2' : 'text-rose-700'}`}
            >
              {a.usable ? 'Read' : 'Not usable'}
            </span>
          </div>
        ))}
        {topLevel.length === 0 && (
          <div className="py-3 text-base text-ink-2">
            No plan, comparison or fetch manifest found.
          </div>
        )}
      </div>

      {issues.map((issue) => (
        <Note key={issue} tone="warn">
          {issue}
        </Note>
      ))}

      {fetch && (
        <div className="flex flex-col gap-2">
          <div>
            <Button onClick={() => setShowFetch((s) => !s)}>
              {showFetch ? 'Hide' : 'Show'} fetch snapshot
            </Button>
          </div>
          {showFetch && <FetchSnapshotView fetch={fetch} />}
        </div>
      )}
    </Section>
  )
}
