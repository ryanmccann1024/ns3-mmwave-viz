// Shared chart grammar: recessive hairline grid and axes, readable ink-2 tick text.
// Tick text gets an explicit fill and no stroke; an axis-level stroke would outline the glyphs.

export const INK_2 = '#37455e'
export const GRID = 'rgba(10,19,36,0.07)'
const AXIS_LINE = 'rgba(10,19,36,0.15)'

export const AXIS = {
  tick: { fill: INK_2, fontSize: 13, stroke: 'none' },
  tickLine: false,
  axisLine: { stroke: AXIS_LINE },
  stroke: AXIS_LINE,
} as const

/** Axis title text, matching tick text one step quieter */
export const AXIS_LABEL = { fontSize: 13, fill: INK_2, stroke: 'none' } as const
