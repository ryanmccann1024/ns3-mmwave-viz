import type { ReactNode } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { MOTION } from '../../styles/motion'

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

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className ?? ''}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function NavItem({
  section,
  label,
  active,
  onClick,
}: {
  section: Section
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`w-full h-12 flex items-center justify-center md:justify-start gap-3 px-3 md:px-4 rounded-xl text-base font-medium ${MOTION.colors} ${
        active ? 'bg-white text-ink shadow-control' : 'text-ink-2 hover:bg-white/60'
      }`}
    >
      <Icon className={active ? 'text-accent' : 'text-ink-2'}>{ICONS[section]}</Icon>
      <span className="hidden md:inline flex-1 text-left truncate">{label}</span>
    </button>
  )
}

/** Persistent left navigation with the open folder pinned at the bottom; icons only on narrow screens */
export function NavRail({ active, onNavigate, workspace }: Props) {
  const hasFolder = workspace.dirName !== null
  return (
    <aside className="glass w-[4.5rem] md:w-64 flex-shrink-0 flex flex-col p-3 md:p-4 gap-8">
      <div className="flex items-center justify-center md:justify-start gap-3 md:px-1 pt-1">
        <BrandMark size={40} />
        <span className="hidden md:inline text-lg font-semibold tracking-tight text-ink-title">
          mmWave Viz
        </span>
      </div>

      <nav className="flex flex-col gap-1.5">
        <NavItem
          section="home"
          label="Home"
          active={active === 'home'}
          onClick={() => onNavigate('home')}
        />
        <NavItem
          section="runs"
          label="Simulation runs"
          active={active === 'runs'}
          onClick={() => onNavigate('runs')}
        />
        <NavItem
          section="experiments"
          label="RL experiments"
          active={active === 'experiments'}
          onClick={() => onNavigate('experiments')}
        />
      </nav>

      <button
        type="button"
        onClick={workspace.openFolder}
        disabled={workspace.loadingDir}
        title={hasFolder ? 'Change folder' : 'Open folder'}
        aria-label={hasFolder ? 'Change folder' : 'Open folder'}
        className={`md:hidden mt-auto w-full h-12 flex items-center justify-center rounded-xl bg-white border border-hairline shadow-control text-ink-2 hover:text-ink ${MOTION.colors}`}
      >
        <Icon>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </Icon>
      </button>

      <div className="mt-auto hidden md:flex flex-col gap-3">
        {hasFolder && (
          <div className="flex items-center gap-3 px-1 min-w-0">
            <Icon className="text-ink-2">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </Icon>
            <span className="flex-1 min-w-0 text-base font-medium text-ink truncate">
              {workspace.dirName}
            </span>
            {workspace.canForget && (
              <button
                type="button"
                onClick={workspace.forgetFolder}
                title="Forget saved folder"
                aria-label="Forget saved folder"
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-ink-2 hover:bg-white/70 hover:text-ink ${MOTION.colors}`}
              >
                <Icon>
                  <path d="M6 6l12 12M18 6L6 18" />
                </Icon>
              </button>
            )}
          </div>
        )}
        <Button
          variant="secondary"
          onClick={workspace.openFolder}
          disabled={workspace.loadingDir}
          className="w-full"
        >
          {hasFolder ? 'Change folder' : 'Open folder'}
        </Button>
      </div>
    </aside>
  )
}
