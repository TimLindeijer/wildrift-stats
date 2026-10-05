import { describe, expect, it } from 'vitest'
import type { MoverWindow } from '../shared/types.ts'
import { isMoverWindowId, splitMovers, windowItems, windowReadyDate } from './movers.ts'

describe('isMoverWindowId', () => {
  it('accepts the four window ids only', () => {
    expect(['1d', '7d', '30d', 'patch'].every(isMoverWindowId)).toBe(true)
    expect(isMoverWindowId('14d')).toBe(false)
    expect(isMoverWindowId(null)).toBe(false)
  })
})

const window: MoverWindow = {
  id: '7d',
  label: '7 days',
  baseDate: '2026-10-04',
  targetDate: '2026-10-04',
  patch: null,
  brackets: {
    all: {
      baron: [
        [1, 52, 2.5, 8, 0.4],
        [2, 49, 0, 3, 0],
        [3, 47, -1.5, 2, -0.2],
      ],
      mid: [
        [4, 53, 3.1, 6, 1],
        [5, 46, -2.2, 4, -0.5],
      ],
    },
  },
}

describe('windowItems', () => {
  it('merges lanes and sorts by win-rate change', () => {
    expect(windowItems(window, 'all', 'any').map((i) => `${i.lane}:${i.heroId}`)).toEqual([
      'mid:4',
      'baron:1',
      'baron:2',
      'baron:3',
      'mid:5',
    ])
    expect(windowItems(window, 'all', 'mid').map((i) => i.heroId)).toEqual([4, 5])
    expect(windowItems(window, 'master', 'any')).toEqual([])
  })
})

describe('splitMovers', () => {
  it('returns risers and fallers, biggest first, skipping unchanged rows', () => {
    const { rising, falling } = splitMovers(windowItems(window, 'all', 'any'), 10)
    expect(rising.map((i) => i.heroId)).toEqual([4, 1])
    expect(falling.map((i) => i.heroId)).toEqual([5, 3])
  })

  it('respects the limit', () => {
    const { rising, falling } = splitMovers(windowItems(window, 'all', 'any'), 1)
    expect(rising.map((i) => i.heroId)).toEqual([4])
    expect(falling.map((i) => i.heroId)).toEqual([5])
  })
})

describe('windowReadyDate', () => {
  const empty = { brackets: {}, baseDate: null, patch: null } as const

  it('is null for windows that already have data', () => {
    expect(windowReadyDate(window, '2026-10-11', '2026-10-04')).toBeNull()
  })

  it('counts N days from the first snapshot', () => {
    const w: MoverWindow = { ...empty, id: '7d', label: '7 days', targetDate: '2026-09-28' }
    expect(windowReadyDate(w, '2026-10-05', '2026-10-04')).toBe('2026-10-11')
  })

  it('needs a second snapshot from the current patch', () => {
    const late: MoverWindow = { ...empty, id: 'patch', label: 'Patch 7.3a', targetDate: '2026-09-29', patch: '7.3a' }
    expect(windowReadyDate(late, '2026-10-04', '2026-10-04')).toBe('2026-10-05')
    const early: MoverWindow = { ...late, targetDate: '2026-10-20' }
    expect(windowReadyDate(early, '2026-10-20', '2026-10-04')).toBe('2026-10-21')
    expect(windowReadyDate({ ...late, targetDate: null, patch: null }, '2026-10-04', '2026-10-04')).toBeNull()
  })
})
