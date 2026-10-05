import { describe, expect, it } from 'vitest'
import { championPath, comparePath } from './routes.ts'

describe('championPath', () => {
  it('links to the champion page without a query by default', () => {
    expect(championPath('garen')).toBe('/champion/garen')
  })

  it('adds the lane and any non-default bracket', () => {
    expect(championPath('kaisa', { lane: 'duo', bracket: 'all' })).toBe('/champion/kaisa?lane=duo')
    expect(championPath('kaisa', { lane: 'duo', bracket: 'master' })).toBe('/champion/kaisa?bracket=master&lane=duo')
  })
})

describe('comparePath', () => {
  it('keeps the champion list readable', () => {
    expect(comparePath(['garen', 'nunu-willump'])).toBe('/compare?c=garen,nunu-willump')
  })

  it('handles an empty selection and a non-default bracket', () => {
    expect(comparePath([])).toBe('/compare')
    expect(comparePath(['ahri'], { bracket: 'diamond' })).toBe('/compare?c=ahri&bracket=diamond')
  })
})
