import { useState } from 'react'
import type { ResultCatalog } from '../../lib/resultCatalog'
import type { TrainingEpisode, TrainingRun } from '../../lib/trainingRun'
import { folderLabel, runTimeLabel, shortNumber } from '../../lib/format'
import { useTrainingRun } from '../../hooks/useRlData'
import { PageHeader } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { TrainingInsights } from '../rl/TrainingInsights'
import { Note } from '../ExperimentStatus'

interface Props {
  catalog: ResultCatalog
  root: string
  onHome: () => void
  onExperiments: () => void
  onPlay: (run: TrainingRun, episode: TrainingEpisode) => void
  openError: string | null
}

type Tab = 'learning' | 'episodes' | 'details'
const PAGE = 20

export function trainingRunTitle(root: string) {
  const time = runTimeLabel(root)
  if (time) return `Training run · ${time}`
  const parts = root.split('/').filter(Boolean)
  const leaf = parts[parts.length - 1] ?? ''
  const row = parts[parts.length - 2] ?? ''
  return leaf.startsWith('train-seed-') && row
    ? `${row} · training seed ${leaf.slice('train-seed-'.length)}`
    : folderLabel(root).name || 'Training run'
}

function EpisodeTable({
  run,
  onPlay,
}: {
  run: TrainingRun
  onPlay: (episode: TrainingEpisode) => void
}) {
  const counted = run.episodes.filter((e) => e.counted).reverse()
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(counted.length / PAGE))
  const currentPage = Math.min(page, pageCount - 1)
  const shown = counted.slice(currentPage * PAGE, (currentPage + 1) * PAGE)
  return (
    <Panel title="Training episodes" meta={counted.length} bodyClassName="px-2 pb-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="font-medium px-3 py-2">Episode</th>
            <th className="font-medium py-2 text-right">Return</th>
            {run.rewardComponents.map((c) => (
              <th key={c} className="font-medium py-2 text-right hidden md:table-cell">
                {c}
              </th>
            ))}
            <th className="font-medium py-2 text-right">Decisions</th>
            <th className="px-3" />
          </tr>
        </thead>
        <tbody>
          {shown.map((e) => (
            <tr key={e.dir} className="border-t border-ink/[0.06]">
              <td className="px-3 py-2 font-medium text-ink">Episode {e.index}</td>
              <td className="py-2 text-right font-mono tabular-nums font-semibold text-ink">
                {shortNumber(e.return)}
              </td>
              {run.rewardComponents.map((c) => (
                <td
                  key={c}
                  className="py-2 text-right font-mono tabular-nums text-ink-2 hidden md:table-cell"
                >
                  {shortNumber(e.components[c])}
                </td>
              ))}
              <td className="py-2 text-right font-mono tabular-nums text-muted">
                {e.decisions ?? 'n/a'}
              </td>
              <td className="px-3 py-1.5 text-right">
                {e.playable ? (
                  <Button onClick={() => onPlay(e)}>Watch in 3D</Button>
                ) : (
                  <span className="text-[11px] text-faint">No playback files</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {counted.length > PAGE && (
        <div className="px-3 pt-2 flex items-center gap-3 justify-between">
          <Button
            variant="secondary"
            disabled={currentPage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            Newer 20
          </Button>
          <span className="text-sm text-muted">
            Page {currentPage + 1} of {pageCount} · {counted.length} episodes
          </span>
          <Button
            variant="secondary"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((value) => value + 1)}
          >
            Older 20
          </Button>
        </div>
      )}
    </Panel>
  )
}

function Details({ run }: { run: TrainingRun }) {
  const rows: [string, string][] = [
    ['Folder', run.root || '.'],
    ['Status', run.status ?? 'not recorded'],
    ['Algorithm', run.algorithm ?? 'not recorded'],
    ['Training seed', run.seed === null ? 'not recorded' : String(run.seed)],
    ['Started', run.startedAt ?? 'not recorded'],
    ['Ended', run.endedAt ?? 'not recorded'],
    [
      'Reward',
      run.rewardComponents.map((c, i) => `${c} × ${run.rewardWeights[i] ?? 1}`).join(' + ') ||
        'not recorded',
    ],
    ['Actions', run.actionMeanings.join(', ') || 'not recorded'],
    ['Controlled nodes', run.slotNodeIds.join(', ') || 'not recorded'],
  ]
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Panel title="Run">
        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <span className="text-muted">{k}</span>
              <span className="text-ink-2 break-all">{v}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Hyperparameters">
        {run.hyperparameters ? (
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
            {Object.entries(run.hyperparameters).map(([k, v]) => (
              <div key={k} className="contents">
                <span className="text-muted">{k}</span>
                <span className="text-ink-2 font-mono break-all">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted">Not recorded.</div>
        )}
      </Panel>
    </div>
  )
}

export function TrainingRunPage({
  catalog,
  root,
  onHome,
  onExperiments,
  onPlay,
  openError,
}: Props) {
  const [tab, setTab] = useState<Tab>('learning')
  const loaded = useTrainingRun(catalog, root)
  const run = loaded?.state === 'ready' ? loaded.value : null
  const latest = run
    ? ([...run.episodes].reverse().find((e) => e.counted && e.playable) ?? null)
    : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        parents={[
          { label: 'Home', onClick: onHome },
          { label: 'RL experiments', onClick: onExperiments },
        ]}
        title={trainingRunTitle(root)}
        subtitle={
          run
            ? [run.algorithm, run.seed !== null ? `training seed ${run.seed}` : null, run.status]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={
          latest && run ? (
            <Button variant="primary" onClick={() => onPlay(run, latest)}>
              Watch the last episode in 3D
            </Button>
          ) : undefined
        }
      />
      {openError && <Note tone="error">{openError}</Note>}
      {(!loaded || loaded.state === 'loading') && (
        <div className="text-sm text-muted">Reading training run…</div>
      )}
      {loaded?.state === 'error' && <Note tone="error">{loaded.message}</Note>}
      {run && (
        <>
          <div>
            <Segmented
              options={[
                { value: 'learning', label: 'Learning' },
                { value: 'episodes', label: 'Episodes (3D)' },
                { value: 'details', label: 'Details' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          {tab === 'learning' && <TrainingInsights run={run} />}
          {tab === 'episodes' && <EpisodeTable run={run} onPlay={(e) => onPlay(run, e)} />}
          {tab === 'details' && <Details run={run} />}
        </>
      )}
    </div>
  )
}
