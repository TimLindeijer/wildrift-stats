import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRACKETS, LANES } from '../../src/shared/constants.ts'
import { fractionToPercent, parseHeroList, parseRankList, parseStatDate, SchemaError } from './tencent.ts'

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

  it('rejects broken lists', () => {
    expect(() => parseHeroList({})).toThrow(SchemaError)
    expect(() => parseHeroList({ heroList: { '1': { heroId: '1', name: 'x', avatar: 'a' } } })).toThrow('only has 1')
  })
})
