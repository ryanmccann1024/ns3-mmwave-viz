import { useState } from 'react'
import { useSimData } from './hooks/useSimData'
import { usePlaybackLog } from './hooks/usePlaybackLog'
import { useExperimentSession } from './hooks/useExperimentSession'
import { useWorkspace } from './hooks/useWorkspace'
import type { RunEntry } from './lib/assembleRuns'
import type { Episode, ExperimentRoot } from './lib/experimentIndex'
import { episodeFiles, readPlaybackFiles } from './lib/experimentIndex'
import type { TrainingEpisode, TrainingRun } from './lib/trainingRun'
import { folderLabel } from './lib/format'
import type { Section } from './components/shell/NavRail'
import { NavRail } from './components/shell/NavRail'
import type { Crumb } from './components/ui/Breadcrumbs'
import { HomePage } from './components/pages/HomePage'
import { RunsPage } from './components/pages/RunsPage'
import { ExperimentsPage } from './components/pages/ExperimentsPage'
import type { ExperimentTab } from './components/pages/ExperimentPage'
import { ExperimentPage } from './components/pages/ExperimentPage'
import { PlayerPage } from './components/pages/PlayerPage'
import { policyLabel, rewardLabel } from './lib/rlLabels'
import { TrainingRunPage, trainingRunTitle } from './components/pages/TrainingRunPage'
import { Note } from './components/ExperimentStatus'

type Page = Section | 'experiment' | 'training' | 'player'

/** What the player is showing, and the page it returns to */
type Playing =
  | { kind: 'run'; run: RunEntry; from: Section }
  | { kind: 'episode'; episode: Episode }
  | { kind: 'training'; root: string; episode: TrainingEpisode }

