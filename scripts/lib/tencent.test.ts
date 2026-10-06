import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRACKETS, LANES } from '../../src/shared/constants.ts'
import {
  fractionToPercent,
  heroDetailUrl,
  parseHeroDetail,
  parseHeroList,
  parseRankList,
  parseRatings,
  parseStatDate,
  SchemaError,
} from './tencent.ts'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'))

type RawStats = { result: number | string; data: Record<string, Record<string, Record<string, string>[]>> }
const stats = (): RawStats => fixture('hero_rank_list_v2.json') as RawStats

describe('parseRankList', () => {
  it('maps rank and lane keys to brackets and lanes', () => {
    const parsed = parseRankList(stats())
    expect(parsed.date).toBe('2026-10-03')
    expect(Object.keys(parsed.brackets).sort()).toEqual([...BRACKETS].sort())
    for (const bracket of BRACKETS) expect(Object.keys(parsed.brackets[bracket] ?? {}).sort()).toEqual([...LANES].sort())
    // Lane "1" is mid, "2" baron, "3" duo, "4" support, "5" jungle.
    expect(parsed.brackets.all?.mid?.map((row) => row.heroId)).toContain(10166)
    expect(parsed.brackets.all?.jungle?.map((row) => row.heroId)).toContain(10059)
    expect(parsed.warnings).toEqual([])
    expect(parsed.summary.rowCount).toBe(140)
  })

  it('parses a trimmed real response (2026-10-04)', () => {
    const parsed = parseRankList(fixture('hero_rank_list_v2.real.json'))
    expect(parsed.date).toBe('2026-10-04')
    expect(parsed.summary.rankKeys).toEqual(['0', '1', '2', '3', '4'])
    expect(parsed.summary.emptyBrackets).toEqual(['legendary'])
    expect(parsed.warnings).toEqual([])
    expect(Object.keys(parsed.brackets).sort()).toEqual(['all', 'challenger', 'diamond', 'master'])
    const rows = Object.values(parsed.brackets).flatMap((lanes) => Object.values(lanes ?? {}).flat())
    expect(rows).toHaveLength(61)
    for (const row of rows) {
      expect(row.win).toBeGreaterThan(30)
      expect(row.win).toBeLessThan(70)
      expect(row.strength).toBeGreaterThanOrEqual(1)
      expect(row.strengthLevel).toBeGreaterThanOrEqual(0)
      expect(row.strengthLevel).toBeLessThanOrEqual(5)
    }
    // Small ban rates use scientific notation, e.g. "9.75E-4" for hero 10067 in all/duo.
    expect(parsed.brackets.all?.duo?.find((row) => row.heroId === 10067)?.ban).toBe(0.1)
  })

  it('converts string fractions to percentages and sorts rows by hero id', () => {
    const raw = stats()
    const first = raw.data['0']!['1']![0]!
    const parsed = parseRankList(raw)
    const row = parsed.brackets.all?.mid?.find((r) => r.heroId === Number(first.hero_id))
    expect(row).toMatchObject({
      win: fractionToPercent(Number(first.win_rate)),
      pick: fractionToPercent(Number(first.appear_rate)),
      ban: fractionToPercent(Number(first.forbid_rate)),
      strength: Number(first.strength),
      strengthLevel: Number(first.strength_level),
    })
    const ids = parsed.brackets.all?.mid?.map((r) => r.heroId) ?? []
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
  })

  it('accepts result as a string and skips unknown keys with warnings', () => {
    const raw = stats()
    raw.result = '0'
    raw.data['9'] = raw.data['0']!
    raw.data['0']!['7'] = raw.data['0']!['1']!
    const parsed = parseRankList(raw)
    expect(parsed.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('rank key "9"'), expect.stringContaining('lane key "7"')]),
    )
  })

  it('handles missing brackets gracefully', () => {
    const raw = stats()
    delete raw.data['4']
    const parsed = parseRankList(raw)
    expect(parsed.brackets.legendary).toBeUndefined()
    expect(parsed.warnings).toContain('Brackets missing from response: legendary')
    expect(parsed.summary.emptyBrackets).toEqual([])
  })

  it('reports a present-but-empty bracket without warning', () => {
    const raw = stats()
    raw.data['4'] = {}
    const parsed = parseRankList(raw)
    expect(parsed.brackets.legendary).toBeUndefined()
    expect(parsed.summary.emptyBrackets).toEqual(['legendary'])
    expect(parsed.warnings.some((w) => w.includes('legendary'))).toBe(false)
  })

  it('uses the most common dtstatdate and warns about mixed dates', () => {
    const raw = stats()
    raw.data['0']!['1']![0]!.dtstatdate = '20261002'
    const parsed = parseRankList(raw)
    expect(parsed.date).toBe('2026-10-03')
    expect(parsed.warnings.some((w) => w.includes('mixed dtstatdate'))).toBe(true)
  })

  it('keeps the first of duplicate rows', () => {
    const raw = stats()
    const lane = raw.data['0']!['1']!
    lane.push({ ...lane[0]!, win_rate: '0.9999' })
    const parsed = parseRankList(raw)
    expect(parsed.warnings.some((w) => w.startsWith('Duplicate hero'))).toBe(true)
    const row = parsed.brackets.all?.mid?.find((r) => r.heroId === Number(lane[0]!.hero_id))
    expect(row?.win).toBe(fractionToPercent(Number(lane[0]!.win_rate)))
  })

  it('stores null when strength fields are missing', () => {
    const raw = stats()
    for (const row of raw.data['0']!['1']!) {
      delete row.strength
      delete row.strength_level
    }
    const parsed = parseRankList(raw)
    expect(parsed.brackets.all?.mid?.[0]).toMatchObject({ strength: null, strengthLevel: null })
    expect(parsed.warnings.some((w) => w.includes('lack strength'))).toBe(true)
  })

  it.each([
    ['a non-zero result', (raw: RawStats) => void (raw.result = -1), 'result=-1'],
    ['missing data', (raw: RawStats) => void Reflect.deleteProperty(raw, 'data'), 'no "data"'],
    ['empty data', (raw: RawStats) => void (raw.data = {}), 'usable rows'],
    ['a non-numeric rate', (raw: RawStats) => void (raw.data['0']!['1']![0]!.win_rate = 'n/a'), 'win_rate'],
    ['a rate outside 0..1', (raw: RawStats) => void (raw.data['0']!['1']![0]!.win_rate = '51.2'), 'outside 0..1'],
    ['a missing hero id', (raw: RawStats) => void delete raw.data['0']!['1']![0]!.hero_id, 'hero_id'],
    ['a bad date', (raw: RawStats) => void (raw.data['0']!['1']![0]!.dtstatdate = '2026-10-03'), 'dtstatdate'],
    ['a lane that is not an array', (raw: RawStats) => void (raw.data['0']!['1'] = {} as never), 'not an array'],
  ])('fails loudly on %s', (_name, mutate, message) => {
    const raw = stats()
    mutate(raw)
    expect(() => parseRankList(raw)).toThrow(SchemaError)
    expect(() => parseRankList(raw)).toThrow(message)
  })

  it('rejects non-objects', () => {
    expect(() => parseRankList('<html>')).toThrow(SchemaError)
    expect(() => parseRankList(null)).toThrow(SchemaError)
  })
})

