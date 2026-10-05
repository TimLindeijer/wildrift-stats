import { BRACKETS, BRACKET_SHORT_LABELS, LANES, LANE_LABELS, type Bracket } from '../shared/constants.ts'
import type { LaneFilter } from './tierTable.ts'

export interface Option<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

/**
 * Bracket choices with the ones missing from the data disabled. The selected bracket stays
 * enabled so the radio group always has a focusable member.
 */
export function bracketOptions(available: ReadonlySet<Bracket>, selected: Bracket): Option<Bracket>[] {
  return BRACKETS.map((value) => ({
    value,
    label: BRACKET_SHORT_LABELS[value],
    disabled: !available.has(value) && value !== selected,
  }))
}

export const LANE_FILTER_OPTIONS: readonly Option<LaneFilter>[] = [
  { value: 'any', label: 'All roles' },
  ...LANES.map((lane) => ({ value: lane, label: LANE_LABELS[lane] })),
]
