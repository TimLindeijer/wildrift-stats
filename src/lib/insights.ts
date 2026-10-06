import { LANES, LANE_LABELS, type Bracket, type Lane } from '../shared/constants.ts'
import type { LatestFile } from '../shared/types.ts'
import { findLatestRow } from './champion.ts'

/**
 * Lowest pick rate (%) a champion needs in both brackets for the high-elo comparison. Below it,
 * high-elo win rates swing by several points from day to day and are mostly noise.
 */
export const MIN_ELO_PICK = 2

/** A champion is a flex pick when its second most played role has at least this share (%) of its games. */
export const MIN_FLEX_SHARE = 20

export interface LaneShare {
  lane: Lane
  /** Pick rate in this lane, % of all games. */
  pick: number
  /** Share of the champion's listed games played in this lane, % (unrounded). */
  share: number
}

export interface Presence {
  heroId: number
  /** Sum of the pick rates of every lane the champion is listed in, % of all games. */
  pick: number
  /** Ban rate, % of all games. Tencent reports it per champion, so it's the same in every lane. */
  ban: number
  /** pick + ban: the share of games in which the champion was picked or banned. */
  presence: number
  /** The lanes the champion is listed in, most played first. */
  lanes: LaneShare[]
}

interface Listing {
  lane: Lane
  pick: number
  ban: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function laneOrder(a: Lane, b: Lane): number {
  return LANES.indexOf(a) - LANES.indexOf(b)
}

function toPresence(heroId: number, listings: readonly Listing[]): Presence {
  const total = listings.reduce((sum, listing) => sum + listing.pick, 0)
  const ban = Math.max(...listings.map((listing) => listing.ban))
  const lanes = listings
    .map(({ lane, pick }) => ({ lane, pick, share: total > 0 ? (pick / total) * 100 : 0 }))
    .sort((a, b) => b.pick - a.pick || laneOrder(a.lane, b.lane))
  return { heroId, pick: round2(total), ban, presence: round2(total + ban), lanes }
}

/**
 * How often each champion is picked or banned in a bracket, most contested first. Ranked is draft
 * pick, so a champion is in a game at most once and its lane pick rates add up. Tencent only lists
 * a lane once a champion's pick rate there reaches about 1%, so `pick` is a slight underestimate.
 */
export function presenceRows(latest: LatestFile, bracket: Bracket): Presence[] {
  const byHero = new Map<number, Listing[]>()
  for (const lane of LANES) {
    for (const row of latest.brackets[bracket]?.[lane] ?? []) {
      const listings = byHero.get(row.heroId) ?? []
      listings.push({ lane, pick: row.pick, ban: row.ban })
      byHero.set(row.heroId, listings)
    }
  }
  return [...byHero]
    .map(([heroId, listings]) => toPresence(heroId, listings))
    .sort((a, b) => b.presence - a.presence || a.heroId - b.heroId)
}

/** One champion's presence in a bracket, or null if it isn't listed there. */
export function presenceFor(latest: LatestFile, bracket: Bracket, heroId: number): Presence | null {
  const listings: Listing[] = []
  for (const lane of LANES) {
    const row = findLatestRow(latest, bracket, lane, heroId)
    if (row) listings.push({ lane, pick: row.pick, ban: row.ban })
  }
  return listings.length > 0 ? toPresence(heroId, listings) : null
}

/**
 * Whole-number percentages that still add up to 100, using the largest remainder method. Shares
 * that don't add up to about 100 are just rounded.
 */
export function roundShares(shares: readonly number[]): number[] {
  const total = shares.reduce((sum, share) => sum + share, 0)
  if (Math.abs(total - 100) > 0.5) return shares.map((share) => Math.round(share))
  const result = shares.map((share) => Math.floor(share))
  let missing = 100 - result.reduce((sum, share) => sum + share, 0)
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of byRemainder) {
    if (missing <= 0) break
    result[index] = (result[index] ?? 0) + 1
    missing -= 1
  }
  return result
}

/** "Mid 51% · Jungle 49%" */
export function roleSplitText(lanes: readonly LaneShare[]): string {
  const rounded = roundShares(lanes.map((lane) => lane.share))
  return lanes.map((lane, index) => `${LANE_LABELS[lane.lane]} ${rounded[index] ?? 0}%`).join(' · ')
}

/** Champions whose second role has at least `minShare` % of their games, most evenly split first. */
export function flexPicks(rows: readonly Presence[], minShare = MIN_FLEX_SHARE): Presence[] {
  const second = (row: Presence) => row.lanes[1]?.share ?? 0
  return rows
    .filter((row) => second(row) >= minShare)
    .sort((a, b) => second(b) - second(a) || b.pick - a.pick || a.heroId - b.heroId)
}

export interface EloItem {
  heroId: number
  lane: Lane
  /** Win rate in the higher bracket, %. */
  win: number
  /** Win rate across all ranks, %. */
  baseWin: number
  /** win − baseWin, percentage points. */
  diff: number
  pick: number
  basePick: number
}

/**
 * Champions whose win rate in a higher bracket differs most from their win rate across all
 * ranks, biggest gain first. Only lanes picked at least `minPick` % in both brackets count.
 */
export function eloRows(latest: LatestFile, high: Bracket, minPick = MIN_ELO_PICK): EloItem[] {
  if (high === 'all') return []
  const items: EloItem[] = []
  for (const lane of LANES) {
    for (const row of latest.brackets[high]?.[lane] ?? []) {
      const base = findLatestRow(latest, 'all', lane, row.heroId)
      if (!base || row.pick < minPick || base.pick < minPick) continue
      items.push({
        heroId: row.heroId,
        lane,
        win: row.win,
        baseWin: base.win,
        diff: round2(row.win - base.win),
        pick: row.pick,
        basePick: base.pick,
      })
    }
  }
  return items.sort((a, b) => b.diff - a.diff || a.heroId - b.heroId || laneOrder(a.lane, b.lane))
}

/** The `limit` biggest gains and losses; a champion with no difference is neither. */
export function splitElo(items: readonly EloItem[], limit = 10): { better: EloItem[]; worse: EloItem[] } {
  const better = items.filter((item) => item.diff > 0).slice(0, limit)
  const worse = items
    .filter((item) => item.diff < 0)
    .reverse()
    .slice(0, limit)
  return { better, worse }
}

export interface EloDiff {
  /** Win rate in the bracket minus win rate across all ranks, percentage points. */
  diff: number
  /** True when either pick rate is below MIN_ELO_PICK, so the difference is unreliable. */
  lowSample: boolean
}

/** A champion's win-rate difference between a bracket and all ranks in one lane, or null when there's nothing to compare. */
export function eloDiff(latest: LatestFile, bracket: Bracket, lane: Lane, heroId: number, minPick = MIN_ELO_PICK): EloDiff | null {
  if (bracket === 'all') return null
  const row = findLatestRow(latest, bracket, lane, heroId)
  const base = findLatestRow(latest, 'all', lane, heroId)
  if (!row || !base) return null
  return { diff: round2(row.win - base.win), lowSample: row.pick < minPick || base.pick < minPick }
}
