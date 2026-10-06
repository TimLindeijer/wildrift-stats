import { describe, expect, it } from 'vitest'
import { compareSortValues, isSortDir, nextSort } from './sort.ts'

describe('isSortDir', () => {
  it('accepts only asc and desc', () => {
    expect(isSortDir('asc')).toBe(true)
    expect(isSortDir('desc')).toBe(true)
    expect(isSortDir('up')).toBe(false)
    expect(isSortDir(null)).toBe(false)
  })
})

describe('nextSort', () => {
  const defaults = { name: 'asc', hp: 'desc' } as const

  it('flips the active column', () => {
    expect(nextSort({ key: 'hp', dir: 'desc' }, 'hp', defaults)).toEqual({ key: 'hp', dir: 'asc' })
    expect(nextSort({ key: 'hp', dir: 'asc' }, 'hp', defaults)).toEqual({ key: 'hp', dir: 'desc' })
  })

  it("starts another column at that column's default", () => {
    expect(nextSort({ key: 'hp', dir: 'asc' }, 'name', defaults)).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort({ key: 'name', dir: 'asc' }, 'hp', defaults)).toEqual({ key: 'hp', dir: 'desc' })
  })
})

describe('compareSortValues', () => {
  it('orders numbers and strings in both directions', () => {
    expect(compareSortValues(1, 2, 'asc')).toBeLessThan(0)
    expect(compareSortValues(1, 2, 'desc')).toBeGreaterThan(0)
    expect(compareSortValues('Ahri', 'Garen', 'asc')).toBeLessThan(0)
    expect(compareSortValues('Ahri', 'Garen', 'desc')).toBeGreaterThan(0)
  })

  it('returns zero for equal values', () => {
    expect(compareSortValues(3, 3, 'desc')).toBe(0)
    expect(compareSortValues(null, null, 'asc')).toBe(0)
  })

  it('puts missing values last in both directions', () => {
    expect(compareSortValues(null, 1, 'asc')).toBeGreaterThan(0)
    expect(compareSortValues(null, 1, 'desc')).toBeGreaterThan(0)
    expect(compareSortValues(1, null, 'asc')).toBeLessThan(0)
    expect(compareSortValues(1, null, 'desc')).toBeLessThan(0)
  })
})