describe('parseStatDate', () => {
  it('parses YYYYMMDD strings and numbers', () => {
    expect(parseStatDate('20261003')).toBe('2026-10-03')
    expect(parseStatDate(20261003)).toBe('2026-10-03')
  })

  it('rejects impossible dates', () => {
    expect(() => parseStatDate('20261303')).toThrow(SchemaError)
    expect(() => parseStatDate('20260230')).toThrow(SchemaError)
  })
})

describe('fractionToPercent', () => {
  it('rounds to two decimals', () => {
    expect(fractionToPercent(0.51234)).toBe(51.23)
    expect(fractionToPercent(0.005)).toBe(0.5)
    expect(fractionToPercent(1)).toBe(100)
  })
})

describe('parseHeroList', () => {
  it('parses heroes sorted by id', () => {
    const { heroes, version } = parseHeroList(fixture('hero_list.json'))
    expect(version).toBe('7.3')
    expect(heroes).toHaveLength(25)
    expect(heroes[0]).toMatchObject({ heroId: 10001, avatar: expect.stringContaining('H_S_10001') })
    expect(heroes.map((h) => h.heroId)).toEqual([...heroes.map((h) => h.heroId)].sort((a, b) => a - b))
  })

  it('keeps the official 1–3 ratings', () => {
    const { heroes } = parseHeroList(fixture('hero_list.json'))
    // Garen: difficultyL 1, damage 2, surviveL 3, assistL 1.
    expect(heroes[0]?.ratings).toEqual({ difficulty: 1, damage: 2, toughness: 3, utility: 1 })
    expect(heroes.every((hero) => hero.ratings !== null)).toBe(true)
  })

  it('rejects broken lists', () => {
    expect(() => parseHeroList({})).toThrow(SchemaError)
    expect(() => parseHeroList({ heroList: { '1': { heroId: '1', name: 'x', avatar: 'a' } } })).toThrow('only has 1')
  })
})

