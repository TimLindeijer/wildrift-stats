import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LANES } from '../../src/shared/constants.ts'
import { renderReport } from './report.ts'
import { describeShape, findDates } from './shape.ts'
import { buildSnapshot, canonicalBrackets, isSnapshot, sameStats, snapshotStatus, summarizeBrackets } from './snapshot.ts'
import { parseRankList } from './tencent.ts'

const parsed = () =>
  parseRankList(JSON.parse(readFileSync(new URL('../fixtures/hero_rank_list_v2.json', import.meta.url), 'utf8')))

describe('buildSnapshot', () => {
  it('produces a canonical snapshot keyed by dtstatdate', () => {
    const snapshot = buildSnapshot(parsed(), '2026-10-04T02:23:00Z')
    expect(snapshot).toMatchObject({ schema: 1, date: '2026-10-03', fetchedAt: '2026-10-04T02:23:00Z' })
    expect(Object.keys(snapshot.brackets)).toEqual(['all', 'diamond', 'master', 'challenger', 'legendary'])
    expect(Object.keys(snapshot.brackets.all ?? {})).toEqual([...LANES])
    expect(Object.keys(snapshot.brackets.all?.mid?.[0] ?? {})).toEqual([
      'heroId',
      'win',
      'pick',
      'ban',
      'strength',
      'strengthLevel',
    ])
    expect(isSnapshot(snapshot)).toBe(true)
    expect(isSnapshot({ schema: 2 })).toBe(false)
  })
})

describe('snapshotStatus', () => {
  it('detects added, unchanged and updated snapshots regardless of fetch time and ordering', () => {
    const first = buildSnapshot(parsed(), '2026-10-04T02:23:00Z')
    const again = buildSnapshot(parsed(), '2026-10-04T14:23:00Z')
    expect(snapshotStatus(null, again)).toBe('added')
    expect(snapshotStatus(first, again)).toBe('unchanged')

    const reordered = { brackets: { ...first.brackets, all: { ...first.brackets.all, mid: [...first.brackets.all!.mid!].reverse() } } }
    expect(sameStats(reordered, again)).toBe(true)

    const changed = structuredClone(again)
    changed.brackets.all!.mid![0]!.win += 0.01
    expect(snapshotStatus(first, changed)).toBe('updated')
  })

  it('canonicalBrackets drops unknown row fields', () => {
    const snapshot = buildSnapshot(parsed(), 'x')
    const row = { ...snapshot.brackets.all!.mid![0]!, extra: 1 }
    const result = canonicalBrackets({ all: { mid: [row] } })
    expect(result.all?.mid?.[0]).not.toHaveProperty('extra')
  })
})

describe('summarizeBrackets and renderReport', () => {
  it('summarises value ranges per bracket and lane', () => {
    const snapshot = buildSnapshot(parsed(), 'x')
    const stats = summarizeBrackets(snapshot.brackets)
    const mid = stats.all?.mid
    expect(mid?.rows).toBe(6)
    expect(mid!.winMin).toBeGreaterThanOrEqual(45)
    expect(mid!.winMax).toBeLessThanOrEqual(56)

    const markdown = renderReport({
      snapshot,
      status: 'added',
      championsChanged: true,
      championCount: 25,
      summary: parsed().summary,
      warnings: ['careful'],
      dryRun: true,
    })
    expect(markdown).toContain('## Ranked snapshot 2026-10-03 (dry run)')
    expect(markdown).toContain('| All ranks | Mid | 6 |')
    expect(markdown).toContain('- careful')
  })
})

describe('describeShape and findDates', () => {
  it('describes nested JSON compactly', () => {
    expect(describeShape({ result: 0, data: [{ d: '20261003' }, {}] })).toBe(
      '{ "result": number 0, "data": [{ "d": string "20261003" } ×2] }',
    )
    expect(describeShape({ a: 1, b: 2, c: 3, d: 4, e: 5 })).toBe(
      '{ "a": number 1, "b": number 2, "c": number 3, + keys "d", "e" }',
    )
  })

  it('collects date-like values', () => {
    const dates = findDates({ list: [{ dtstatdate: '20261001' }, { stat_date: 20261002 }, { date: '2026-10-03' }, { other: '20261004' }] })
    expect([...dates].sort()).toEqual(['20261001', '20261002', '20261003'])
  })
})
