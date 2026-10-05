/**
 * Calendar-date helpers shared by the data pipeline and the frontend.
 * Dates are plain YYYY-MM-DD calendar dates; all arithmetic is done in UTC so it never
 * depends on the viewer's or runner's timezone.
 */
import type { Patch } from './types.ts'

const DAY_MS = 86_400_000

/** Shift a YYYY-MM-DD date by whole days (UTC). */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD date; a compact numeric axis for charts. */
export function isoToDay(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS)
}

/** Inverse of isoToDay. */
export function dayToIso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** The newest patch released on or before `date`. */
export function currentPatch(patches: readonly Patch[], date: string): Patch | null {
  let result: Patch | null = null
  for (const patch of patches) {
    if (patch.date <= date && (!result || patch.date >= result.date)) result = patch
  }
  return result
}
