import { computeJammerField } from './jammerField'
import type { FieldContext, FieldGrid, LiveJammer } from './jammerField'

/** One or more horizontal layers of the jamming map, at the given receiver heights */
export interface FieldRequest {
  id: number
  live: LiveJammer[]
  ctx: FieldContext
  heights: number[]
  grid: FieldGrid
}

/** The layers in request order, each row-major over the grid, back to back */
export interface FieldResponse {
  id: number
  overNoiseDb: Float32Array
  counted: Float32Array
}

// A full map takes tens of milliseconds, so it is computed off the render thread
self.onmessage = (event: MessageEvent<FieldRequest>) => {
  const { id, live, ctx, heights, grid } = event.data
  const n = grid.nx * grid.ny
  const overNoiseDb = new Float32Array(n * heights.length)
  const counted = new Float32Array(n * heights.length)
  heights.forEach((h, k) => {
    const layer = computeJammerField(live, ctx, h, grid)
    overNoiseDb.set(layer.overNoiseDb, k * n)
    counted.set(layer.counted, k * n)
  })
  const response: FieldResponse = { id, overNoiseDb, counted }
  const scope = self as unknown as { postMessage(m: FieldResponse, t: Transferable[]): void }
  scope.postMessage(response, [overNoiseDb.buffer, counted.buffer])
}
