/**
 * Colours used inside SVG charts. Recharts writes them as presentation attributes, where CSS
 * custom properties aren't reliable, so they mirror the tokens in index.css by value.
 */
export const CHART = {
  /** Single-series line (Hextech gold). */
  line: '#e2b964',
  grid: '#1c2840',
  axis: '#2c3b58',
  tick: '#a3acbd',
  /** The 50% win-rate reference line. */
  reference: '#8691a5',
  patch: '#8691a5',
  patchLabel: '#c8cfdb',
  cursor: '#3a4b6b',
  background: '#0b1220',
} as const

/** Compare-chart series, in the order champions are added. Distinct in hue and lightness. */
export const SERIES_COLORS = ['#e2b964', '#3fcfb4', '#ff7d6b', '#a896ff', '#5fb4f5', '#b7d36b'] as const

export const MAX_COMPARE = SERIES_COLORS.length
