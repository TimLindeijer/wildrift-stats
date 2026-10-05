/**
 * Data contract between the data pipeline (scripts/) and the frontend (src/).
 *
 * Units: every `win`, `pick` and `ban` value is a percentage (0–100) rounded to 2 decimals.
 * Deltas (`dWin` etc.) are differences in percentage points.
 */
import type { Bracket, Lane } from './constants.ts'

export type LaneTable<T> = Partial<Record<Lane, T[]>>
export type BracketTable<T> = Partial<Record<Bracket, LaneTable<T>>>

/* ------------------------------------------------------------------ */
/* Source of truth, committed to data/ by the scheduled workflow       */
/* ------------------------------------------------------------------ */

/** One champion in one bracket and lane on one day. */
export interface SnapshotRow {
  heroId: number
  /** Win rate, % */
  win: number
  /** Pick ("appear") rate, % */
  pick: number
  /** Ban ("forbid") rate, % */
  ban: number
  /** Tencent's own strength score (`strength`), or null if absent. */
  strength: number | null
  /** Tencent's own strength level (`strength_level`), or null if absent. */
  strengthLevel: number | null
}

/** data/snapshots/YYYY-MM-DD.json */
export interface Snapshot {
  schema: 1
  /** Stats date reported by Tencent (`dtstatdate`), YYYY-MM-DD. */
  date: string
  /** When this snapshot was fetched, ISO 8601 UTC. */
  fetchedAt: string
  source: string
  brackets: BracketTable<SnapshotRow>
}

export type NameSource = 'ddragon' | 'override' | 'fallback'

export interface Champion {
  heroId: number
  slug: string
  /** English display name. */
  name: string
  /** Where the English name came from; `fallback` means it was guessed from the asset key. */
  nameSource: NameSource
  /** English title from Riot Data Dragon, when known. */
  title: string | null
  /** Asset key derived from the poster file name, e.g. "MonkeyKing". */
  key: string
  nameZh: string
  titleZh: string
  /** Square icon URL (hotlinked from Tencent's CDN). */
  avatar: string
  /** Recommended lanes according to Tencent's champion list. */
  lanes: Lane[]
  /** Champion classes, e.g. "Fighter". */
  roles: string[]
}

/** data/champions.json */
export interface ChampionsFile {
  schema: 1
  champions: Champion[]
}

/** data/patches.json entry */
export interface Patch {
  version: string
  /** Global release date, YYYY-MM-DD. */
  date: string
  url?: string
}

/* ------------------------------------------------------------------ */
/* Derived files, generated into public/data/ by `npm run data:build`  */
/* ------------------------------------------------------------------ */

export const TIERS = ['S+', 'S', 'A', 'B', 'C', 'D'] as const
export type Tier = (typeof TIERS)[number]

/** Champion fields the frontend needs (public/data/champions.json). */
export type PublicChampion = Pick<Champion, 'heroId' | 'slug' | 'name' | 'title' | 'nameZh' | 'avatar' | 'lanes' | 'roles'>

export interface PublicChampionsFile {
  schema: 1
  champions: PublicChampion[]
}

export interface LatestRow {
  heroId: number
  win: number
  pick: number
  ban: number
  tier: Tier
  /** Tier score, 0–100 (see src/shared/tiers.ts). */
  score: number
  /** Tencent's rank of this champion within the lane (`strength`, 1 = strongest). */
  cnRank: number | null
  /** Tencent's tier (`strength_level`): 0 = T0 (best) … 5 = T5. */
  cnTier: number | null
  /** Change vs the previous snapshot, in percentage points (null if not present then). */
  dWin: number | null
  dPick: number | null
  dBan: number | null
  prevTier: Tier | null
}

/** public/data/latest.json */
export interface LatestFile {
  schema: 1
  date: string
  previousDate: string | null
  fetchedAt: string
  /** Every snapshot date, ascending. */
  dates: string[]
  brackets: BracketTable<LatestRow>
}

/** [date, win, pick, ban, score] — the tier follows from the score (tierForScore). */
export type HistoryPoint = [date: string, win: number, pick: number, ban: number, score: number]

/** public/data/history/<heroId>.json */
export interface HistoryFile {
  schema: 1
  heroId: number
  series: BracketTable<HistoryPoint>
}

export type MoverWindowId = '1d' | '7d' | '30d' | 'patch'

/** [heroId, win, dWin, pick, dPick] — deltas in percentage points vs the window's base date. */
export type MoverRow = [heroId: number, win: number, dWin: number, pick: number, dPick: number]

export interface MoverWindow {
  id: MoverWindowId
  label: string
  /** Snapshot the latest one is compared with; null while history is too short. */
  baseDate: string | null
  /** Date the window would ideally start at (latest − N days, or the patch date). */
  targetDate: string | null
  /** Patch version for the `patch` window. */
  patch: string | null
  /** Rows present in both snapshots, sorted by dWin descending. Empty when baseDate is null. */
  brackets: BracketTable<MoverRow>
}

/** public/data/movers.json */
export interface MoversFile {
  schema: 1
  date: string
  windows: MoverWindow[]
}
