import { describe, expect, it } from 'vitest'
import { abilityNumbers, formatRanks, hasEnglishText, usesGenericResource } from './abilities.ts'

/* Real values from Tencent's champion files for patch 7.3. */

describe('formatRanks', () => {
  it('joins per-rank values with slashes', () => {
    expect(formatRanks([9, 8, 8, 7])).toBe('9/8/8/7')
    expect(formatRanks([105, 95, 85])).toBe('105/95/85')
  })

  it('collapses equal ranks to one value', () => {
    expect(formatRanks([65, 65, 65, 65])).toBe('65')
    expect(formatRanks([90])).toBe('90')
  })

  it('keeps up to two decimals', () => {
    expect(formatRanks([0.5, 1.25, 1.333])).toBe('0.5/1.25/1.33')
  })

  it('returns null without usable values', () => {
    expect(formatRanks(null)).toBeNull()
    expect(formatRanks(undefined)).toBeNull()
    expect(formatRanks([])).toBeNull()
    expect(formatRanks([5, Number.NaN])).toBeNull()
  })
})

describe('abilityNumbers', () => {
  it('gives passives without a cooldown or cost nothing', () => {
    expect(abilityNumbers({ cooldown: null, cost: null })).toEqual([])
  })

  it('formats a cooldown that changes by rank', () => {
    // Garen's Decisive Strike costs nothing.
    expect(abilityNumbers({ cooldown: [9, 8, 8, 7], cost: null })).toEqual([
      { key: 'cooldown', label: 'Cooldown', text: '9/8/8/7 s', spoken: '9, 8, 8 and 7 seconds by rank' },
    ])
  })

  it('formats mana costs and collapses equal ranks', () => {
    // Norra's Threads of Homecoming.
    expect(abilityNumbers({ cooldown: [12, 10, 9, 7], cost: { type: 'mana', values: [65, 65, 65, 65] } })).toEqual([
      { key: 'cooldown', label: 'Cooldown', text: '12/10/9/7 s', spoken: '12, 10, 9 and 7 seconds by rank' },
      { key: 'cost', label: 'Cost', text: '65 mana', spoken: '65 mana' },
    ])
  })

  it('labels health, percent-of-health and generic resource costs', () => {
    // Dr. Mundo's Infected Bonesaw, Vladimir's Sanguine Pool and Kennen's Thundering Shuriken.
    expect(abilityNumbers({ cooldown: [4], cost: { type: 'health', values: [50] } })).toEqual([
      { key: 'cooldown', label: 'Cooldown', text: '4 s', spoken: '4 seconds' },
      { key: 'cost', label: 'Cost', text: '50 health', spoken: '50 health' },
    ])
    expect(abilityNumbers({ cooldown: null, cost: { type: 'health%', values: [20, 20, 20, 20] } })).toEqual([
      { key: 'cost', label: 'Cost', text: '20% health', spoken: '20% health' },
    ])
    expect(abilityNumbers({ cooldown: null, cost: { type: 'resource', values: [60, 55, 50, 45] } })).toEqual([
      { key: 'cost', label: 'Cost', text: '60/55/50/45 resource', spoken: '60, 55, 50 and 45 resource by rank' },
    ])
  })

  it('says "second" for a one-second cooldown', () => {
    // Akali's Five Point Strike.
    expect(abilityNumbers({ cooldown: [1, 1, 1, 1], cost: null })[0]).toMatchObject({ text: '1 s', spoken: '1 second' })
  })

  it('skips empty value lists', () => {
    expect(abilityNumbers({ cooldown: [], cost: { type: 'mana', values: [] } })).toEqual([])
  })
})

describe('usesGenericResource', () => {
  it('is true only when an ability costs the generic resource', () => {
    expect(usesGenericResource([{ cost: null }, { cost: { type: 'resource', values: [40] } }])).toBe(true)
    expect(usesGenericResource([{ cost: null }, { cost: { type: 'mana', values: [40] } }])).toBe(false)
    expect(usesGenericResource([])).toBe(false)
  })
})

describe('hasEnglishText', () => {
  it('is true when at least one ability has an English name', () => {
    expect(hasEnglishText([{ name: null }, { name: 'Decisive Strike' }])).toBe(true)
    expect(hasEnglishText([{ name: null }, { name: null }])).toBe(false)
    expect(hasEnglishText([])).toBe(false)
  })
})
