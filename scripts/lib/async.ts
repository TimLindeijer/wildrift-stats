/** Map over `items` with at most `limit` calls in flight. Results keep the input order. */
export async function mapSettled<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array<PromiseSettledResult<R>>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index] as T, index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}

/** The error for calls a {@link breaker} refused to start. */
export class SkippedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkippedError'
  }
}

export interface BreakerOptions {
  /** Refuse new calls once this many calls in a row have failed. */
  maxConsecutiveFailures: number
  /** Refuse new calls once this long has passed since the breaker was created. */
  budgetMs: number
  now?: () => number
}

export interface Breaker<A extends unknown[], R> {
  call: (...args: A) => Promise<R>
  /** Why the breaker started refusing calls, or null while it still lets them through. */
  readonly tripped: string | null
}

/**
 * Wrap `fn` so a source that is down, blocking us or stalling can't hold up the whole run: after
 * `maxConsecutiveFailures` failures in a row, or once `budgetMs` has passed, new calls reject with a
 * SkippedError without running. Calls already in flight still finish.
 */
export function breaker<A extends unknown[], R>(fn: (...args: A) => Promise<R>, options: BreakerOptions): Breaker<A, R> {
  const { maxConsecutiveFailures, budgetMs, now = Date.now } = options
  const deadline = now() + budgetMs
  let failuresInARow = 0
  let tripped: string | null = null
  return {
    get tripped() {
      return tripped
    },
    async call(...args: A): Promise<R> {
      if (tripped === null && failuresInARow >= maxConsecutiveFailures) tripped = `${failuresInARow} failures in a row`
      if (tripped === null && now() >= deadline) tripped = `took longer than ${Math.round(budgetMs / 1000)} s`
      if (tripped !== null) throw new SkippedError(`Skipped: ${tripped}`)
      try {
        const result = await fn(...args)
        failuresInARow = 0
        return result
      } catch (error) {
        failuresInARow++
        throw error
      }
    },
  }
}
