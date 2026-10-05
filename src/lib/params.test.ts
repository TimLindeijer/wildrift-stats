import { describe, expect, it } from 'vitest'
import { isBracket } from '../shared/constants.ts'
import { readList, readParam, withParams } from './params.ts'

describe('params', () => {
  it('reads valid values and falls back otherwise', () => {
    expect(readParam(new URLSearchParams('bracket=master'), 'bracket', isBracket, 'all')).toBe('master')
    expect(readParam(new URLSearchParams('bracket=iron'), 'bracket', isBracket, 'all')).toBe('all')
    expect(readParam(new URLSearchParams(''), 'bracket', isBracket, 'all')).toBe('all')
  })

  it('reads comma-separated lists', () => {
    expect(readList(new URLSearchParams('c=garen,%20ahri,,'), 'c')).toEqual(['garen', 'ahri'])
    expect(readList(new URLSearchParams(''), 'c')).toEqual([])
  })

  it('applies changes without mutating and drops defaults and empties', () => {
    const before = new URLSearchParams('bracket=master&lane=mid&q=ah')
    const after = withParams(before, { bracket: 'all', lane: 'jungle', q: '' }, { bracket: 'all' })
    expect(after.toString()).toBe('lane=jungle')
    expect(before.toString()).toBe('bracket=master&lane=mid&q=ah')
  })
})
