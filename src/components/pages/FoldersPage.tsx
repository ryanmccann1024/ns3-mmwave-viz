import { useState } from 'react'
import type { Workspace } from '../../hooks/useWorkspace'
import type { CheckState, FolderNode } from '../../lib/folderFilter'
import { allFolders, checkState, toggleFolder } from '../../lib/folderFilter'
import { Button, SECONDARY_BUTTON } from '../ui/Button'
import { ListEmpty, NoFolder } from './shared'
import { MOTION } from '../../styles/motion'
import { Loading } from '../ui/Spinner'

/** Left padding per tree level, so names line up under their parent's name */
const INDENT = ['pl-6', 'pl-16', 'pl-[6.5rem]', 'pl-[9rem]', 'pl-[11.5rem]']

/** A drawn checkbox: crisp at any zoom, unlike the browser's own */
function Checkbox({ state }: { state: CheckState }) {
  const filled = state !== 'off'
  return (
    <span
      aria-hidden="true"
      className={`w-6 h-6 flex-shrink-0 rounded-[7px] border-2 flex items-center justify-center ${
        filled
          ? 'bg-accent border-accent group-hover:bg-accent-ink group-hover:border-accent-ink'
          : 'bg-white border-ink/25 group-hover:border-accent'
      } ${MOTION.colors}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="w-4 h-4"
        fill="none"
        stroke="white"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {state === 'on' && <path d="M3.25 8.5 6.5 11.5 12.75 4.75" />}
        {state === 'mixed' && <path d="M4 8h8" />}
      </svg>
    </span>
  )
}

function FolderRow({
  node,
  depth,
  included,
  onToggle,
}: {
  node: FolderNode
  depth: number
  included: string[]
  onToggle: (path: string) => void
}) {
  const top = depth === 0
  // A card's own folder always shows its subfolders; deeper ones open on request
  const [open, setOpen] = useState(top)
  const state = checkState(node, included)
  const nested = node.children.length > 0
  return (
    <>
      <div
        className={`flex items-center gap-4 pr-5 last:rounded-b-2xl hover:bg-white/70 ${top ? 'rounded-t-2xl' : ''} ${MOTION.colors}`}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
          onClick={() => onToggle(node.path)}
          className={`group flex-1 min-w-0 h-16 flex items-center gap-4 text-left ${INDENT[depth] ?? INDENT[INDENT.length - 1]}`}
        >
          <Checkbox state={state} />
          <span
            className={`flex-1 min-w-0 truncate ${top ? 'text-xl font-semibold text-ink-title' : 'text-lg text-ink'}`}
          >
            {node.name}
          </span>
        </button>
        {nested && !top && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} folders in ${node.name}`}
            onClick={() => setOpen((o) => !o)}
            className={`flex-shrink-0 w-[4.5rem] ${SECONDARY_BUTTON}`}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {open &&
        node.children.map((child) => (
          <FolderRow
            key={child.path}
            node={child}
            depth={depth + 1}
            included={included}
            onToggle={onToggle}
          />
        ))}
    </>
  )
}

/** One card per top-level folder of the open outputs folder, each subfolder a checkbox row */
export function FolderChooser({ workspace }: { workspace: Workspace }) {
  const { folders, includedFolders, setIncludedFolders } = workspace
  if (folders.length === 0) {
    return (
      <div className="glass">
        <ListEmpty>This folder has no subfolders with results.</ListEmpty>
      </div>
    )
  }
  const toggle = (path: string) => setIncludedFolders(toggleFolder(folders, includedFolders, path))
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 items-start gap-4 sm:gap-5">
      {folders.map((node) => (
        <section key={node.path} className="glass flex flex-col min-w-0 divide-y divide-hairline">
          <FolderRow node={node} depth={0} included={includedFolders} onToggle={toggle} />
        </section>
      ))}
    </div>
  )
}

/** Header buttons that pick every folder or none */
export function FolderBulkActions({ workspace }: { workspace: Workspace }) {
  const { folders, setIncludedFolders } = workspace
  if (folders.length === 0) return null
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" onClick={() => setIncludedFolders(allFolders(folders))}>
        Show all
      </Button>
      <Button variant="secondary" onClick={() => setIncludedFolders([])}>
        Show none
      </Button>
    </div>
  )
}

export function FoldersPage({ workspace }: { workspace: Workspace }) {
  const open = workspace.dirName !== null && !workspace.loadingDir
  return (
    <div className="flex flex-col gap-6 sm:gap-8 py-4 sm:py-8">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink-title">
          Folders
        </h1>
        {open && <FolderBulkActions workspace={workspace} />}
      </header>
      {workspace.loadingDir ? (
        <div className={`glass px-6 py-10 flex justify-center ${MOTION.enterFade}`}>
          <Loading label="Loading folders" />
        </div>
      ) : open ? (
        <FolderChooser workspace={workspace} />
      ) : (
        <NoFolder what="its folders" onOpen={workspace.openFolder} />
      )}
    </div>
  )
}
