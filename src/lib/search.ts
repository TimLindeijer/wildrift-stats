export interface Searchable {
  name: string
  slug: string
  nameZh: string
}

/** Lower-case letters and digits only, accents stripped: "Kai'Sa" -> "kaisa". Keeps CJK characters. */
export function searchKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * How well a champion matches a search query: 0 = the name starts with it, 1 = a word of the
 * name starts with it, 2 = it appears anywhere (also in the slug or Chinese name), -1 = no match.
 * An empty query matches everything with rank 0.
 */
export function matchRank(champion: Searchable, query: string): number {
  const q = searchKey(query)
  if (!q) return 0
  const name = searchKey(champion.name)
  if (name.startsWith(q)) return 0
  if (champion.name.split(/[\s&.'-]+/).some((word) => searchKey(word).startsWith(q))) return 1
  if (name.includes(q) || searchKey(champion.slug).includes(q) || searchKey(champion.nameZh).includes(q)) return 2
  return -1
}

export function matchesQuery(champion: Searchable, query: string): boolean {
  return matchRank(champion, query) >= 0
}

/** Best matches first, then alphabetical. */
export function suggest<T extends Searchable>(champions: readonly T[], query: string, limit: number): T[] {
  return champions
    .map((champion) => ({ champion, rank: matchRank(champion, query) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.champion.name.localeCompare(b.champion.name, 'en'))
    .slice(0, limit)
    .map((entry) => entry.champion)
}
