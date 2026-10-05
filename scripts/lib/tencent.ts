/**
 * Pure parsing and validation of Tencent's public Wild Rift (China server) endpoints.
 * Everything here throws SchemaError on unexpected shapes so the scheduled job fails loudly.
 */
import { BRACKETS, LANES, type Bracket, type Lane } from '../../src/shared/constants.ts'
import type { BracketTable, SnapshotRow } from '../../src/shared/types.ts'

export const STATS_URL = 'https://mlol.qt.qq.com/go/lgame_battle_info/hero_rank_list_v2'
export const HERO_LIST_URL = 'https://game.gtimg.cn/images/lgamem/act/lrlib/js/heroList/hero_list.js'
export const HERO_HISTORY_URL = 'https://mlol.qt.qq.com/go/lgame_battle_info/hero_rank_data_v2'
export const STATS_SOURCE = 'tencent:hero_rank_list_v2'

export const TENCENT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://lolm.qq.com/',
}

/** Tencent rank keys → our bracket ids. */
export const RANK_KEY_TO_BRACKET: Readonly<Record<string, Bracket>> = {
  '0': 'all',
  '1': 'diamond',
  '2': 'master',
  '3': 'challenger',
  '4': 'legendary',
}

/** Tencent lane keys → our lane ids. */
export const LANE_KEY_TO_LANE: Readonly<Record<string, Lane>> = {
  '1': 'mid',
  '2': 'baron',
  '3': 'duo',
  '4': 'support',
  '5': 'jungle',
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}

export type JsonObject = Record<string, unknown>

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Rates are fractions in the API; we store percentages with 2 decimals. */
export function fractionToPercent(fraction: number): number {
  return Math.round(fraction * 10_000) / 100
}

function toFiniteNumber(value: unknown, path: string): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(number)) throw new SchemaError(`${path} is not a number: ${JSON.stringify(value)}`)
  return number
}

function toRate(value: unknown, path: string): number {
  const fraction = toFiniteNumber(value, path)
  if (fraction < 0 || fraction > 1) {
    throw new SchemaError(`${path} = ${JSON.stringify(value)} is outside 0..1 (did the unit change?)`)
  }
  return fractionToPercent(fraction)
}

function toHeroId(value: unknown, path: string): number {
  const id = toFiniteNumber(value, path)
  if (!Number.isInteger(id) || id <= 0) throw new SchemaError(`${path} is not a positive integer: ${JSON.stringify(value)}`)
  return id
}

/** "20261004" → "2026-10-04" */
export function parseStatDate(value: unknown, path = 'dtstatdate'): string {
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string' || !/^\d{8}$/.test(text)) {
    throw new SchemaError(`${path} is not a YYYYMMDD date: ${JSON.stringify(value)}`)
  }
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new SchemaError(`${path} is not a valid date: ${JSON.stringify(value)}`)
  }
  return iso
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export interface RankListSummary {
  rankKeys: string[]
  laneKeys: string[]
  rowCount: number
  dates: Record<string, number>
}

export interface ParsedRankList {
  /** Most common `dtstatdate` across all rows, YYYY-MM-DD. */
  date: string
  brackets: BracketTable<SnapshotRow>
  warnings: string[]
  summary: RankListSummary
}

/** Minimum number of rows for a response to be considered a real snapshot. */
export const MIN_ROWS = 50

