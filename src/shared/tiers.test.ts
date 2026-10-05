import { describe, expect, it } from 'vitest'
import { percentileRanks, scoreRows, TIER_THRESHOLDS, TIER_WEIGHTS, tierForScore, tierIndex } from './tiers.ts'

describe('TIER_WEIGHTS', () => {
  it('sums to 1 so scores span 0–100', () => {
    expect(TIER_WEIGHTS.win + TIER_WEIGHTS.pick + TIER_WEIGHTS.ban).toBeCloseTo(1)
  })
})

describe('percentileRanks', () => {
  it('ranks from 0 to 1 and averages ties', () => {
    expect(percentileRanks([50, 52, 48])).toEqual([0.5, 1, 0])
    expect(percentileRanks([1, 2, 2, 3])).toEqual([0, 0.5, 0.5, 1])
  })

  it('handles empty and single inputs', () => {
    expect(percentileRanks([])).toEqual([])
    expect(percentileRanks([51])).toEqual([0.5])
  })
})

describe('scoreRows', () => {
  it('weights win, pick and ban percentiles', () => {
    const scores = scoreRows([
      { win: 55, pick: 10, ban: 30 },
      { win: 50, pick: 5, ban: 5 },
      { win: 45, pick: 1, ban: 1 },
    ])
    expect(scores).toEqual([100, 50, 0])
  })

  it('lets win rate dominate', () => {
    const [highWin, popular] = scoreRows([
      { win: 56, pick: 2, ban: 1 },
      { win: 48, pick: 15, ban: 40 },
    ])
    expect(highWin).toBe(60)
    expect(popular).toBe(40)
  })
})

describe('tierForScore', () => {
  it('maps scores to tiers at the documented thresholds', () => {
    expect(TIER_THRESHOLDS.map(([, min]) => tierForScore(min))).toEqual(['S+', 'S', 'A', 'B', 'C', 'D'])
    expect(tierForScore(100)).toBe('S+')
    expect(tierForScore(79.9)).toBe('S')
    expect(tierForScore(19.9)).toBe('D')
    expect(tierForScore(0)).toBe('D')
  })

  it('orders tiers best first', () => {
    expect(tierIndex('S+')).toBe(0)
    expect(tierIndex('D')).toBe(5)
  })
})
