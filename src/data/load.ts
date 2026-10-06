import type {
  BaseStats,
  BaseStatsFile,
  HistoryFile,
  LatestFile,
  MoversFile,
  Patch,
  PublicChampion,
  PublicChampionsFile,
} from '../shared/types.ts'

const DATA_URL = `${import.meta.env.BASE_URL}data/`

export class DataError extends Error {
  /** HTTP status, or null when the request never got a response. */
  readonly status: number | null

  constructor(message: string, status: number | null = null, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DataError'
    this.status = status
  }
}

/*
 * Promises are cached per key so React's `use()` sees the same promise on every render. A
 * rejected promise stays cached (re-rendering it must not refetch in a loop) until the error
 * boundary's retry button calls forgetFailedLoads().
 */
const cache = new Map<string, Promise<unknown>>()
const failed = new Set<string>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let promise = cache.get(key) as Promise<T> | undefined
  if (!promise) {
    promise = load()
    promise.catch(() => failed.add(key))
    cache.set(key, promise)
  }
  return promise
}

export function forgetFailedLoads(): void {
  for (const key of failed) cache.delete(key)
  failed.clear()
}

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const file = path.split('?')[0]
  let response: Response
  try {
    response = await fetch(`${DATA_URL}${path}`, init)
  } catch (error) {
    throw new DataError('Could not reach the server. Check your connection and try again.', null, { cause: error })
  }
  if (!response.ok) throw new DataError(`Loading ${file} failed (HTTP ${response.status}).`, response.status)
  try {
    return await response.json()
  } catch (error) {
    throw new DataError(`${file} is not valid JSON.`, response.status, { cause: error })
  }
}

function expectSchema<T extends { schema: number }>(value: unknown, file: string): T {
  if (typeof value !== 'object' || value === null || (value as { schema?: unknown }).schema !== 1) {
    throw new DataError(`${file} has an unexpected format. Reload the page to get the latest version of the site.`)
  }
  return value as T
}

export interface CoreData {
  latest: LatestFile
  champions: PublicChampion[]
  patches: Patch[]
  byId: ReadonlyMap<number, PublicChampion>
  bySlug: ReadonlyMap<string, PublicChampion>
  /** Changes whenever new data is published; appended to lazily loaded files to bust caches. */
  version: string
}

/** latest.json, champions.json and patches.json: everything the first screen needs. */
export function loadCore(): Promise<CoreData> {
  return cached('core', async () => {
    // Small files that change daily: always revalidate with the server (cheap 304s).
    const init: RequestInit = { cache: 'no-cache' }
    const [latestJson, championsJson, patchesJson] = await Promise.all([
      fetchJson('latest.json', init),
      fetchJson('champions.json', init),
      fetchJson('patches.json', init),
    ])
    const latest = expectSchema<LatestFile>(latestJson, 'latest.json')
    const { champions } = expectSchema<PublicChampionsFile>(championsJson, 'champions.json')
    if (!Array.isArray(patchesJson)) throw new DataError('patches.json has an unexpected format.')
    return {
      latest,
      champions,
      patches: patchesJson as Patch[],
      byId: new Map(champions.map((champion) => [champion.heroId, champion])),
      bySlug: new Map(champions.map((champion) => [champion.slug, champion])),
      version: latest.fetchedAt,
    }
  })
}

export function loadHistory(heroId: number, version: string): Promise<HistoryFile> {
  const path = `history/${heroId}.json?v=${encodeURIComponent(version)}`
  return cached(path, async () => expectSchema<HistoryFile>(await fetchJson(path), `history/${heroId}.json`))
}

export function loadMovers(version: string): Promise<MoversFile> {
  const path = `movers.json?v=${encodeURIComponent(version)}`
  return cached(path, async () => expectSchema<MoversFile>(await fetchJson(path), 'movers.json'))
}

export interface BaseStatsData {
  file: BaseStatsFile
  byId: ReadonlyMap<number, BaseStats>
}

export function loadBaseStats(version: string): Promise<BaseStatsData> {
  const path = `base-stats.json?v=${encodeURIComponent(version)}`
  return cached(path, async () => {
    const file = expectSchema<BaseStatsFile>(await fetchJson(path), 'base-stats.json')
    return { file, byId: new Map(file.champions.map((stats) => [stats.heroId, stats])) }
  })
}
