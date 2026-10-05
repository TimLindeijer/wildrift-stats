import { BRACKETS, LANES, type Bracket, type Lane } from '../shared/constants.ts'
import type { HistoryFile, LatestFile, LatestRow } from '../shared/types.ts'

const rowIndex = new WeakMap<LatestFile, Map<string, LatestRow>>()

function indexKey(bracket: Bracket, lane: Lane, heroId: number): string {
  return `${bracket}:${lane}:${heroId}`
}

/** A champion's row in the latest snapshot, if it's listed in that bracket and lane. */
export function findLatestRow(latest: LatestFile, bracket: Bracket, lane: Lane, heroId: number): LatestRow | undefined {
  let index = rowIndex.get(latest)
  if (!index) {
    index = new Map()
    for (const b of BRACKETS) {
      for (const l of LANES) {
        for (const row of latest.brackets[b]?.[l] ?? []) index.set(indexKey(b, l, row.heroId), row)
      }
    }
    rowIndex.set(latest, index)
  }
  return index.get(indexKey(bracket, lane, heroId))
}

/** Lanes in which the champion has any data in a bracket: latest snapshot or history. */
export function lanesWithData(latest: LatestFile, history: HistoryFile | null, bracket: Bracket, heroId: number): Lane[] {
  return LANES.filter(
    (lane) => findLatestRow(latest, bracket, lane, heroId) !== undefined || (history?.series[bracket]?.[lane]?.length ?? 0) > 0,
  )
}

export function bracketsWithData(latest: LatestFile, history: HistoryFile | null, heroId: number): Bracket[] {
  return BRACKETS.filter((bracket) => lanesWithData(latest, history, bracket, heroId).length > 0)
}

/**
 * The lane a champion is played in most in a bracket: highest pick rate in the latest snapshot,
 * else the lane with the most history. Null if the champion has no data in the bracket.
 */
export function mainLane(latest: LatestFile, history: HistoryFile | null, bracket: Bracket, heroId: number): Lane | null {
  let best: Lane | null = null
  let bestPick = -1
  for (const lane of LANES) {
    const row = findLatestRow(latest, bracket, lane, heroId)
    if (row && row.pick > bestPick) {
      best = lane
      bestPick = row.pick
    }
  }
  if (best) return best
  let mostPoints = 0
  for (const lane of LANES) {
    const points = history?.series[bracket]?.[lane]?.length ?? 0
    if (points > mostPoints) {
      best = lane
      mostPoints = points
    }
  }
  return best
}

/** Brackets that have any rows at all in the latest snapshot (Tencent sends an empty Legendary bracket). */
export function bracketsInLatest(latest: LatestFile): Set<Bracket> {
  return new Set(BRACKETS.filter((bracket) => LANES.some((lane) => (latest.brackets[bracket]?.[lane]?.length ?? 0) > 0)))
}
