/**
 * data/base-stats.json: official base stats from Tencent's champion library. Pure functions; the
 * fetcher and scripts/build-data.ts do the I/O.
 */
import type { BaseStats, BaseStatsFile, StatGrowth } from '../../src/shared/types.ts'
import type { ParsedHeroDetail } from './tencent.ts'

export const EMPTY_BASE_STATS: Readonly<BaseStatsFile> = Object.freeze({
  schema: 1,
  version: null,
  growth: [],
  champions: [],
})

export interface MergedBaseStats {
  file: BaseStatsFile
  warnings: string[]
}

/** The value most entries share, with how many share it (ties go to the first seen). */
function mostCommon<T>(values: readonly T[]): { value: T; count: number } | null {
  const counts = new Map<string, { value: T; count: number }>()
  for (const value of values) {
    const key = JSON.stringify(value)
    const entry = counts.get(key)
    if (entry) entry.count++
    else counts.set(key, { value, count: 1 })
  }
  let best: { value: T; count: number } | null = null
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry
  return best
}

/**
 * Combine freshly parsed champion files with the previous file. Champions without a fresh file
 * (a failed request, or no longer in Tencent's list) keep their previous entry, so a flaky run
 * never deletes data.
 */
export function mergeBaseStats(details: readonly ParsedHeroDetail[], previous: BaseStatsFile | null): MergedBaseStats {
  const warnings: string[] = []
  const byId = new Map<number, BaseStats>()
  for (const entry of previous?.champions ?? []) byId.set(entry.heroId, entry)
  for (const detail of details) byId.set(detail.stats.heroId, detail.stats)

  let growth = previous?.growth ?? []
  const commonGrowth = mostCommon(details.map((detail) => detail.growth))
  if (commonGrowth) {
    growth = commonGrowth.value
    if (commonGrowth.count < details.length) {
      warnings.push(
        `Champion files disagree on the level growth multipliers; using the most common set ` +
          `(${commonGrowth.count} of ${details.length} files)`,
      )
    }
  }

  let version = previous?.version ?? null
  const commonVersion = mostCommon(details.map((detail) => detail.version).filter((v): v is string => v !== null))
  if (commonVersion) {
    version = commonVersion.value
    const versions = new Set(details.map((detail) => detail.version))
    if (versions.size > 1) warnings.push(`Champion files report several game versions: ${[...versions].join(', ')}`)
  }

  const champions = [...byId.values()].sort((a, b) => a.heroId - b.heroId)
  return { file: { schema: 1, version, growth: [...growth], champions }, warnings }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function parseGrowth(value: unknown, path: string): StatGrowth {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isFiniteNumber)) {
    throw new Error(`${path} must be [base, perLevel] numbers`)
  }
  const [base, perLevel] = value as [number, number]
  return [base, perLevel]
}

/** Validate data/base-stats.json; throws on anything hand-edited into the wrong shape. */
export function parseBaseStats(value: unknown): BaseStatsFile {
  const file = value as Partial<BaseStatsFile> | null
  if (typeof file !== 'object' || file === null || file.schema !== 1) throw new Error('base-stats.json must have schema 1')
  if (file.version !== null && typeof file.version !== 'string') throw new Error('base-stats.json: "version" must be a string or null')
  if (!Array.isArray(file.growth) || !file.growth.every(isFiniteNumber)) {
    throw new Error('base-stats.json: "growth" must be an array of numbers')
  }
  if (!Array.isArray(file.champions)) throw new Error('base-stats.json must have a "champions" array')

  const ids = new Set<number>()
  const champions = file.champions.map((entry: unknown, index): BaseStats => {
    const raw = entry as Record<string, unknown> | null
    const path = `base-stats.json champions[${index}]`
    if (typeof raw !== 'object' || raw === null || !Number.isInteger(raw.heroId)) throw new Error(`${path}: missing heroId`)
    const heroId = raw.heroId as number
    if (ids.has(heroId)) throw new Error(`base-stats.json: duplicate heroId ${heroId}`)
    ids.add(heroId)
    if (!isFiniteNumber(raw.ms)) throw new Error(`${path}.ms must be a number`)
    const optional = (key: string) => (raw[key] === null ? null : parseGrowth(raw[key], `${path}.${key}`))
    return {
      heroId,
      hp: parseGrowth(raw.hp, `${path}.hp`),
      hpRegen: parseGrowth(raw.hpRegen, `${path}.hpRegen`),
      mana: optional('mana'),
      manaRegen: optional('manaRegen'),
      ad: parseGrowth(raw.ad, `${path}.ad`),
      armor: parseGrowth(raw.armor, `${path}.armor`),
      mr: parseGrowth(raw.mr, `${path}.mr`),
      ms: raw.ms,
    }
  })
  champions.sort((a, b) => a.heroId - b.heroId)
  return { schema: 1, version: file.version, growth: [...file.growth], champions }
}
