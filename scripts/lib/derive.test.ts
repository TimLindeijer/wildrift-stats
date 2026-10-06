import { describe, expect, it } from 'vitest'
import type { BracketTable, Champion, Snapshot, SnapshotRow } from '../../src/shared/types.ts'
import {
  addDays,
  buildHistories,
  buildLatest,
  buildMovers,
  currentPatch,
  moverRows,
  parseChampions,
  parsePatches,
  publicChampions,
  scoreSnapshot,
} from './derive.ts'

const row = (heroId: number, win: number, pick: number, ban: number, strength = 1, strengthLevel = 0): SnapshotRow => ({
  heroId,
  win,
  pick,
  ban,
  strength,
  strengthLevel,
})

const snapshot = (date: string, brackets: BracketTable<SnapshotRow>): Snapshot => ({
  schema: 1,
  date,
  fetchedAt: `${addDays(date, 1)}T02:41:00Z`,
  source: 'test',
  brackets,
})

/** Three mid laners; hero 1 strongest on day one, hero 3 climbs over time. */
const day = (date: string, wins: [number, number, number]) =>
  snapshot(date, {
    all: {
      mid: [row(1, wins[0], 10, 20, 1, 0), row(2, wins[1], 5, 5, 2, 1), row(3, wins[2], 2, 1, 3, 2)],
      duo: [row(4, 50, 8, 3)],
    },
    diamond: { mid: [row(1, 51, 9, 15), row(3, 49, 3, 2)] },
  })

const d1 = day('2026-10-01', [53, 50, 47])
const d2 = day('2026-10-02', [52, 50.5, 48.25])
const d8 = day('2026-10-08', [50, 50, 54])

describe('scoreSnapshot', () => {
  it('scores each bracket and lane separately', () => {
    const scored = scoreSnapshot(d1)
    expect(scored.all?.mid?.map((r) => [r.heroId, r.score, r.tier])).toEqual([
      [1, 100, 'S+'],
      [2, 50, 'A'],
      [3, 0, 'D'],
    ])
    expect(scored.all?.duo?.[0]).toMatchObject({ heroId: 4, score: 50, tier: 'A' })
    expect(scored.diamond?.mid?.map((r) => r.score)).toEqual([100, 0])
  })
})

describe('buildLatest', () => {
  it('uses the newest snapshot and computes deltas against the one before it', () => {
    const latest = buildLatest([d1, d2])
    expect(latest).toMatchObject({ schema: 1, date: '2026-10-02', previousDate: '2026-10-01', dates: ['2026-10-01', '2026-10-02'] })
    expect(latest.fetchedAt).toBe(d2.fetchedAt)
    expect(latest.brackets.all?.mid?.[0]).toEqual({
      heroId: 1,
      win: 52,
      pick: 10,
      ban: 20,
      tier: 'S+',
      score: 100,
      cnRank: 1,
      cnTier: 0,
      dWin: -1,
      dPick: 0,
      dBan: 0,
      prevTier: 'S+',
    })
    expect(latest.brackets.all?.mid?.find((r) => r.heroId === 3)?.dWin).toBe(1.25)
  })

  it('sorts rows by score and leaves deltas null without a previous snapshot', () => {
    const latest = buildLatest([d8])
    expect(latest.previousDate).toBeNull()
    expect(latest.brackets.all?.mid?.map((r) => r.heroId)).toEqual([3, 1, 2])
    expect(latest.brackets.all?.mid?.every((r) => r.dWin === null && r.prevTier === null)).toBe(true)
  })

  it('marks champions new to a lane with null deltas', () => {
    const withNewcomer = snapshot('2026-10-03', { all: { mid: [...d2.brackets.all!.mid!, row(9, 51, 1, 0)] } })
    const latest = buildLatest([d2, withNewcomer])
    expect(latest.brackets.all?.mid?.find((r) => r.heroId === 9)).toMatchObject({ dWin: null, prevTier: null })
    expect(latest.brackets.diamond).toBeUndefined()
  })

  it('rejects an empty list', () => {
    expect(() => buildLatest([])).toThrow(/at least one snapshot/)
  })
})

describe('dates and patches', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('finds the patch in effect on a date', () => {
    const patches = [
      { version: '7.3', date: '2026-09-21' },
      { version: '7.3a', date: '2026-09-29' },
    ]
    expect(currentPatch(patches, '2026-09-28')?.version).toBe('7.3')
    expect(currentPatch(patches, '2026-09-29')?.version).toBe('7.3a')
    expect(currentPatch(patches, '2026-09-01')).toBeNull()
  })
})

