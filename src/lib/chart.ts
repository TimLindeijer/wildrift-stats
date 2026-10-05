import { isoToDay } from '../shared/dates.ts'
import type { HistoryPoint, Patch } from '../shared/types.ts'
import { formatShortDate } from './format.ts'

export const METRICS = ['win', 'pick', 'ban', 'score'] as const
export type Metric = (typeof METRICS)[number]

export const METRIC_LABELS: Record<Metric, string> = {
  win: 'Win rate',
  pick: 'Pick rate',
  ban: 'Ban rate',
  score: 'Tier score',
}

const METRIC_INDEX = { win: 1, pick: 2, ban: 3, score: 4 } as const

export function isMetric(value: unknown): value is Metric {
  return typeof value === 'string' && (METRICS as readonly string[]).includes(value)
}

/** "51.2%" for rates, "62.4" for the 0–100 tier score. */
export function formatMetric(value: number | null | undefined, metric: Metric): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return metric === 'score' ? value.toFixed(1) : `${value.toFixed(1)}%`
}

/** Trend charts need this many daily snapshots before they show a line instead of the empty state. */
export const MIN_CHART_POINTS = 3

export interface ChartPoint {
  /** Days since 1970-01-01 (numeric x axis, so patch markers can fall between snapshots). */
  day: number
  date: string
  value: number
}

export function metricSeries(points: readonly HistoryPoint[] | undefined, metric: Metric): ChartPoint[] {
  const index = METRIC_INDEX[metric]
  return (points ?? []).map((point) => ({ day: isoToDay(point[0]), date: point[0], value: point[index] }))
}

/** A one-sentence text alternative for a trend line. */
export function seriesSummary(points: readonly ChartPoint[], metric: Metric): string {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return `No ${METRIC_LABELS[metric].toLowerCase()} history yet.`
  const values = points.map((point) => point.value)
  const range = `low ${formatMetric(Math.min(...values), metric)}, high ${formatMetric(Math.max(...values), metric)}`
  const count = `${points.length} ${points.length === 1 ? 'snapshot' : 'snapshots'}`
  return `${METRIC_LABELS[metric]} went from ${formatMetric(first.value, metric)} on ${formatShortDate(first.date)} to ${formatMetric(last.value, metric)} on ${formatShortDate(last.date)} (${range}; ${count}).`
}

/**
 * At most `maxTicks` whole-day ticks between minDay and maxDay, evenly spaced and always
 * including the newest day, so the latest snapshot is labelled.
 */
export function dateTicks(minDay: number, maxDay: number, maxTicks = 6): number[] {
  if (maxDay < minDay) return []
  const step = Math.max(1, Math.ceil((maxDay - minDay) / Math.max(1, maxTicks - 1)))
  const ticks: number[] = []
  for (let day = maxDay; day >= minDay; day -= step) ticks.push(day)
  return ticks.reverse()
}

export interface PatchMarker {
  day: number
  version: string
}

/** Patches released inside the charted range. */
export function patchMarkers(patches: readonly Patch[], minDay: number, maxDay: number): PatchMarker[] {
  return patches
    .map((patch) => ({ day: isoToDay(patch.date), version: patch.version }))
    .filter((marker) => marker.day >= minDay && marker.day <= maxDay)
}

export interface DomainOptions {
  /** Values that must be visible, e.g. the 50% win-rate line. */
  include?: readonly number[]
  /** Smallest span, so a flat line isn't blown up into noise. */
  minSpan?: number
  min?: number
  max?: number
}

/** A y-axis range with some headroom, rounded outward to whole numbers. */
export function paddedDomain(values: readonly number[], options: DomainOptions = {}): [number, number] {
  const { include = [], minSpan = 2, min = 0, max = 100 } = options
  const all = [...values, ...include].filter(Number.isFinite)
  if (all.length === 0) return [min, max]
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  const pad = Math.max((hi - lo) * 0.1, (minSpan - (hi - lo)) / 2, 0.5)
  lo = Math.max(min, Math.floor(lo - pad))
  hi = Math.min(max, Math.ceil(hi + pad))
  return [lo, hi]
}

const NICE_STEPS = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50] as const

export interface ValueAxis {
  domain: [number, number]
  ticks: number[]
}

/**
 * Evenly spaced value-axis ticks. Picks the finest "nice" step that needs at most `maxTicks`
 * ticks and widens the domain to multiples of it, so ticks never bunch up at an edge.
 * Every step divides 100, so clamping to 0–100 keeps the ticks aligned.
 */
export function niceAxis([lo, hi]: readonly [number, number], maxTicks = 6): ValueAxis {
  const fits = (step: number) => Math.ceil(hi / step) - Math.floor(lo / step) + 1 <= maxTicks
  const step = NICE_STEPS.find(fits) ?? 50
  const start = Math.max(0, Math.floor(lo / step) * step)
  const end = Math.min(100, Math.max(Math.ceil(hi / step) * step, start + step))
  const ticks: number[] = []
  for (let i = 0; start + i * step <= end + 1e-9; i++) ticks.push(Math.round((start + i * step) * 100) / 100)
  return { domain: [start, end], ticks }
}

/** Rows for a multi-line chart: one per day, with a `s<index>` value per series that has that day. */
export function mergeSeries(series: readonly (readonly ChartPoint[])[]): Record<string, number>[] {
  const byDay = new Map<number, Record<string, number>>()
  series.forEach((points, index) => {
    for (const point of points) {
      let row = byDay.get(point.day)
      if (!row) byDay.set(point.day, (row = { day: point.day }))
      row[seriesKey(index)] = point.value
    }
  })
  return [...byDay.values()].sort((a, b) => a.day! - b.day!)
}

export function seriesKey(index: number): string {
  return `s${index}`
}
