export type SortDir = 'asc' | 'desc'

export interface SortState<K extends string> {
  key: K
  dir: SortDir
}

export function isSortDir(value: unknown): value is SortDir {
  return value === 'asc' || value === 'desc'
}

/** Clicking the active column flips it; clicking another column starts at that column's default. */
export function nextSort<K extends string>(
  current: SortState<K>,
  clicked: K,
  defaults: Readonly<Record<K, SortDir>>,
): SortState<K> {
  if (current.key === clicked) return { key: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key: clicked, dir: defaults[clicked] }
}

/** Order of two sort values in a direction. Missing values go last either way; 0 when equal. */
export function compareSortValues(a: number | string | null, b: number | string | null, dir: SortDir): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const order = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'en') : Number(a) - Number(b)
  return dir === 'asc' ? order : -order
}
