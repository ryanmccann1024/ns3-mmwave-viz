/** Node paths (sim x/y/z) from positions.csv, thinned for a small card illustration */
export type Point3 = [number, number, number]

export function parseTracks(csv: string, maxPointsPerNode = 40): Point3[][] {
  const lines = csv.split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.trim())
  const [idCol, xCol, yCol, zCol] = ['node_id', 'x', 'y', 'z'].map((k) => header.indexOf(k))
  if (idCol < 0 || xCol < 0 || yCol < 0) return []

  const byNode = new Map<string, Point3[]>()
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    const p: Point3 = [Number(cells[xCol]), Number(cells[yCol]), zCol < 0 ? 0 : Number(cells[zCol])]
    if (!p.every(Number.isFinite)) continue
    let track = byNode.get(cells[idCol])
    if (!track) byNode.set(cells[idCol], (track = []))
    const last = track[track.length - 1]
    if (!last || last.some((v, k) => v !== p[k])) track.push(p)
  }
  return [...byNode.values()].map((track) => {
    if (track.length <= maxPointsPerNode) return track
    const step = (track.length - 1) / (maxPointsPerNode - 1)
    return Array.from({ length: maxPointsPerNode }, (_, i) => track[Math.round(i * step)])
  })
}