export default function App() {
  const workspace = useWorkspace()
  const sim = useSimData()
  const playback = usePlaybackLog(sim)
  const session = useExperimentSession()
  const [page, setPage] = useState<Page>('home')
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [openingEpisode, setOpeningEpisode] = useState<Episode | null>(null)
  const [episodeError, setEpisodeError] = useState<string | null>(null)
  const [experimentTab, setExperimentTab] = useState<ExperimentTab>('results')
  const [trainingRoot, setTrainingRoot] = useState<string | null>(null)
  const [trainingError, setTrainingError] = useState<string | null>(null)

  function navigate(section: Section) {
    closePlayer()
    setPage(section)
  }

  function closePlayer() {
    sim.pause()
    sim.reset()
    session.clearEpisode()
    setPlaying(null)
  }

  function openRun(run: RunEntry, from: Section) {
    setPlaying({ kind: 'run', run, from })
    setPage('player')
    sim.loadFiles({
      linksFile: run.linksFile,
      positionsFile: run.posFile,
      buildingsFile: run.buildingsFile,
      flowsFile: run.flowsFile,
      routesFile: run.routesFile,
      nodesJsonFile: run.nodesJsonFile,
      jammersJsonFile: run.jammersJsonFile,
      mcsFile: run.mcsFile,
      rxPowerFile: run.rxPowerFile,
    })
  }

  function openExperiment(root: ExperimentRoot) {
    if (!workspace.catalog) return
    setEpisodeError(null)
    setExperimentTab('results')
    setPage('experiment')
    session.openExperiment(workspace.catalog, root)
  }

  function openTrainingRun(root: string) {
    closePlayer()
    setTrainingError(null)
    setTrainingRoot(root)
    setPage('training')
  }

  async function playTrainingEpisode(run: TrainingRun, episode: TrainingEpisode) {
    if (!workspace.catalog) return
    setTrainingError(null)
    const result = await readPlaybackFiles(workspace.catalog, episode.files, episode.dir)
    if (!result.ok) {
      setTrainingError(`Episode ${episode.index}: ${result.message}`)
      return
    }
    setPlaying({ kind: 'training', root: run.root, episode })
    setPage('player')
    sim.loadFiles(result.files)
  }

  async function openEpisode(episode: Episode) {
    if (!session.catalog || openingEpisode) return
    setEpisodeError(null)
    setOpeningEpisode(episode)
    try {
      const result = await episodeFiles(session.catalog, episode)
      if (!result.ok) {
        setEpisodeError(
          `${episode.label} / training seed ${episode.trainingSeed ?? 'none'} / ${episode.policy} / seed ${episode.seed}: ${result.message}`
        )
        return
      }
      session.selectEpisode(episode)
      setPlaying({ kind: 'episode', episode })
      setPage('player')
      sim.loadFiles(result.files)
    } catch (err) {
      setEpisodeError(`Could not read ${episode.dir}: ${err instanceof Error ? err.message : err}`)
    } finally {
      setOpeningEpisode(null)
    }
  }

  const home: Crumb = { label: 'Home', onClick: () => navigate('home') }
  const experimentName = session.experiment
    ? folderLabel(session.experiment.root).name || session.experiment.name
    : ''

  function playerContext(): { parents: Crumb[]; title: string; back: () => void } {
    if (playing?.kind === 'episode') {
      const back = () => {
        closePlayer()
        setPage('experiment')
      }
      return {
        parents: [
          home,
          { label: 'RL experiments', onClick: () => navigate('experiments') },
          { label: experimentName, onClick: back },
        ],
        title: `${session.evaluation ? rewardLabel(session.evaluation) : playing.episode.label} · ${policyLabel(playing.episode.policy)} · evaluation seed ${playing.episode.seed}`,
        back,
      }
    }
    if (playing?.kind === 'training') {
      const back = () => {
        closePlayer()
        setPage('training')
      }
      return {
        parents: [
          home,
          { label: 'RL experiments', onClick: () => navigate('experiments') },
          { label: trainingRunTitle(playing.root), onClick: back },
        ],
        title: `Training episode ${playing.episode.index}`,
        back,
      }
    }
    const from = playing?.from ?? 'runs'
    return {
      parents: [
        home,
        ...(from === 'home' ? [] : [{ label: 'Simulation runs', onClick: () => navigate('runs') }]),
      ],
      title: playing ? `${playing.run.time} · ${playing.run.seed}` : 'Simulation',
      back: () => navigate(from),
    }
  }

  // The nav rail is hidden in the player, so only list pages need a highlighted section
  const section: Section =
    page === 'experiment' || page === 'training' || page === 'player' ? 'experiments' : page

  let content
  if (page === 'player') {
    const ctx = playerContext()
    const rl =
      playing?.kind === 'episode' && session.catalog && session.evaluation && session.episode
        ? {
            catalog: session.catalog,
            evaluation: session.evaluation,
            evaluations: session.experiment?.evaluations ?? [],
            episode: session.episode,
            onOpenEpisode: openEpisode,
            openingEpisode,
            trails: session.trails,
            overlayOptions: session.overlayOptions,
            overlayPolicies: session.overlayPolicies,
            trailErrors: session.trailErrors,
            onToggleOverlay: session.toggleOverlay,
            trailNode: session.trailNode,
            onTrailNode: session.setTrailNode,
          }
        : null
    // A standalone baseline seed carries its manifest metadata; the catalog reads its plan lazily
    const baseline =
      playing?.kind === 'run' && playing.run.baseline && workspace.catalog
        ? { meta: playing.run.baseline, catalog: workspace.catalog }
        : null
    content = (
      <PlayerPage
        key={playing?.kind === 'run' ? playing.run.key : playing ? playing.episode.dir : undefined}
        sim={sim}
        logs={playback.logs}
        onSeek={playback.handleSeek}
        onSetSpeed={playback.handleSetSpeed}
        onClearLogs={playback.handleClearLogs}
        parents={ctx.parents}
        title={ctx.title}
        rl={rl}
        baseline={baseline}
        onClose={ctx.back}
      />
    )
  } else if (page === 'experiment') {
    content =
      session.experiment && session.catalog ? (
        <ExperimentPage
          catalog={session.catalog}
          experiment={session.experiment}
          openError={episodeError}
          openingEpisode={openingEpisode}
          onOpenEpisode={openEpisode}
          onHome={() => navigate('home')}
          onExperiments={() => navigate('experiments')}
          tab={experimentTab}
          onTab={setExperimentTab}
          trainingRoots={workspace.allTrainingRoots}
          onOpenTrainingRun={openTrainingRun}
        />
      ) : session.error ? (
        <Note tone="error">{session.error}</Note>
      ) : (
        <div className="text-sm text-muted">Reading experiment…</div>
      )
  } else if (page === 'runs') {
    content = (
      <RunsPage
        workspace={workspace}
        onHome={() => navigate('home')}
        onOpenRun={(run) => openRun(run, 'runs')}
      />
    )
  } else if (page === 'experiments') {
    content = (
      <ExperimentsPage
        workspace={workspace}
        onHome={() => navigate('home')}
        onOpenExperiment={openExperiment}
        onOpenTrainingRun={openTrainingRun}
      />
    )
  } else if (page === 'training' && trainingRoot !== null && workspace.catalog) {
    content = (
      <TrainingRunPage
        catalog={workspace.catalog}
        root={trainingRoot}
        onHome={() => navigate('home')}
        onExperiments={() => navigate('experiments')}
        onPlay={playTrainingEpisode}
        openError={trainingError}
      />
    )
  } else {
    content = (
      <HomePage
        workspace={workspace}
        onNavigate={navigate}
        onOpenRun={(run) => openRun(run, 'home')}
        onOpenExperiment={openExperiment}
      />
    )
  }

  return (
    <div className="flex h-[100dvh] gap-3 p-3 text-ink font-sans overflow-hidden">
      {page !== 'player' && (
        <NavRail active={section} onNavigate={navigate} workspace={workspace} />
      )}
      <main
        className={`flex-1 min-w-0 flex flex-col ${page === 'player' ? 'min-h-0' : 'overflow-y-auto'}`}
      >
        {page === 'player' ? (
          content
        ) : (
          <div className="w-full max-w-6xl mx-auto px-3 py-4 flex flex-col flex-1">{content}</div>
        )}
      </main>

      {/* Fallback folder picker for browsers without the File System Access API */}
      <input
        ref={workspace.dirInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        className="hidden"
        onChange={workspace.onDirSelect}
      />
    </div>
  )
}
