import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BaseStatsFile } from '../../src/shared/types.ts'
import { EMPTY_BASE_STATS, mergeBaseStats, parseBaseStats } from './baseStats.ts'
import { parseHeroDetail, type ParsedHeroDetail } from './tencent.ts'

const garen = (): ParsedHeroDetail =>
  parseHeroDetail(JSON.parse(readFileSync(new URL('../fixtures/hero_details/10001.json', import.meta.url), 'utf8')))

const detail = (heroId: number, extra: Partial<ParsedHeroDetail> = {}): ParsedHeroDetail => {
  const base = garen()
  return { ...base, stats: { ...base.stats, heroId }, ...extra }
}

describe('mergeBaseStats', () => {
  it('builds a sorted file with the shared growth and version', () => {
    const { file, warnings } = mergeBaseStats([detail(10002), detail(10001)], null)
    expect(warnings).toEqual([])
    expect(file.version).toBe('7.3')
    expect(file.growth).toHaveLength(15)
    expect(file.champions.map((c) => c.heroId)).toEqual([10001, 10002])
    expect(file.champions[0]).toMatchObject({ hp: [690, 128], mana: null, ms: 350 })
  })

  it('keeps previous entries for champions without a fresh file', () => {
    const previous = mergeBaseStats([detail(10001), detail(10002)], null).file
    const fresh = detail(10001)
    fresh.stats = { ...fresh.stats, ms: 345 }
    const { file } = mergeBaseStats([fresh], previous)
    expect(file.champions.map((c) => [c.heroId, c.ms])).toEqual([
      [10001, 345],
      [10002, 350],
    ])
  })

  it('keeps the previous file when nothing could be loaded', () => {
    const previous = mergeBaseStats([detail(10001)], null).file
    expect(mergeBaseStats([], previous).file).toEqual(previous)
    expect(mergeBaseStats([], null).file).toEqual(EMPTY_BASE_STATS)
  })

  it('warns when champion files disagree on growth or version', () => {
    const odd = detail(10003, { growth: Array(15).fill(1), version: '7.3b' })
    const { file, warnings } = mergeBaseStats([detail(10001), detail(10002), odd], null)
    expect(file.growth[1]).toBe(0.74)
    expect(file.version).toBe('7.3')
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('2 of 3')
    expect(warnings[1]).toContain('7.3, 7.3b')
  })
})

describe('parseBaseStats', () => {
  const valid = (): BaseStatsFile => mergeBaseStats([detail(10002), detail(10001)], null).file

  it('round-trips a valid file', () => {
    const file = valid()
    expect(parseBaseStats(JSON.parse(JSON.stringify(file)))).toEqual(file)
    expect(parseBaseStats({ ...EMPTY_BASE_STATS })).toEqual(EMPTY_BASE_STATS)
  })

  it('rejects malformed files', () => {
    expect(() => parseBaseStats(null)).toThrow(/schema/)
    expect(() => parseBaseStats({ ...valid(), schema: 2 })).toThrow(/schema/)
    expect(() => parseBaseStats({ ...valid(), version: 7 })).toThrow(/version/)
    expect(() => parseBaseStats({ ...valid(), growth: ['0'] })).toThrow(/growth/)
    expect(() => parseBaseStats({ ...valid(), champions: {} })).toThrow(/champions/)
    const file = valid()
    expect(() => parseBaseStats({ ...file, champions: [...file.champions, file.champions[0]] })).toThrow(/duplicate/)
    expect(() => parseBaseStats({ ...file, champions: [{ ...file.champions[0], hp: [1] }] })).toThrow(/hp/)
    expect(() => parseBaseStats({ ...file, champions: [{ ...file.champions[0], mana: 'none' }] })).toThrow(/mana/)
    expect(() => parseBaseStats({ ...file, champions: [{ ...file.champions[0], ms: null }] })).toThrow(/ms/)
  })
})