describe('buildMovers', () => {
  const patches = [{ version: '7.4', date: '2026-10-02' }]

  it('compares against the newest snapshot on or before each window start', () => {
    const movers = buildMovers([d1, d2, d8], patches)
    const byId = Object.fromEntries(movers.windows.map((w) => [w.id, w]))
    expect(movers.date).toBe('2026-10-08')
    expect(byId['1d']).toMatchObject({ baseDate: '2026-10-02', targetDate: '2026-10-07' })
    expect(byId['7d']).toMatchObject({ baseDate: '2026-10-01', targetDate: '2026-10-01' })
    expect(byId['30d']).toMatchObject({ baseDate: null, targetDate: '2026-09-08', brackets: {} })
    expect(byId.patch).toMatchObject({ label: 'Patch 7.4', patch: '7.4', baseDate: '2026-10-02', targetDate: '2026-10-02' })
    expect(byId['7d']!.brackets.all?.mid).toEqual([
      [3, 54, 7, 2, 0],
      [2, 50, 0, 5, 0],
      [1, 50, -3, 10, 0],
    ])
  })

  it('leaves windows empty while history is too short', () => {
    const movers = buildMovers([d8], patches)
    expect(movers.windows.every((w) => w.baseDate === null)).toBe(true)
    expect(movers.windows.find((w) => w.id === 'patch')).toMatchObject({ patch: '7.4', baseDate: null })
  })

  it('has no patch base before any known patch', () => {
    const patch = buildMovers([d1, d2], []).windows.find((w) => w.id === 'patch')
    expect(patch).toMatchObject({ label: 'This patch', patch: null, baseDate: null, targetDate: null })
  })

  it('skips champions missing from the base snapshot', () => {
    const base = snapshot('2026-10-01', { all: { mid: [row(1, 50, 5, 5)] } })
    const latest = snapshot('2026-10-02', { all: { mid: [row(1, 51, 6, 5), row(2, 49, 3, 1)] } })
    expect(moverRows(latest, base)).toEqual({ all: { mid: [[1, 51, 1, 6, 1]] } })
  })
})

describe('buildHistories', () => {
  it('builds one series per bracket and lane, plus empty files for listed champions', () => {
    const histories = buildHistories([d1, d2], [1, 99])
    expect(histories.map((h) => h.heroId)).toEqual([1, 2, 3, 4, 99])
    const hero1 = histories[0]!
    expect(Object.keys(hero1.series)).toEqual(['all', 'diamond'])
    expect(hero1.series.all?.mid).toEqual([
      ['2026-10-01', 53, 10, 20, 100],
      ['2026-10-02', 52, 10, 20, 100],
    ])
    expect(histories.at(-1)).toEqual({ schema: 1, heroId: 99, series: {} })
  })
})

describe('publicChampions', () => {
  it('keeps the fields the frontend needs, sorted by name', () => {
    const ratings = { difficulty: 1, damage: 3, toughness: 2, utility: 1 }
    const champion = (heroId: number, name: string): Champion => ({
      heroId,
      slug: name.toLowerCase(),
      name,
      nameSource: 'ddragon',
      title: null,
      key: name,
      nameZh: '英雄',
      titleZh: '称号',
      avatar: `https://example.com/${heroId}.png`,
      lanes: ['mid'],
      roles: ['Mage'],
      ratings: heroId === 1 ? ratings : null,
    })
    expect(publicChampions([champion(2, 'Zed'), champion(1, 'Ahri')])).toEqual([
      { heroId: 1, slug: 'ahri', name: 'Ahri', title: null, nameZh: '英雄', avatar: 'https://example.com/1.png', lanes: ['mid'], roles: ['Mage'], ratings },
      { heroId: 2, slug: 'zed', name: 'Zed', title: null, nameZh: '英雄', avatar: 'https://example.com/2.png', lanes: ['mid'], roles: ['Mage'], ratings: null },
    ])
  })
})

describe('input validation', () => {
  it('accepts and sorts valid patches', () => {
    expect(
      parsePatches([
        { version: '7.3a', date: '2026-09-29' },
        { version: '7.3', date: '2026-09-21', url: 'https://example.com' },
      ]),
    ).toEqual([
      { version: '7.3', date: '2026-09-21', url: 'https://example.com' },
      { version: '7.3a', date: '2026-09-29' },
    ])
  })

  it('rejects malformed patches', () => {
    expect(() => parsePatches({})).toThrow(/array/)
    expect(() => parsePatches([{ version: '7.3', date: '21-09-2026' }])).toThrow(/YYYY-MM-DD/)
    expect(() => parsePatches([{ version: '7.3', date: '2026-02-30' }])).toThrow(/valid/)
    expect(() => parsePatches([{ version: '7.3', date: '2026-13-01' }])).toThrow(/valid/)
    expect(() => parsePatches([{ date: '2026-09-21' }])).toThrow(/version/)
    expect(() =>
      parsePatches([
        { version: '7.3', date: '2026-09-21' },
        { version: '7.3', date: '2026-09-22' },
      ]),
    ).toThrow(/duplicate/)
  })

  it('rejects malformed champion files', () => {
    expect(() => parseChampions([])).toThrow(/champions/)
    expect(() => parseChampions({ champions: [{ heroId: 1 }] })).toThrow(/missing/)
    expect(() =>
      parseChampions({
        champions: [
          { heroId: 1, name: 'A', slug: 'a' },
          { heroId: 2, name: 'A', slug: 'a' },
        ],
      }),
    ).toThrow(/duplicate slug/)
  })

  it('normalises missing or invalid champion ratings to null', () => {
    const champions = parseChampions({
      champions: [
        { heroId: 1, name: 'A', slug: 'a' },
        { heroId: 2, name: 'B', slug: 'b', ratings: { difficulty: 1, damage: 2, toughness: 3, utility: 1 } },
        { heroId: 3, name: 'C', slug: 'c', ratings: { difficulty: 4, damage: 2, toughness: 3, utility: 1 } },
      ],
    })
    expect(champions.map((c) => c.ratings)).toEqual([null, { difficulty: 1, damage: 2, toughness: 3, utility: 1 }, null])
  })
})
