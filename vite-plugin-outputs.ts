import type { Plugin } from 'vite'
import fs from 'fs'
import path from 'path'
import { isCatalogFile } from './src/lib/resultCatalog.ts'

/**
 * Read-only dev helper for the simulator outputs directory.
 *
 * GET /api/outputs  → JSON array of relative file paths (bounded, filtered)
 * GET /outputs/...  → a single regular file inside the outputs root
 */

export const LIST_LIMIT = 50_000

/** Lists reader-relevant files under root. Symlinks are never followed. */
export function listOutputs(
  root: string,
  limit = LIST_LIMIT
): { paths: string[]; truncated: boolean } {
  const paths: string[] = []
  let truncated = false

  function walk(dir: string, segments: string[]): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      if (truncated) return
      const next = [...segments, entry.name]
      // Dirent types come from lstat, so symlinks match neither branch
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue
        walk(path.join(dir, entry.name), next)
      } else if (entry.isFile() && isCatalogFile(next)) {
        if (paths.length >= limit) {
          truncated = true
          return
        }
        paths.push(next.join('/'))
      }
    }
  }

  walk(root, [])
  return { paths, truncated }
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  if (rel === '' || path.isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith(`..${path.sep}`)
}

export type ServedPath = { status: 200; file: string } | { status: 400 | 403 | 404 }

/** Maps the raw (still encoded) path after `/outputs/` to a real file inside root. */
export function resolveServedPath(root: string, rawRelPath: string): ServedPath {
  let decoded: string
  try {
    decoded = decodeURIComponent(rawRelPath.split('?')[0])
  } catch {
    return { status: 400 }
  }
  if (decoded === '' || decoded.includes('\0')) return { status: 400 }

  const target = path.resolve(root, decoded)
  if (!isInside(root, target)) return { status: 403 }

  let realRoot: string
  let realTarget: string
  try {
    realRoot = fs.realpathSync(root)
    realTarget = fs.realpathSync(target)
  } catch {
    return { status: 404 }
  }
  // A symlink inside the root must not lead outside it
  if (!isInside(realRoot, realTarget)) return { status: 403 }

  try {
    if (!fs.statSync(realTarget).isFile()) return { status: 404 }
  } catch {
    return { status: 404 }
  }
  return { status: 200, file: realTarget }
}

export function mimeFor(file: string): string {
  const ext = path.extname(file)
  if (ext === '.csv') return 'text/csv'
  if (ext === '.json') return 'application/json'
  if (ext === '.jsonl') return 'application/x-ndjson'
  return 'application/octet-stream'
}

export default function outputsPlugin(): Plugin {
  // Resolve once at startup — the ns-3 repo sits next to this viz repo
  const ns3Root = path.resolve(__dirname, '..', 'ns3-mmwave')
  const outputsDir = path.join(ns3Root, 'scratch', 'mesh-sim', 'outputs')

  return {
    name: 'outputs-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        const isList = pathname === '/api/outputs'
        if (!isList && !pathname.startsWith('/outputs/')) return next()

        const head = req.method === 'HEAD'
        if (req.method !== 'GET' && !head) {
          res.statusCode = 405
          res.setHeader('Allow', 'GET, HEAD')
          res.end('Method not allowed')
          return
        }

        if (isList) {
          const { paths, truncated } = listOutputs(outputsDir)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('X-Outputs-Truncated', String(truncated))
          res.end(head ? undefined : JSON.stringify(paths))
          return
        }

        const served = resolveServedPath(outputsDir, pathname.slice('/outputs/'.length))
        if (served.status !== 200) {
          res.statusCode = served.status
          res.end(
            served.status === 400
              ? 'Bad request'
              : served.status === 403
                ? 'Forbidden'
                : 'Not found'
          )
          return
        }
        res.setHeader('Content-Type', mimeFor(served.file))
        if (head) {
          res.end()
          return
        }
        const stream = fs.createReadStream(served.file)
        stream.on('error', () => {
          if (!res.headersSent) res.statusCode = 404
          res.end()
        })
        stream.pipe(res)
      })
    },
  }
}
