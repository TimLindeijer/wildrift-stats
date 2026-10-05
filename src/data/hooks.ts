import { use } from 'react'
import type { HistoryFile, MoversFile } from '../shared/types.ts'
import { loadCore, loadHistory, loadMovers, type CoreData } from './load.ts'

/* These hooks suspend while loading and throw DataError on failure: render them inside
   <Suspense> and an error boundary. */

export function useCoreData(): CoreData {
  return use(loadCore())
}

export function useHistory(heroId: number): HistoryFile {
  const { version } = useCoreData()
  return use(loadHistory(heroId, version))
}

/** Several champions' histories, fetched in parallel. */
export function useHistories(heroIds: readonly number[]): HistoryFile[] {
  const { version } = useCoreData()
  // Start every request before suspending on the first, so they don't load one after another.
  const promises = heroIds.map((heroId) => loadHistory(heroId, version))
  const histories: HistoryFile[] = []
  for (const promise of promises) histories.push(use(promise))
  return histories
}

export function useMovers(): MoversFile {
  const { version } = useCoreData()
  return use(loadMovers(version))
}
