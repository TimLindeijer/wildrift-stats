import { describe, expect, it } from 'vitest'
import { deltaDirection, formatDelta, formatLongDate, formatPct, formatShortDate } from './format.ts'

describe('formatPct', () => {
  it('formats percentages with one decimal by default', () => {
    expect(formatPct(51.234)).toBe('51.2%')
    expect(formatPct(0.04, 2)).toBe('0.04%')
  })

  it('renders missing values as an em dash', () => {
    expect(formatPct(null)).toBe('—')
    expect(formatPct(Number.NaN)).toBe('—')
  })
})

describe('formatDelta', () => {
  it('signs positive and negative changes', () => {
    expect(formatDelta(0.42)).toBe('+0.4')
    expect(formatDelta(-1.25)).toBe('\u22121.3')
  })

  it('does not sign values that round to zero', () => {
    expect(formatDelta(0.04)).toBe('0.0')
    expect(formatDelta(-0.04)).toBe('0.0')
  })

  it('renders missing values as an em dash', () => {
    expect(formatDelta(null)).toBe('—')
  })
})

describe('deltaDirection', () => {
  it('uses the rounded value', () => {
    expect(deltaDirection(0.2)).toBe('up')
    expect(deltaDirection(-0.2)).toBe('down')
    expect(deltaDirection(0.01)).toBe('flat')
    expect(deltaDirection(undefined)).toBe('none')
  })
})

describe('dates', () => {
  it('formats calendar dates without timezone shifts', () => {
    expect(formatShortDate('2026-10-04')).toBe('Oct 4')
    expect(formatLongDate('2026-01-31')).toBe('Jan 31, 2026')
  })
})
