import type { Bracket, Lane } from '../shared/constants.ts'

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

/** A champion page link. The default bracket ("all") is left out so shared URLs stay short. */
export function championPath(slug: string, options: { bracket?: Bracket; lane?: Lane } = {}): string {
  const params = new URLSearchParams()
  if (options.bracket && options.bracket !== 'all') params.set('bracket', options.bracket)
  if (options.lane) params.set('lane', options.lane)
  return withQuery(`/champion/${encodeURIComponent(slug)}`, params)
}

/** The compare view with these champions selected. */
export function comparePath(slugs: readonly string[], options: { bracket?: Bracket } = {}): string {
  const params = new URLSearchParams()
  if (slugs.length > 0) params.set('c', slugs.join(','))
  if (options.bracket && options.bracket !== 'all') params.set('bracket', options.bracket)
  // Commas are safe in a query string and keep the list readable.
  return withQuery('/compare', params).replaceAll('%2C', ',')
}
