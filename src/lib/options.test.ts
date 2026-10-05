import { describe, expect, it } from 'vitest'
import { LANE_FILTER_OPTIONS, bracketOptions } from './options.ts'

describe('bracketOptions', () => {
  it('disables brackets without data but never the selected one', () => {
    const options = bracketOptions(new Set(['all', 'diamond'] as const), 'legendary')
    expect(options.map((option) => [option.value, option.disabled])).toEqual([
      ['all', false],
      ['diamond', false],
      ['master', true],
      ['challenger', true],
      ['legendary', false],
    ])
  })
})

describe('LANE_FILTER_OPTIONS', () => {
  it('starts with "All roles" followed by the five lanes', () => {
    expect(LANE_FILTER_OPTIONS.map((option) => option.value)).toEqual(['any', 'baron', 'jungle', 'mid', 'duo', 'support'])
  })
})
