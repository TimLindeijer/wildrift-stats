const MINUS = '\u2212'

/** 51.234 -> "51.2%" */
export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

/**
 * Signed change in percentage points: 0.42 -> "+0.4", -1.25 -> "−1.3" (typographic minus).
 * Values that round to zero are shown unsigned.
 */
export function formatDelta(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Number(value.toFixed(digits))
  if (rounded === 0) return (0).toFixed(digits)
  const abs = Math.abs(rounded).toFixed(digits)
  return rounded > 0 ? `+${abs}` : `${MINUS}${abs}`
}

/** Direction of a delta after rounding, used for colouring. */
export function deltaDirection(value: number | null | undefined, digits = 1): 'up' | 'down' | 'flat' | 'none' {
  if (value == null || !Number.isFinite(value)) return 'none'
  const rounded = Number(value.toFixed(digits))
  if (rounded > 0) return 'up'
  if (rounded < 0) return 'down'
  return 'flat'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-04" -> "Oct 4" (no timezone conversion: dates are calendar dates). */
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map(Number)
  if (!month || !day) return isoDate
  return `${MONTHS[month - 1]} ${day}`
}

/** "2026-10-04" -> "Oct 4, 2026" */
export function formatLongDate(isoDate: string): string {
  const year = isoDate.slice(0, 4)
  return `${formatShortDate(isoDate)}, ${year}`
}
