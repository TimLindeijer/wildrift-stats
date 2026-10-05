import { describe, expect, it } from 'vitest'
import { addDays, currentPatch, dayToIso, isoToDay } from './dates.ts'

describe('dates', () => {
  it('shifts calendar dates across month and year ends', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('round-trips day numbers', () => {
    expect(isoToDay('1970-01-02')).toBe(1)
    expect(isoToDay('2026-10-05') - isoToDay('2026-10-04')).toBe(1)
    expect(dayToIso(isoToDay('2026-10-04'))).toBe('2026-10-04')
  })

  it('finds the newest patch released on or before a date', () => {
    const patches = [
      { version: '7.3', date: '2026-09-21' },
      { version: '7.3a', date: '2026-09-29' },
    ]
    expect(currentPatch(patches, '2026-09-20')).toBeNull()
    expect(currentPatch(patches, '2026-09-21')?.version).toBe('7.3')
    expect(currentPatch(patches, '2026-10-04')?.version).toBe('7.3a')
  })
})
