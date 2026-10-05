/**
 * Tier formula. Pure and shared: the data build uses it to score champions and the About page
 * renders the same constants, so the documentation can't drift from the code.
 *
 * Within one bracket and lane, every listed champion gets a percentile (0–1) for win rate,
 * pick rate and ban rate. The score is a weighted sum of those percentiles scaled to 0–100,
 * and the tier follows from fixed score thresholds.
 */
import { TIERS, type Tier } from './types.ts'

export const TIER_WEIGHTS = { win: 0.6, pick: 0.25, ban: 0.15 } as const

/** Minimum score for each tier, best first. Anything below the last threshold is D. */
export const TIER_THRESHOLDS: readonly (readonly [Tier, number])[] = [
  ['S+', 80],
  ['S', 65],
  ['A', 50],
  ['B', 35],
  ['C', 20],
  ['D', 0],
]

/**
 * Percentile rank of each value among `values`, 0 (lowest) to 1 (highest).
 * Ties share their average rank; a single value gets 0.5.
 */
export function percentileRanks(values: readonly number[]): number[] {
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [0.5]
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const ranks = new Array<number>(n)
  for (let start = 0; start < n; ) {
    let end = start
    while (end + 1 < n && order[end + 1]!.value === order[start]!.value) end++
    const rank = (start + end) / 2 / (n - 1)
    for (let k = start; k <= end; k++) ranks[order[k]!.index] = rank
    start = end + 1
  }
  return ranks
}

export interface RateTriple {
  win: number
  pick: number
  ban: number
}

/** Tier scores (0–100, one decimal) for the champions of one bracket and lane. */
export function scoreRows(rows: readonly RateTriple[]): number[] {
  const win = percentileRanks(rows.map((row) => row.win))
  const pick = percentileRanks(rows.map((row) => row.pick))
  const ban = percentileRanks(rows.map((row) => row.ban))
  return rows.map((_, i) => {
    const score = TIER_WEIGHTS.win * win[i]! + TIER_WEIGHTS.pick * pick[i]! + TIER_WEIGHTS.ban * ban[i]!
    return Math.round(score * 1000) / 10
  })
}

export function tierForScore(score: number): Tier {
  for (const [tier, min] of TIER_THRESHOLDS) if (score >= min) return tier
  return 'D'
}

/** Sort key: 0 for S+ … 5 for D. */
export function tierIndex(tier: Tier): number {
  return TIERS.indexOf(tier)
}