/** Validate and normalise a `hero_rank_list_v2` response. */
export function parseRankList(json: unknown): ParsedRankList {
  if (!isObject(json)) throw new SchemaError('Stats response is not a JSON object')
  if (json.result !== 0 && json.result !== '0') {
    const message = json.msg ?? json.message ?? json.errMsg ?? ''
    throw new SchemaError(`Stats response has result=${JSON.stringify(json.result)} (expected 0) ${String(message)}`.trim())
  }
  const data = json.data
  if (!isObject(data)) throw new SchemaError('Stats response has no "data" object')

  const warnings: string[] = []
  const brackets: BracketTable<SnapshotRow> = {}
  const dateCounts = new Map<string, number>()
  const laneKeys = new Set<string>()
  const missingStrength = { count: 0, example: '' }
  let rowCount = 0

  for (const [rankKey, lanes] of Object.entries(data)) {
    const bracket = RANK_KEY_TO_BRACKET[rankKey]
    if (!bracket) {
      warnings.push(`Unknown rank key "${rankKey}" skipped`)
      continue
    }
    if (!isObject(lanes)) throw new SchemaError(`data["${rankKey}"] is not an object`)

    for (const [laneKey, rows] of Object.entries(lanes)) {
      laneKeys.add(laneKey)
      const lane = LANE_KEY_TO_LANE[laneKey]
      if (!lane) {
        warnings.push(`Unknown lane key "${laneKey}" in rank "${rankKey}" skipped`)
        continue
      }
      if (!Array.isArray(rows)) throw new SchemaError(`data["${rankKey}"]["${laneKey}"] is not an array`)

      const seen = new Set<number>()
      const parsedRows: SnapshotRow[] = []
      rows.forEach((raw, index) => {
        const path = `data["${rankKey}"]["${laneKey}"][${index}]`
        if (!isObject(raw)) throw new SchemaError(`${path} is not an object`)
        const heroId = toHeroId(raw.hero_id, `${path}.hero_id`)
        const row: SnapshotRow = {
          heroId,
          win: toRate(raw.win_rate, `${path}.win_rate`),
          pick: toRate(raw.appear_rate, `${path}.appear_rate`),
          ban: toRate(raw.forbid_rate, `${path}.forbid_rate`),
          strength: optionalNumber(raw.strength),
          strengthLevel: optionalNumber(raw.strength_level),
        }
        if (row.strength === null || row.strengthLevel === null) {
          missingStrength.count++
          missingStrength.example ||= path
        }
        const date = parseStatDate(raw.dtstatdate, `${path}.dtstatdate`)
        dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1)

        if (seen.has(heroId)) {
          warnings.push(`Duplicate hero ${heroId} in ${bracket}/${lane}; keeping the first row`)
          return
        }
        seen.add(heroId)
        parsedRows.push(row)
      })

      if (parsedRows.length === 0) continue
      parsedRows.sort((a, b) => a.heroId - b.heroId)
      const laneTable = (brackets[bracket] ??= {})
      laneTable[lane] = parsedRows
      rowCount += parsedRows.length
    }
  }

  if (rowCount < MIN_ROWS) {
    throw new SchemaError(`Stats response only has ${rowCount} usable rows (expected at least ${MIN_ROWS})`)
  }
  if (missingStrength.count > 0) {
    warnings.push(`${missingStrength.count} rows lack strength/strength_level (e.g. ${missingStrength.example})`)
  }

  const sortedDates = [...dateCounts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))
  const date = sortedDates[0]![0]
  if (sortedDates.length > 1) {
    warnings.push(
      `Rows have mixed dtstatdate values (${sortedDates.map(([d, n]) => `${d}×${n}`).join(', ')}); using ${date}`,
    )
  }

  const presentBrackets = BRACKETS.filter((b) => brackets[b])
  const missingBrackets = BRACKETS.filter((b) => !brackets[b])
  if (missingBrackets.length > 0) warnings.push(`Brackets missing from response: ${missingBrackets.join(', ')}`)
  for (const bracket of presentBrackets) {
    const missingLanes = LANES.filter((lane) => !brackets[bracket]?.[lane])
    if (missingLanes.length > 0) warnings.push(`Bracket ${bracket} is missing lanes: ${missingLanes.join(', ')}`)
  }

  return {
    date,
    brackets,
    warnings,
    summary: {
      rankKeys: Object.keys(data),
      laneKeys: [...laneKeys].sort(),
      rowCount,
      dates: Object.fromEntries(sortedDates),
    },
  }
}

export interface RawHero {
  heroId: number
  name: string
  title: string
  roles: string[]
  lane: string
  avatar: string
  poster: string
}

export interface ParsedHeroList {
  heroes: RawHero[]
  version: string | null
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new SchemaError(`${path} is not a string: ${JSON.stringify(value)}`)
  return value
}

/** Minimum number of champions for a hero list to be considered complete enough to use. */
export const MIN_HEROES = 20

/** Validate Tencent's champion list (`hero_list.js`, which is plain JSON). */
export function parseHeroList(json: unknown): ParsedHeroList {
  if (!isObject(json) || !isObject(json.heroList)) throw new SchemaError('Hero list has no "heroList" object')
  const entries = Object.entries(json.heroList)
  if (entries.length < MIN_HEROES) throw new SchemaError(`Hero list only has ${entries.length} champions`)

  const heroes = entries.map(([key, raw]): RawHero => {
    const path = `heroList["${key}"]`
    if (!isObject(raw)) throw new SchemaError(`${path} is not an object`)
    return {
      heroId: toHeroId(raw.heroId ?? key, `${path}.heroId`),
      name: requireString(raw.name, `${path}.name`),
      title: typeof raw.title === 'string' ? raw.title : '',
      roles: Array.isArray(raw.roles) ? raw.roles.filter((r): r is string => typeof r === 'string') : [],
      lane: typeof raw.lane === 'string' ? raw.lane : '',
      avatar: requireString(raw.avatar, `${path}.avatar`),
      poster: typeof raw.poster === 'string' ? raw.poster : '',
    }
  })
  heroes.sort((a, b) => a.heroId - b.heroId)
  return { heroes, version: typeof json.version === 'string' ? json.version : null }
}
