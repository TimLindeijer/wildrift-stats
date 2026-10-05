export interface FetchOptions {
  headers?: Record<string, string>
  /** Per-attempt timeout. */
  timeoutMs?: number
  /** Total attempts = retries + 1. */
  retries?: number
  /** First backoff delay; doubles on each retry. */
  backoffMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  log?: (message: string) => void
}

export class HttpError extends Error {
  readonly status: number
  readonly url: string

  constructor(status: number, url: string, statusText = '') {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ''} for ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 408 || error.status === 429 || error.status >= 500
  // Network failures, DNS errors, aborted/timed-out requests.
  return true
}

/** GET a URL as text with a per-attempt timeout and exponential backoff on transient failures. */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const {
    headers = {},
    timeoutMs = 20_000,
    retries = 3,
    backoffMs = 1_000,
    fetchImpl = fetch,
    sleep = defaultSleep,
    log = () => {},
  } = options

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) throw new HttpError(response.status, url, response.statusText)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt === retries || !isRetryable(error)) break
      const delay = backoffMs * 2 ** attempt
      log(`Attempt ${attempt + 1}/${retries + 1} for ${url} failed (${describeError(error)}); retrying in ${delay} ms`)
      await sleep(delay)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** GET and parse JSON. Throws a descriptive error if the body is not JSON. */
export async function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const text = await fetchText(url, options)
  return parseJsonText(text, url)
}

export function parseJsonText(text: string, source: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    const preview = text.slice(0, 200).replace(/\s+/g, ' ')
    throw new Error(`Expected JSON from ${source} but got: ${preview}`, { cause: error })
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    const causeText = cause instanceof Error ? `: ${cause.message}` : ''
    return `${error.name}: ${error.message}${causeText}`
  }
  return String(error)
}
