import { LANES, isLane, type Bracket, type Lane } from '../shared/constants.ts'
import type { LatestFile, LatestRow, PublicChampion, Tier } from '../shared/types.ts'

/** A role filter: one lane, or every lane at once. */
export type LaneFilter = Lane | 'any'

export function isLaneFilter(value: unknown): value is LaneFilter {
  return value === 'any' || isLane(value)
}

/** Name to show for a hero id that champions.json doesn't know (yet). */
export function unknownChampionName(heroId: number): string {
  return `Hero ${heroId}`
}

export interface TierTableRow extends LatestRow {
  /** Unique per table: a champion can appear once per lane. */
  key: string
  lane: Lane
  name: string
  slug: string | null
  nameZh: string
  champion: PublicChampion | null
}

/** Rows of one bracket, for one lane or all of them, in the file's order (score descending). */
export function tierRows(
  latest: LatestFile,
  bracket: Bracket,
  lane: LaneFilter,
  championById: (heroId: number) => PublicChampion | undefined,
): TierTableRow[] {
  const lanes = lane === 'any' ? LANES : [lane]
  const rows: TierTableRow[] = []
  for (const laneKey of lanes) {
    for (const row of latest.brackets[bracket]?.[laneKey] ?? []) {
      const champion = championById(row.heroId) ?? null
      rows.push({
        ...row,
        key: `${laneKey}:${row.heroId}`,
        lane: laneKey,
        name: champion?.name ?? unknownChampionName(row.heroId),
        slug: champion?.slug ?? null,
        nameZh: champion?.nameZh ?? '',
        champion,
      })
    }
  }
  return rows
}

export const SORT_KEYS = ['tier', 'name', 'win', 'dWin', 'pick', 'ban', 'cn'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'

/** The direction a column sorts in when it's first clicked: best or biggest first. */
export const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  tier: 'desc',
  name: 'asc',
  win: 'desc',
  dWin: 'desc',
  pick: 'desc',
  ban: 'desc',
  cn: 'asc',
}

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value)
}

export function isSortDir(value: unknown): value is SortDir {
  return value === 'asc' || value === 'desc'
}

function sortValue(row: TierTableRow, key: SortKey): number | string | null {
  switch (key) {
    case 'tier':
      return row.score
    case 'name':
      return row.name
    case 'win':
      return row.win
    case 'dWin':
      return row.dWin
    case 'pick':
      return row.pick
    case 'ban':
      return row.ban
    case 'cn':
      return row.cnTier === null || row.cnRank === null ? null : row.cnTier * 1000 + row.cnRank
  }
}

/** A sorted copy. Missing values always go last; ties fall back to score, then name. */
export function sortTierRows(rows: readonly TierTableRow[], key: SortKey, dir: SortDir): TierTableRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    if (va !== vb) {
      if (va === null) return 1
      if (vb === null) return -1
      const order = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb, 'en') : Number(va) - Number(vb)
      if (order !== 0) return sign * order
    }
    return b.score - a.score || a.name.localeCompare(b.name, 'en') || a.lane.localeCompare(b.lane)
  })
}

/** Clicking the active column flips it; clicking another column starts at that column's default. */
export function nextSort(current: { key: SortKey; dir: SortDir }, clicked: SortKey): { key: SortKey; dir: SortDir } {
  if (current.key === clicked) return { key: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key: clicked, dir: DEFAULT_SORT_DIR[clicked] }
}

/** Consecutive runs of rows with the same tier, for the grouped tier-list view. */
export function groupByTier<T extends { tier: Tier }>(rows: readonly T[]): { tier: Tier; rows: T[] }[] {
  const groups: { tier: Tier; rows: T[] }[] = []
  for (const row of rows) {
    const last = groups.at(-1)
    if (last && last.tier === row.tier) last.rows.push(row)
    else groups.push({ tier: row.tier, rows: [row] })
  }
  return groups
}