describe('parseRatings', () => {
  const raw = { difficultyL: '2', damage: 3, surviveL: '1', assistL: '3' }

  it('accepts numbers and numeric strings from 1 to 3', () => {
    expect(parseRatings(raw)).toEqual({ difficulty: 2, damage: 3, toughness: 1, utility: 3 })
  })

  it('returns null when any rating is missing or out of range', () => {
    expect(parseRatings({ ...raw, assistL: undefined })).toBeNull()
    expect(parseRatings({ ...raw, damage: '0' })).toBeNull()
    expect(parseRatings({ ...raw, damage: '4' })).toBeNull()
    expect(parseRatings({ ...raw, surviveL: '1.5' })).toBeNull()
    expect(parseRatings({ ...raw, difficultyL: '' })).toBeNull()
  })
})

describe('parseHeroDetail', () => {
  const garen = () => structuredClone(fixture('hero_details/10001.json')) as { hero: Record<string, unknown>; version: string }

  it('scales the fixed-point base stats', () => {
    const { stats, growth, version } = parseHeroDetail(garen(), 10001)
    expect(stats).toEqual({
      heroId: 10001,
      hp: [690, 128],
      hpRegen: [7.5, 0.55],
      mana: null,
      manaRegen: null,
      ad: [64, 5.5],
      armor: [44, 5],
      mr: [38, 2.6],
      ms: 350,
    })
    expect(version).toBe('7.3')
    expect(growth).toHaveLength(15)
    expect(growth[0]).toBe(0)
    expect(growth[1]).toBe(0.74)
    expect(growth.reduce((sum, value) => sum + value, 0)).toBeCloseTo(14)
  })

  it('keeps mana for mana users and rounds to two decimals', () => {
    const json = garen()
    Object.assign(json.hero, { mp: '4350000', mpperlevel: '490000', mpregen: '180000', mpregenperlevel: '11000', hp: '6299999' })
    const { stats } = parseHeroDetail(json)
    expect(stats.mana).toEqual([435, 49])
    expect(stats.manaRegen).toEqual([18, 1.1])
    expect(stats.hp[0]).toBe(630)
  })

  it('fails loudly on a wrong champion, missing fields or a changed unit', () => {
    expect(() => parseHeroDetail(garen(), 10002)).toThrow('describes hero 10001')
    expect(() => parseHeroDetail({ spells: [] })).toThrow(SchemaError)
    const missing = garen()
    delete missing.hero.armor
    expect(() => parseHeroDetail(missing)).toThrow(SchemaError)
    const unscaled = garen()
    unscaled.hero.hp = '690'
    expect(() => parseHeroDetail(unscaled)).toThrow('did the unit change')
    const negative = garen()
    negative.hero.armorperlevel = '-5'
    expect(() => parseHeroDetail(negative)).toThrow('negative')
  })
})

describe('heroDetailUrl', () => {
  it('points at the champion library file', () => {
    expect(heroDetailUrl(10001)).toBe('https://game.gtimg.cn/images/lgamem/act/lrlib/js/hero/10001.js')
  })
})
