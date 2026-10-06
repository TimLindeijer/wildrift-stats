import { describe, expect, it } from 'vitest'
import type { BaseStats, PublicChampion } from '../shared/types.ts'
import {
  formatGrowth,
  formatStat,
  isProfileSortKey,
  levelValue,
  sortProfiles,
  statAt,
  statLines,
  type ChampionProfile,
} from './profile.ts'

/* Real values from Tencent's champion files for patch 7.3. */
const GROWTH = [0, 0.74, 0.78, 0.82, 0.86, 0.9, 0.94, 0.98, 1.02, 1.06, 1.1, 1.14, 1.18, 1.22, 1.26]

const garenStats: BaseStats = {
  heroId: 10001,
  hp: [690, 128],
  hpRegen: [7.5, 0.55],
  mana: null,
  manaRegen: null,
  ad: [64, 5.5],
  armor: [44, 5],
  mr: [38, 2.6],
  ms: 350,
}
const aatroxStats: BaseStats = {
  heroId: 10002,
  hp: [630, 136],
  hpRegen: [6, 1],
  mana: null,
  manaRegen: null,
  ad: [62, 5.5],
  armor: [46, 5],
  mr: [36, 2],
  ms: 355,
}
const luxStats: BaseStats = {
  heroId: 10003,
  hp: [600, 120],
  hpRegen: [7.5, 0.55],
  mana: [480, 49],
  manaRegen: [9, 1.1],
  ad: [52, 3.6],
  armor: [34, 5],
  mr: [36, 1.2],
  ms: 360,
}

function champion(heroId: number, name: string, ratings: PublicChampion['ratings']): PublicChampion {
  return { heroId, slug: name.toLowerCase(), name, title: null, nameZh: '', avatar: '', lanes: [], roles: [], ratings }
}

describe('levelValue', () => {
  it('adds the per-level gain times the growth multipliers', () => {
    expect(levelValue([690, 128], 1, GROWTH)).toBe(690)
    expect(levelValue([690, 128], 2, GROWTH)).toBe(784.72)
    expect(levelValue([690, 128], 15, GROWTH)).toBe(2482)
    expect(levelValue([38, 2.6], 15, GROWTH)).toBe(74.4)
  })

  it('is null outside the level range', () => {
    expect(levelValue([690, 128], 0, GROWTH)).toBeNull()
    expect(levelValue([690, 128], 16, GROWTH)).toBeNull()
    expect(levelValue([690, 128], 1.5, GROWTH)).toBeNull()
    expect(levelValue([690, 128], 1, [])).toBeNull()
  })
})

describe('statAt', () => {
  it('handles move speed, which does not grow', () => {
    expect(statAt(garenStats, 'ms', 1, GROWTH)).toBe(350)
    expect(statAt(garenStats, 'ms', 15, GROWTH)).toBe(350)
    expect(statAt(garenStats, 'ms', 1, [])).toBeNull()
  })

  it('is null for a stat the champion does not have', () => {
    expect(statAt(garenStats, 'mana', 1, GROWTH)).toBeNull()
    expect(statAt(luxStats, 'mana', 15, GROWTH)).toBe(1166)
  })
})

describe('statLines', () => {
  it('gives level 1, per-level and max-level values', () => {
    const lines = statLines(garenStats, GROWTH)
    expect(lines.map((l) => [l.key, l.first, l.perLevel, l.last])).toEqual([
      ['hp', 690, 128, 2482],
      ['hpRegen', 7.5, 0.55, 15.2],
      ['mana', null, null, null],
      ['ad', 64, 5.5, 141],
      ['armor', 44, 5, 114],
      ['mr', 38, 2.6, 74.4],
      ['ms', 350, null, 350],
    ])
    expect(lines[0]!.label).toBe('Health')
  })

  it('includes mana regen for champions with mana', () => {
    const lines = statLines(luxStats, GROWTH)
    expect(lines.map((l) => l.key)).toContain('manaRegen')
    expect(lines.find((l) => l.key === 'manaRegen')).toMatchObject({ first: 9, perLevel: 1.1, last: 24.4 })
  })
})

describe('formatStat and formatGrowth', () => {
  it('shows up to two decimals with grouping', () => {
    expect(formatStat(2482)).toBe('2,482')
    expect(formatStat(74.4)).toBe('74.4')
    expect(formatStat(0.55)).toBe('0.55')
    expect(formatStat(1234.567)).toBe('1,234.57')
    expect(formatStat(null)).toBe('—')
  })

  it('signs gains', () => {
    expect(formatGrowth(128)).toBe('+128')
    expect(formatGrowth(5.5)).toBe('+5.5')
    expect(formatGrowth(0)).toBe('0')
    expect(formatGrowth(null)).toBe('—')
  })
})

describe('sortProfiles', () => {
  const profiles: ChampionProfile[] = [
    { champion: champion(10003, 'Lux', { difficulty: 1, damage: 3, toughness: 1, utility: 2 }), stats: luxStats },
    { champion: champion(10099, 'Zed', null), stats: null },
    { champion: champion(10001, 'Garen', { difficulty: 1, damage: 2, toughness: 3, utility: 1 }), stats: garenStats },
    { champion: champion(10002, 'Aatrox', { difficulty: 2, damage: 3, toughness: 3, utility: 2 }), stats: aatroxStats },
  ]
  const names = (key: Parameters<typeof sortProfiles>[1], dir: 'asc' | 'desc', level = 1) =>
    sortProfiles(profiles, key, dir, level, GROWTH).map((p) => p.champion.name)

  it('sorts by name', () => {
    expect(names('name', 'asc')).toEqual(['Aatrox', 'Garen', 'Lux', 'Zed'])
    expect(names('name', 'desc')).toEqual(['Zed', 'Lux', 'Garen', 'Aatrox'])
  })

  it('sorts by rating with ties A–Z and missing ratings last', () => {
    expect(names('difficulty', 'desc')).toEqual(['Aatrox', 'Garen', 'Lux', 'Zed'])
    expect(names('difficulty', 'asc')).toEqual(['Garen', 'Lux', 'Aatrox', 'Zed'])
  })

  it('compares stats at the chosen level', () => {
    expect(names('hp', 'desc', 1)).toEqual(['Garen', 'Aatrox', 'Lux', 'Zed'])
    expect(names('hp', 'desc', 15)).toEqual(['Aatrox', 'Garen', 'Lux', 'Zed'])
    expect(names('ms', 'asc')).toEqual(['Garen', 'Aatrox', 'Lux', 'Zed'])
  })

  it('puts champions without the stat last in both directions', () => {
    expect(names('mana', 'desc')).toEqual(['Lux', 'Aatrox', 'Garen', 'Zed'])
    expect(names('mana', 'asc')).toEqual(['Lux', 'Aatrox', 'Garen', 'Zed'])
  })
})

describe('isProfileSortKey', () => {
  it('accepts the table columns only', () => {
    expect(isProfileSortKey('name')).toBe(true)
    expect(isProfileSortKey('utility')).toBe(true)
    expect(isProfileSortKey('hp')).toBe(true)
    expect(isProfileSortKey('hpRegen')).toBe(false)
    expect(isProfileSortKey('tier')).toBe(false)
  })
})
