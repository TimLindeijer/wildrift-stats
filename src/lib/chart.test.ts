import { describe, expect, it } from 'vitest'
import { isoToDay } from '../shared/dates.ts'
import type { HistoryPoint } from '../shared/types.ts'
import { dateTicks, formatMetric, mergeSeries, metricSeries, niceAxis, paddedDomain, patchMarkers, seriesSummary } from './chart.ts'

describe('metricSeries', () => {
  it('picks one metric and converts dates to day numbers', () => {
    const points: HistoryPoint[] = [
      ['2026-10-04', 51.2, 8.1, 3.4, 62.5],
      ['2026-10-05', 51.6, 8.0, 3.1, 64.0],
    ]
    expect(metricSeries(points, 'pick')).toEqual([
      { day: isoToDay('2026-10-04'), date: '2026-10-04', value: 8.1 },
      { day: isoToDay('2026-10-05'), date: '2026-10-05', value: 8.0 },
    ])
    expect(metricSeries(points, 'score').map((p) => p.value)).toEqual([62.5, 64])
    expect(metricSeries(undefined, 'win')).toEqual([])
  })
})

describe('seriesSummary', () => {
  it('describes the first, last, lowest and highest values', () => {
    const points: HistoryPoint[] = [
      ['2026-10-04', 51.2, 8.1, 3.4, 62.5],
      ['2026-10-05', 49.8, 8.0, 3.1, 64.0],
      ['2026-10-06', 52.04, 8.0, 3.1, 64.0],
    ]
    expect(seriesSummary(metricSeries(points, 'win'), 'win')).toBe(
      'Win rate went from 51.2% on Oct 4 to 52.0% on Oct 6 (low 49.8%, high 52.0%; 3 snapshots).',
    )
    expect(seriesSummary(metricSeries(points.slice(0, 1), 'score'), 'score')).toBe(
      'Tier score went from 62.5 on Oct 4 to 62.5 on Oct 4 (low 62.5, high 62.5; 1 snapshot).',
    )
  })

  it('says when there is nothing to describe', () => {
    expect(seriesSummary([], 'ban')).toBe('No ban rate history yet.')
  })
})

describe('formatMetric', () => {
  it('formats rates as percentages and the score as a plain number', () => {
    expect(formatMetric(51.234, 'win')).toBe('51.2%')
    expect(formatMetric(62.46, 'score')).toBe('62.5')
    expect(formatMetric(null, 'ban')).toBe('—')
  })
})

describe('dateTicks', () => {
  it('labels every day of a short range', () => {
    expect(dateTicks(10, 13)).toEqual([10, 11, 12, 13])
  })

  it('spaces ticks evenly and always includes the newest day', () => {
    const ticks = dateTicks(0, 100, 6)
    expect(ticks.at(-1)).toBe(100)
    expect(ticks.length).toBeLessThanOrEqual(6)
    expect(ticks.every((t, i) => i === 0 || t - ticks[i - 1]! === 20)).toBe(true)
    expect(dateTicks(5, 4)).toEqual([])
  })
})

describe('patchMarkers', () => {
  it('keeps patches inside the range only', () => {
    const patches = [
      { version: '7.3', date: '2026-09-21' },
      { version: '7.3a', date: '2026-09-29' },
    ]
    expect(patchMarkers(patches, isoToDay('2026-09-25'), isoToDay('2026-10-05'))).toEqual([
      { day: isoToDay('2026-09-29'), version: '7.3a' },
    ])
  })
})

describe('paddedDomain', () => {
  it('pads and rounds outward', () => {
    expect(paddedDomain([50.2, 53.9])).toEqual([49, 55])
  })

  it('includes required values and enforces a minimum span', () => {
    expect(paddedDomain([55.1, 55.3], { include: [50] })).toEqual([49, 56])
    expect(paddedDomain([3, 3], { minSpan: 4 })).toEqual([1, 5])
  })

  it('clamps to the allowed range and survives empty input', () => {
    expect(paddedDomain([0.4, 1.2])).toEqual([0, 2])
    expect(paddedDomain([])).toEqual([0, 100])
  })
})

describe('niceAxis', () => {
  it('uses the finest step that fits and keeps ticks evenly spaced', () => {
    expect(niceAxis([48, 53], 6)).toEqual({ domain: [48, 53], ticks: [48, 49, 50, 51, 52, 53] })
    expect(niceAxis([48, 53], 5)).toEqual({ domain: [48, 54], ticks: [48, 50, 52, 54] })
    expect(niceAxis([0, 2], 5)).toEqual({ domain: [0, 2], ticks: [0, 0.5, 1, 1.5, 2] })
  })

  it('switches to coarser steps for wide ranges and stays within 0–100', () => {
    expect(niceAxis([37, 81], 6)).toEqual({ domain: [20, 100], ticks: [20, 40, 60, 80, 100] })
    expect(niceAxis([0, 100], 5).ticks).toEqual([0, 25, 50, 75, 100])
    expect(niceAxis([99, 100], 2)).toEqual({ domain: [99, 100], ticks: [99, 100] })
  })

  it('never returns an empty range', () => {
    expect(niceAxis([5, 5], 5)).toEqual({ domain: [5, 5.5], ticks: [5, 5.5] })
  })
})

describe('mergeSeries', () => {
  it('joins series by day and leaves gaps where a series has no point', () => {
    const a = [
      { day: 2, date: '', value: 50 },
      { day: 3, date: '', value: 51 },
    ]
    const b = [
      { day: 1, date: '', value: 48 },
      { day: 3, date: '', value: 49 },
    ]
    expect(mergeSeries([a, b])).toEqual([
      { day: 1, s1: 48 },
      { day: 2, s0: 50 },
      { day: 3, s0: 51, s1: 49 },
    ])
  })
})
