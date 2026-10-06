import { describe, expect, it } from 'vitest'
import type { LatestFile, LatestRow } from '../shared/types.ts'
import { eloDiff, eloRows, flexPicks, presenceFor, presenceRows, roleSplitText, roundShares, splitElo, type EloItem } from './insights.ts'

function row(heroId: number, pick: number, ban: number, win = 50): LatestRow {
  return {
    heroId,
    win,
    pick,
    ban,
    tier: 'B',
    score: 50,
    cnRank: null,
    cnTier: null,
    dWin: null,
    dPick: null,
    dBan: null,
    prevTier: null,
  }
}

const latest: LatestFile = {
  schema: 1,
  date: '2026-10-05',
  previousDate: null,
  fetchedAt: '2026-10-06T02:41:00Z',
  dates: ['2026-10-05'],
  brackets: {
    all: {
      jungle: [row(1, 10, 4, 52), row(3, 20, 1, 49)],
      mid: [row(2, 30, 5, 51.12), row(1, 10, 4, 50), row(4, 1.5, 0.5, 49), row(6, 0.1, 0)],
      duo: [row(2, 2.5, 5, 47)],
      support: [row(6, 0.2, 0)],
    },
    master: {
      jungle: [row(1, 8, 6, 52), row(3, 1.8, 2, 60)],
      mid: [row(1, 12, 6, 53), row(2, 25, 3, 48.88), row(4, 3, 1, 55)],
      duo: [row(5, 5, 1, 50)],
    },
  },
}

describe('presenceRows', () => {
  const rows = presenceRows(latest, 'all')

  it('adds up lane pick rates and the champion-wide ban rate, most contested first', () => {
    expect(rows.map((r) => [r.heroId, r.pick, r.ban, r.presence])).toEqual([
      [2, 32.5, 5, 37.5],
      [1, 20, 4, 24],
      [3, 20, 1, 21],
      [4, 1.5, 0.5, 2],
      [6, 0.3, 0, 0.3],
    ])
  })

  it('lists lanes by pick rate with their share of the champion’s games', () => {
    const [first, second] = rows[0]!.lanes
    expect(first!.lane).toBe('mid')
    expect(first!.share).toBeCloseTo(92.31, 2)
    expect(second!.lane).toBe('duo')
    expect(second!.share).toBeCloseTo(7.69, 2)
  })

  it('breaks lane ties in role order', () => {
    expect(rows[1]!.lanes.map((l) => [l.lane, l.share])).toEqual([
      ['jungle', 50],
      ['mid', 50],
    ])
  })

  it('returns nothing for a missing bracket', () => {
    expect(presenceRows(latest, 'legendary')).toEqual([])
  })
})

describe('presenceFor', () => {
  it('matches the bracket-wide rows', () => {
    expect(presenceFor(latest, 'all', 1)).toEqual(presenceRows(latest, 'all').find((r) => r.heroId === 1))
  })

  it('is null for a champion that isn’t listed', () => {
    expect(presenceFor(latest, 'all', 5)).toBeNull()
    expect(presenceFor(latest, 'legendary', 1)).toBeNull()
  })
})

describe('roundShares', () => {
  it('keeps the total at 100 by rounding up the largest remainders', () => {
    expect(roundShares([50.5, 49.5])).toEqual([51, 49])
    expect(roundShares([100 / 3, 100 / 3, 100 / 3])).toEqual([34, 33, 33])
    expect(roundShares([92.3077, 7.6923])).toEqual([92, 8])
    expect(roundShares([60, 25, 15])).toEqual([60, 25, 15])
  })

  it('just rounds shares that don’t add up to 100', () => {
    expect(roundShares([10.4, 20.6])).toEqual([10, 21])
    expect(roundShares([])).toEqual([])
  })
})

describe('roleSplitText', () => {
  it('names each role with its whole-number share', () => {
    expect(roleSplitText(presenceRows(latest, 'all')[0]!.lanes)).toBe('Mid 92% · Duo 8%')
    expect(roleSplitText([{ lane: 'jungle', pick: 1, share: 100 }])).toBe('Jungle 100%')
  })
})

describe('flexPicks', () => {
  const rows = presenceRows(latest, 'all')

  it('keeps champions with a big enough second role, most evenly split first', () => {
    expect(flexPicks(rows).map((r) => r.heroId)).toEqual([1, 6])
  })

  it('takes the threshold into account', () => {
    expect(flexPicks(rows, 40).map((r) => r.heroId)).toEqual([1])
    expect(flexPicks(rows, 5).map((r) => r.heroId)).toEqual([1, 6, 2])
  })
})

describe('eloRows', () => {
  it('compares a bracket with all ranks when both pick rates are high enough', () => {
    expect(eloRows(latest, 'master').map((i) => [i.heroId, i.lane, i.diff])).toEqual([
      [1, 'mid', 3],
      [1, 'jungle', 0],
      [2, 'mid', -2.24],
    ])
  })

  it('carries both win and pick rates', () => {
    expect(eloRows(latest, 'master')[0]).toEqual({
      heroId: 1,
      lane: 'mid',
      win: 53,
      baseWin: 50,
      diff: 3,
      pick: 12,
      basePick: 10,
    })
  })

  it('lets the minimum pick rate be lowered', () => {
    expect(eloRows(latest, 'master', 1).map((i) => [i.heroId, i.lane, i.diff])).toEqual([
      [3, 'jungle', 11],
      [4, 'mid', 6],
      [1, 'mid', 3],
      [1, 'jungle', 0],
      [2, 'mid', -2.24],
    ])
  })

  it('returns nothing for all ranks or a missing bracket', () => {
    expect(eloRows(latest, 'all')).toEqual([])
    expect(eloRows(latest, 'legendary')).toEqual([])
  })
})

describe('splitElo', () => {
  function item(heroId: number, diff: number): EloItem {
    return { heroId, lane: 'mid', win: 50 + diff, baseWin: 50, diff, pick: 5, basePick: 5 }
  }

  it('splits gains and losses, biggest first, and drops zero differences', () => {
    const { better, worse } = splitElo([item(1, 5), item(2, 1), item(3, 0), item(4, -1), item(5, -3)])
    expect(better.map((i) => i.heroId)).toEqual([1, 2])
    expect(worse.map((i) => i.heroId)).toEqual([5, 4])
  })

  it('limits both lists', () => {
    const { better, worse } = splitElo(eloRows(latest, 'master', 1), 1)
    expect(better.map((i) => i.heroId)).toEqual([3])
    expect(worse.map((i) => i.heroId)).toEqual([2])
  })
})

describe('eloDiff', () => {
  it('compares one lane with all ranks', () => {
    expect(eloDiff(latest, 'master', 'mid', 1)).toEqual({ diff: 3, lowSample: false })
  })

  it('flags a low pick rate in either bracket', () => {
    expect(eloDiff(latest, 'master', 'mid', 4)).toEqual({ diff: 6, lowSample: true })
    expect(eloDiff(latest, 'master', 'jungle', 3)).toEqual({ diff: 11, lowSample: true })
  })

  it('is null for all ranks or when either row is missing', () => {
    expect(eloDiff(latest, 'all', 'mid', 1)).toBeNull()
    expect(eloDiff(latest, 'master', 'duo', 5)).toBeNull()
    expect(eloDiff(latest, 'master', 'baron', 1)).toBeNull()
  })
})
