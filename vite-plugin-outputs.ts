import { Plugin } from 'vite'
import fs from 'fs'
import path from 'path'

/**
 * Vite plugin that serves ns-3 simulation output files and provides a
 * directory listing API so the browser can auto-discover runs without
 * requiring File System Access permission prompts.
 *
 * GET /api/outputs  → JSON array of relative file paths
 * GET /outputs/...  → static file serving
 */
export default function outputsPlugin(): Plugin {
  // Resolve once at startup — the ns-3 repo sits next to this viz repo
  const ns3Root = path.resolve(__dirname, '..', 'ns3-mmwave')
  const outputsDir = path.join(ns3Root, 'scratch', 'mesh-sim', 'outputs')

  function walk(dir: string, prefix = ''): string[] {
    const results: string[] = []
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return results
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        results.push(...walk(path.join(dir, entry.name), rel))
      } else if (
        entry.name === 'links.csv' ||
        entry.name === 'positions.csv' ||
        (entry.name.startsWith('buildings') && entry.name.endsWith('.json')) ||
        entry.name === 'flows.csv' ||
        entry.name === 'routes.csv' ||
        entry.name === 'mcs.csv' ||
        entry.name === 'rx-power.csv' ||
        entry.name === 'nodes.json' ||
        entry.name === 'summary.json'
      ) {
        results.push(rel)
      }
    }
    return results
  }

  return {
    name: 'outputs-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/outputs') {
          const files = walk(outputsDir)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(files))
          return
        }

        if (req.url?.startsWith('/outputs/')) {
          const relPath = decodeURIComponent(req.url.slice('/outputs/'.length))
          const absPath = path.join(outputsDir, relPath)

          // Prevent path traversal
          if (!absPath.startsWith(outputsDir)) {
            res.statusCode = 403
            res.end('Forbidden')
            return
          }

          try {
            const stat = fs.statSync(absPath)
            if (stat.isFile()) {
              const ext = path.extname(absPath)
              const mime =
                ext === '.csv'
                  ? 'text/csv'
                  : ext === '.json'
                    ? 'application/json'
                    : 'application/octet-stream'
              res.setHeader('Content-Type', mime)
              fs.createReadStream(absPath).pipe(res)
              return
            }
          } catch {
            // fall through to 404
          }

          res.statusCode = 404
          res.end('Not found')
          return
        }

        next()
      })
    },
  }
}
