/** Read a validated query parameter, falling back when it's missing or invalid. */
export function readParam<T extends string>(
  params: URLSearchParams,
  key: string,
  isValid: (value: unknown) => value is T,
  fallback: T,
): T {
  const value = params.get(key)
  return isValid(value) ? value : fallback
}

/** A comma-separated list parameter, e.g. `?c=garen,ahri`. */
export function readList(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * A copy of `params` with `changes` applied. A null or empty value, or one equal to its default,
 * removes the key so shared URLs stay short.
 */
export function withParams(
  params: URLSearchParams,
  changes: Record<string, string | null>,
  defaults: Readonly<Record<string, string>> = {},
): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '' || value === defaults[key]) next.delete(key)
    else next.set(key, value)
  }
  return next
}
