import type { ReactNode } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'

export type Section = 'home' | 'runs' | 'experiments'

interface Props {
  active: Section
  onNavigate: (section: Section) => void
  workspace: Workspace
}

const ICONS: Record<Section, ReactNode> = {
  home: <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />,
  runs: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M10 9.5v5l4-2.5z" />
    </>
  ),
  experiments: (
    <>
      <path d="M5 19V11" />
      <path d="M12 19V5" />
      <path d="M19 19v-6" />
    </>
  ),
}

function NavItem({
  section,
  label,
  count,
  active,
  onClick,
}: {
  section: Section
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
        active ? 'bg-white text-ink shadow-control' : 'text-ink-2 hover:bg-white/60'
      }`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={active ? 'text-accent' : 'text-muted'}
      >
        {ICONS[section]}
      </svg>
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && <span className="text-[11px] text-muted tabular-nums">{count}</span>}
    </button>
  )
}

/** Persistent left navigation with the open folder pinned at the bottom */
export function NavRail({ active, onNavigate, workspace }: Props) {
  const hasFolder = workspace.dirName !== null
  return (
    <aside className="glass w-60 flex-shrink-0 flex flex-col p-3 gap-4">
      <div className="flex items-center gap-2.5 px-1.5 pt-1">
        <BrandMark size={32} />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-ink-title">mmWave Viz</div>
          <div className="text-[11px] text-muted">ns-3 simulation viewer</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        <NavItem
          section="home"
          label="Home"
          active={active === 'home'}
          onClick={() => onNavigate('home')}
        />
        <NavItem
          section="runs"
          label="Simulation runs"
          count={hasFolder ? workspace.runs.length : undefined}
          active={active === 'runs'}
          onClick={() => onNavigate('runs')}
        />
        <NavItem
          section="experiments"
          label="RL experiments"
          count={
            hasFolder
              ? workspace.experimentRoots.length + workspace.trainingRoots.length
              : undefined
          }
          active={active === 'experiments'}
          onClick={() => onNavigate('experiments')}
        />
      </nav>

      <div className="mt-auto tile p-3 flex flex-col gap-2">
        <div className="text-[11px] font-medium text-muted">Open folder</div>
        <div className="text-sm font-semibold text-ink truncate font-mono">
          {workspace.loadingDir ? 'Reading…' : (workspace.dirName ?? 'None')}
        </div>
        <Button variant="secondary" onClick={workspace.openFolder} className="w-full !py-1.5">
          {hasFolder ? 'Change folder' : 'Open folder'}
        </Button>
        {workspace.canForget && (
          <Button variant="link" onClick={workspace.forgetFolder} className="self-center">
            Forget saved folder
          </Button>
        )}
      </div>
    </aside>
  )
}
