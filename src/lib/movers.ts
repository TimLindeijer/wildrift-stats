import { LANES, type Bracket, type Lane } from '../shared/constants.ts'
import { addDays, isoToDay } from '../shared/dates.ts'
import type { MoverWindow, MoverWindowId } from '../shared/types.ts'
import type { LaneFilter } from './tierTable.ts'

const MOVER_WINDOW_IDS: readonly MoverWindowId[] = ['1d', '7d', '30d', 'patch']

export function isMoverWindowId(value: unknown): value is MoverWindowId {
  return typeof value === 'string' && (MOVER_WINDOW_IDS as readonly string[]).includes(value)
}

export interface MoverItem {
  heroId: number
  lane: Lane
  win: number
  dWin: number
  pick: number
  dPick: number
}

/** A window's rows for one bracket and role filter, biggest win-rate gain first. */
export function windowItems(window: MoverWindow, bracket: Bracket, lane: LaneFilter): MoverItem[] {
  const lanes = lane === 'any' ? LANES : [lane]
  const items: MoverItem[] = []
  for (const laneKey of lanes) {
    for (const [heroId, win, dWin, pick, dPick] of window.brackets[bracket]?.[laneKey] ?? []) {
      items.push({ heroId, lane: laneKey, win, dWin, pick, dPick })
    }
  }
  return items.sort((a, b) => b.dWin - a.dWin || a.heroId - b.heroId)
}

/** The top `limit` risers and fallers; a champion that didn't move is neither. */
export function splitMovers(items: readonly MoverItem[], limit = 10): { rising: MoverItem[]; falling: MoverItem[] } {
  const rising = items.filter((item) => item.dWin > 0).slice(0, limit)
  const falling = items
    .filter((item) => item.dWin < 0)
    .reverse()
    .slice(0, limit)
  return { rising, falling }
}

/**
 * The first stats date for which a window that has no base snapshot yet will fill in, given the
 * date history starts at. N-day windows need a snapshot N days older than the latest one; the
 * patch window needs a second snapshot from the current patch. Null when it can't be known.
 */
export function windowReadyDate(window: MoverWindow, latestDate: string, firstDate: string): string | null {
  if (window.baseDate !== null || window.targetDate === null) return null
  if (window.id === 'patch') {
    const start = window.targetDate > firstDate ? window.targetDate : firstDate
    return addDays(start, 1)
  }
  const days = isoToDay(latestDate) - isoToDay(window.targetDate)
  return addDays(firstDate, days)
}
