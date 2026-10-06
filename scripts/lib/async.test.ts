import { describe, expect, it } from 'vitest'
import { mapSettled } from './async.ts'

describe('mapSettled', () => {
  it('keeps input order, captures failures and respects the limit', async () => {
    let active = 0
    let peak = 0
    const results = await mapSettled([30, 10, 20, 0, 5], 2, async (ms, index) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, ms))
      active--
      if (index === 3) throw new Error('boom')
      return ms * 2
    })
    expect(peak).toBe(2)
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : (r.reason as Error).message))).toEqual([
      60,
      20,
      40,
      'boom',
      10,
    ])
  })

  it('handles empty input', async () => {
    expect(await mapSettled([], 6, async () => 1)).toEqual([])
  })
})
