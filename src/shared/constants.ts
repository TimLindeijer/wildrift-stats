/**
 * Shared constants for the data pipeline (scripts/) and the frontend (src/).
 * Keep this file free of DOM and Node APIs: it is type-checked in both projects.
 */

export const BRACKETS = ['all', 'diamond', 'master', 'challenger', 'legendary'] as const
export type Bracket = (typeof BRACKETS)[number]

export const BRACKET_LABELS: Record<Bracket, string> = {
  all: 'All ranks',
  diamond: 'Diamond+',
  master: 'Master+',
  challenger: 'Challenger+',
  legendary: 'Legendary',
}

/** Short labels for compact controls. */
export const BRACKET_SHORT_LABELS: Record<Bracket, string> = {
  all: 'All',
  diamond: 'Diamond+',
  master: 'Master+',
  challenger: 'Challenger+',
  legendary: 'Legendary',
}

export const LANES = ['baron', 'jungle', 'mid', 'duo', 'support'] as const
export type Lane = (typeof LANES)[number]

export const LANE_LABELS: Record<Lane, string> = {
  baron: 'Baron',
  jungle: 'Jungle',
  mid: 'Mid',
  duo: 'Duo',
  support: 'Support',
}

export function isBracket(value: unknown): value is Bracket {
  return typeof value === 'string' && (BRACKETS as readonly string[]).includes(value)
}

export function isLane(value: unknown): value is Lane {
  return typeof value === 'string' && (LANES as readonly string[]).includes(value)
}
