import { describe, expect, it } from 'vitest'
import type { LatestFile, LatestRow } from '../shared/types.ts'
import { compareSlugs, isCompareLane, mostPicked } from './compare.ts'

const row = (heroId: number, pick: number): LatestRow => ({
  heroId,
  win: 50,
  pick,
  ban: 1,
  tier: 'A',
  score: 55,
  cnRank: null,
  cnTier: null,
  dWin: null,
  dPick: null,
  dBan: null,
  prevTier: null,
})

describe('isCompareLane', () => {
  it('accepts "main" and the five lanes', () => {
    expect(isCompareLane('main')).toBe(true)
    expect(isCompareLane('duo')).toBe(true)
    expect(isCompareLane('any')).toBe(false)
    expect(isCompareLane(null)).toBe(false)
  })
})

describe('compareSlugs', () => {
  const known = new Set(['garen', 'ahri', 'kaisa', 'lux'])
  const isKnown = (slug: string) => known.has(slug)

  it('keeps known slugs in order, lower-cased and de-duplicated', () => {
    expect(compareSlugs(['Garen', 'nope', 'ahri', 'garen'], isKnown, 6)).toEqual(['garen', 'ahri'])
  })

  it('stops at the maximum', () => {
    expect(compareSlugs(['garen', 'ahri', 'kaisa', 'lux'], isKnown, 3)).toEqual(['garen', 'ahri', 'kaisa'])
  })
})

describe('mostPicked', () => {
  const latest: LatestFile = {
    schema: 1,
    date: '2026-10-05',
    previousDate: null,
    fetchedAt: '',
    dates: ['2026-10-05'],
    brackets: {
      all: {
        baron: [row(1, 4), row(2, 9)],
        mid: [row(1, 12), row(3, 9)],
        support: [row(4, 2)],
      },
    },
  }

  it('ranks champions by their highest pick rate in any lane', () => {
    expect(mostPicked(latest, 'all', 3)).toEqual([1, 2, 3])
    expect(mostPicked(latest, 'all', 10)).toEqual([1, 2, 3, 4])
  })

  it('only counts the given lane when one is set', () => {
    expect(mostPicked(latest, 'all', 10, 'baron')).toEqual([2, 1])
    expect(mostPicked(latest, 'all', 10, 'jungle')).toEqual([])
  })

  it('returns nothing for an empty bracket', () => {
    expect(mostPicked(latest, 'legendary', 5)).toEqual([])
  })
})
