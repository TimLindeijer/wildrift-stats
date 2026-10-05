import { describe, expect, it } from 'vitest'
import type { HistoryFile, LatestFile, LatestRow } from '../shared/types.ts'
import { bracketsInLatest, bracketsWithData, findLatestRow, lanesWithData, mainLane } from './champion.ts'

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

const latest: LatestFile = {
  schema: 1,
  date: '2026-10-05',
  previousDate: null,
  fetchedAt: '',
  dates: ['2026-10-05'],
  brackets: {
    all: { baron: [row(1, 3)], jungle: [row(1, 9), row(2, 4)] },
    diamond: { mid: [row(2, 5)] },
    legendary: {},
  },
}

const history: HistoryFile = {
  schema: 1,
  heroId: 1,
  series: {
    all: { baron: [['2026-10-05', 50, 3, 1, 55]], support: [['2026-10-04', 49, 1.1, 1, 30]] },
    master: {
      duo: [
        ['2026-10-03', 50, 2, 1, 40],
        ['2026-10-04', 50, 2, 1, 40],
      ],
      mid: [['2026-10-04', 50, 1, 1, 40]],
    },
  },
}

describe('champion helpers', () => {
  it('finds latest rows by bracket, lane and hero', () => {
    expect(findLatestRow(latest, 'all', 'jungle', 1)?.pick).toBe(9)
    expect(findLatestRow(latest, 'all', 'mid', 1)).toBeUndefined()
  })

  it('combines latest rows and history when listing lanes and brackets', () => {
    expect(lanesWithData(latest, history, 'all', 1)).toEqual(['baron', 'jungle', 'support'])
    expect(lanesWithData(latest, null, 'all', 1)).toEqual(['baron', 'jungle'])
    expect(bracketsWithData(latest, history, 1)).toEqual(['all', 'master'])
  })

  it('picks the most-played lane, falling back to the longest history', () => {
    expect(mainLane(latest, history, 'all', 1)).toBe('jungle')
    expect(mainLane(latest, history, 'master', 1)).toBe('duo')
    expect(mainLane(latest, history, 'challenger', 1)).toBeNull()
  })

  it('knows which brackets have data', () => {
    expect([...bracketsInLatest(latest)]).toEqual(['all', 'diamond'])
  })
})
