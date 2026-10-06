import type { BaseStats, ChampionRatings, PublicChampion, StatGrowth } from '../shared/types.ts'
import { compareSortValues, type SortDir } from './sort.ts'

export const RATING_KEYS = ['difficulty', 'damage', 'toughness', 'utility'] as const satisfies readonly (keyof ChampionRatings)[]
export type RatingKey = (typeof RATING_KEYS)[number]

export const RATING_LABELS: Record<RatingKey, string> = {
  difficulty: 'Difficulty',
  damage: 'Damage',
  toughness: 'Toughness',
  utility: 'Utility',
}

/** Tencent rates every champion from 1 to 3 on each axis. */
export const MAX_RATING = 3

export function isRatingKey(value: unknown): value is RatingKey {
  return typeof value === 'string' && (RATING_KEYS as readonly string[]).includes(value)
}

export const BASE_STAT_KEYS = ['hp', 'hpRegen', 'mana', 'manaRegen', 'ad', 'armor', 'mr', 'ms'] as const
export type BaseStatKey = (typeof BASE_STAT_KEYS)[number]

export const BASE_STAT_LABELS: Record<BaseStatKey, string> = {
  hp: 'Health',
  hpRegen: 'Health regen',
  mana: 'Mana',
  manaRegen: 'Mana regen',
  ad: 'Attack damage',
  armor: 'Armor',
  mr: 'Magic resist',
  ms: 'Move speed',
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function isLevel(level: number, growth: readonly number[]): boolean {
  return Number.isInteger(level) && level >= 1 && level <= growth.length
}

/**
 * A stat at a level: base + perLevel × (growth[1] + … + growth[level − 1]). Null for a level
 * outside 1…growth.length.
 */
export function levelValue([base, perLevel]: StatGrowth, level: number, growth: readonly number[]): number | null {
  if (!isLevel(level, growth)) return null
  const factor = growth.slice(1, level).reduce((sum, multiplier) => sum + multiplier, 0)
  return round2(base + perLevel * factor)
}

/** A champion's stat at a level; null when it doesn't have the stat (no mana) or the level is out of range. */
export function statAt(stats: BaseStats, key: BaseStatKey, level: number, growth: readonly number[]): number | null {
  if (key === 'ms') return isLevel(level, growth) ? stats.ms : null
  const value = stats[key]
  return value === null ? null : levelValue(value, level, growth)
}

export interface StatLine {
  key: BaseStatKey
  label: string
  /** Value at level 1. */
  first: number | null
  /** Gain per level-up before the growth multiplier; null for move speed, which doesn't grow. */
  perLevel: number | null
  /** Value at the highest level. */
  last: number | null
}

/**
 * The rows of a champion's base-stats table. Champions without mana get one "mana" row with no
 * values and no mana-regen row.
 */
export function statLines(stats: BaseStats, growth: readonly number[]): StatLine[] {
  return BASE_STAT_KEYS.filter((key) => key !== 'manaRegen' || stats.mana !== null).map((key) => ({
    key,
    label: BASE_STAT_LABELS[key],
    first: statAt(stats, key, 1, growth),
    perLevel: key === 'ms' ? null : (stats[key]?.[1] ?? null),
    last: statAt(stats, key, growth.length, growth),
  }))
}

const statNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** 2482 -> "2,482", 74.4 -> "74.4", 0.55 -> "0.55" */
export function formatStat(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return statNumber.format(value)
}

/** Gain per level: 5.5 -> "+5.5"; no growth -> "0". */
export function formatGrowth(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value > 0 ? `+${formatStat(value)}` : formatStat(value)
}

/* ------------------------------------------------------------------ */
/* Champions table                                                     */
/* ------------------------------------------------------------------ */

export const PROFILE_STAT_KEYS = ['hp', 'mana', 'ad', 'armor', 'mr', 'ms'] as const satisfies readonly BaseStatKey[]
export type ProfileStatKey = (typeof PROFILE_STAT_KEYS)[number]

export const PROFILE_SORT_KEYS = ['name', ...RATING_KEYS, ...PROFILE_STAT_KEYS] as const
export type ProfileSortKey = (typeof PROFILE_SORT_KEYS)[number]

/** Names sort A–Z first; ratings and stats highest first. */
export const PROFILE_SORT_DEFAULTS: Record<ProfileSortKey, SortDir> = {
  name: 'asc',
  difficulty: 'desc',
  damage: 'desc',
  toughness: 'desc',
  utility: 'desc',
  hp: 'desc',
  mana: 'desc',
  ad: 'desc',
  armor: 'desc',
  mr: 'desc',
  ms: 'desc',
}

export function isProfileSortKey(value: unknown): value is ProfileSortKey {
  return typeof value === 'string' && (PROFILE_SORT_KEYS as readonly string[]).includes(value)
}

export interface ChampionProfile {
  champion: PublicChampion
  /** Null when base-stats.json has no entry for the champion. */
  stats: BaseStats | null
}

function profileSortValue(
  profile: ChampionProfile,
  key: ProfileSortKey,
  level: number,
  growth: readonly number[],
): number | string | null {
  if (key === 'name') return profile.champion.name
  if (isRatingKey(key)) return profile.champion.ratings?.[key] ?? null
  return profile.stats ? statAt(profile.stats, key, level, growth) : null
}

/** A sorted copy. Stats are compared at `level`; missing values go last; ties go A–Z. */
export function sortProfiles(
  profiles: readonly ChampionProfile[],
  key: ProfileSortKey,
  dir: SortDir,
  level: number,
  growth: readonly number[],
): ChampionProfile[] {
  return [...profiles].sort(
    (a, b) =>
      compareSortValues(profileSortValue(a, key, level, growth), profileSortValue(b, key, level, growth), dir) ||
      a.champion.name.localeCompare(b.champion.name, 'en') ||
      a.champion.heroId - b.champion.heroId,
  )
}
