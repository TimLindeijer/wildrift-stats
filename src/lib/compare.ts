import { LANES, isLane, type Bracket, type Lane } from '../shared/constants.ts'
import type { LatestFile } from '../shared/types.ts'

/** The compare view's role setting: each champion's own main role, or one fixed role for all. */
export type CompareLane = Lane | 'main'

export function isCompareLane(value: unknown): value is CompareLane {
  return value === 'main' || isLane(value)
}

/** Known slugs from the `c` parameter in their original order, without duplicates, at most `max`. */
export function compareSlugs(slugs: readonly string[], isKnown: (slug: string) => boolean, max: number): string[] {
  const result: string[] = []
  for (const raw of slugs) {
    if (result.length === max) break
    const slug = raw.toLowerCase()
    if (isKnown(slug) && !result.includes(slug)) result.push(slug)
  }
  return result
}

/**
 * Hero ids by pick rate in a bracket, most picked first. With a lane, only that lane counts;
 * otherwise each champion's best lane does.
 */
export function mostPicked(latest: LatestFile, bracket: Bracket, limit: number, lane: CompareLane = 'main'): number[] {
  const best = new Map<number, number>()
  for (const key of lane === 'main' ? LANES : [lane]) {
    for (const row of latest.brackets[bracket]?.[key] ?? []) {
      best.set(row.heroId, Math.max(best.get(row.heroId) ?? 0, row.pick))
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([heroId]) => heroId)
}
