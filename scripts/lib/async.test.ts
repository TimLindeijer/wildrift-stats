import { describe, expect, it } from 'vitest'
import { breaker, mapSettled, SkippedError } from './async.ts'

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

describe('breaker', () => {
  const failing = async (fail: boolean) => {
    if (fail) throw new Error('down')
    return 'ok'
  }

  it('refuses calls after too many failures in a row', async () => {
    const guarded = breaker(failing, { maxConsecutiveFailures: 2, budgetMs: 60_000 })
    await expect(guarded.call(true)).rejects.toThrow('down')
    await expect(guarded.call(false)).resolves.toBe('ok')
    await expect(guarded.call(true)).rejects.toThrow('down')
    expect(guarded.tripped).toBeNull()
    await expect(guarded.call(true)).rejects.toThrow('down')
    await expect(guarded.call(false)).rejects.toBeInstanceOf(SkippedError)
    expect(guarded.tripped).toBe('2 failures in a row')
  })

  it('refuses calls once the time budget is used up', async () => {
    let time = 1_000
    const guarded = breaker(failing, { maxConsecutiveFailures: 5, budgetMs: 30_000, now: () => time })
    await expect(guarded.call(false)).resolves.toBe('ok')
    time += 30_000
    await expect(guarded.call(false)).rejects.toThrow('Skipped: took longer than 30 s')
    expect(guarded.tripped).toBe('took longer than 30 s')
  })

  it('stops a stalled source within mapSettled', async () => {
    const guarded = breaker(failing, { maxConsecutiveFailures: 3, budgetMs: 60_000 })
    const results = await mapSettled(Array.from({ length: 10 }, () => true), 1, (fail) => guarded.call(fail))
    const skipped = results.filter((result) => result.status === 'rejected' && result.reason instanceof SkippedError)
    expect(results.length - skipped.length).toBe(3)
    expect(skipped).toHaveLength(7)
  })
})
