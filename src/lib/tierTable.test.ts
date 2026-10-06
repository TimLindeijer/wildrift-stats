import { describe, expect, it } from 'vitest'
import type { LatestFile, LatestRow, PublicChampion } from '../shared/types.ts'
import { nextSort } from './sort.ts'
import { DEFAULT_SORT_DIR, groupByTier, sortTierRows, tierRows, type TierTableRow } from './tierTable.ts'

function row(heroId: number, score: number, extra: Partial<LatestRow> = {}): LatestRow {
  return {
    heroId,
    win: 50,
    pick: 5,
    ban: 1,
    tier: score >= 65 ? 'S' : 'B',
    score,
    cnRank: null,
    cnTier: null,
    dWin: null,
    dPick: null,
    dBan: null,
    prevTier: null,
    ...extra,
  }
}

const champions: PublicChampion[] = [
  { heroId: 1, slug: 'garen', name: 'Garen', title: null, nameZh: '盖伦', avatar: '', lanes: ['baron'], roles: [], ratings: null },
  { heroId: 2, slug: 'ahri', name: 'Ahri', title: null, nameZh: '阿狸', avatar: '', lanes: ['mid'], roles: [], ratings: null },
]
const byId = (id: number) => champions.find((c) => c.heroId === id)

const latest: LatestFile = {
  schema: 1,
  date: '2026-10-05',
  previousDate: '2026-10-04',
  fetchedAt: '2026-10-06T02:41:00Z',
  dates: ['2026-10-04', '2026-10-05'],
  brackets: {
    all: {
      baron: [row(1, 70, { win: 52, dWin: 1.2, cnTier: 1, cnRank: 3 }), row(3, 40, { win: 48 })],
      mid: [row(2, 66, { win: 53, dWin: -0.5, cnTier: 0, cnRank: 1 }), row(1, 20, { win: 47, dWin: 0.1 })],
    },
  },
}

describe('tierRows', () => {
  it('flattens every lane when the filter is "any"', () => {
    const rows = tierRows(latest, 'all', 'any', byId)
    expect(rows.map((r) => r.key)).toEqual(['baron:1', 'baron:3', 'mid:2', 'mid:1'])
    expect(rows[1]!.name).toBe('Hero 3')
    expect(rows[1]!.slug).toBeNull()
  })

  it('returns one lane, or nothing for a missing bracket', () => {
    expect(tierRows(latest, 'all', 'mid', byId).map((r) => r.name)).toEqual(['Ahri', 'Garen'])
    expect(tierRows(latest, 'legendary', 'any', byId)).toEqual([])
  })
})

describe('sortTierRows', () => {
  const rows: TierTableRow[] = tierRows(latest, 'all', 'any', byId)

  it('sorts by score for the tier column', () => {
    expect(sortTierRows(rows, 'tier', 'desc').map((r) => r.key)).toEqual(['baron:1', 'mid:2', 'baron:3', 'mid:1'])
    expect(sortTierRows(rows, 'tier', 'asc').map((r) => r.key)).toEqual(['mid:1', 'baron:3', 'mid:2', 'baron:1'])
  })

  it('puts missing values last in both directions', () => {
    expect(sortTierRows(rows, 'dWin', 'desc').map((r) => r.key)).toEqual(['baron:1', 'mid:1', 'mid:2', 'baron:3'])
    expect(sortTierRows(rows, 'dWin', 'asc').map((r) => r.key)).toEqual(['mid:2', 'mid:1', 'baron:1', 'baron:3'])
    expect(sortTierRows(rows, 'cn', 'asc').map((r) => r.key)).toEqual(['mid:2', 'baron:1', 'baron:3', 'mid:1'])
  })

  it('sorts names alphabetically and breaks ties by score', () => {
    expect(sortTierRows(rows, 'name', 'asc').map((r) => r.key)).toEqual(['mid:2', 'baron:1', 'mid:1', 'baron:3'])
  })

  it('does not mutate its input', () => {
    const before = rows.map((r) => r.key)
    sortTierRows(rows, 'win', 'asc')
    expect(rows.map((r) => r.key)).toEqual(before)
  })
})

describe('nextSort with the tier-table defaults', () => {
  it('flips the active column and starts others at their default', () => {
    expect(nextSort({ key: 'win', dir: 'desc' }, 'win', DEFAULT_SORT_DIR)).toEqual({ key: 'win', dir: 'asc' })
    expect(nextSort({ key: 'win', dir: 'asc' }, 'name', DEFAULT_SORT_DIR)).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort({ key: 'name', dir: 'asc' }, 'pick', DEFAULT_SORT_DIR)).toEqual({ key: 'pick', dir: 'desc' })
  })
})

describe('groupByTier', () => {
  it('groups consecutive rows', () => {
    const groups = groupByTier([{ tier: 'S' }, { tier: 'S' }, { tier: 'B' }, { tier: 'S' }] as const)
    expect(groups.map((g) => [g.tier, g.rows.length])).toEqual([
      ['S', 2],
      ['B', 1],
      ['S', 1],
    ])
  })
})
