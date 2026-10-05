import { describe, expect, it, vi } from 'vitest'
import { fetchJson, fetchText, HttpError } from './http.ts'

function response(status: number, body = ''): Response {
  return new Response(body, { status })
}

describe('fetchText', () => {
  it('retries transient failures with exponential backoff', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, 'ok'))
    const sleep = vi.fn(async () => {})

    await expect(fetchText('https://x.test', { fetchImpl, sleep, backoffMs: 100 })).resolves.toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[100], [200]])
  })

  it('sends the given headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(200, 'ok'))
    await fetchText('https://x.test', { fetchImpl, headers: { Referer: 'https://lolm.qq.com/' } })
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({ Referer: 'https://lolm.qq.com/' })
  })

  it('does not retry client errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(404))
    const sleep = vi.fn(async () => {})
    await expect(fetchText('https://x.test', { fetchImpl, sleep })).rejects.toBeInstanceOf(HttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('gives up after the configured retries', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(500))
    const sleep = vi.fn(async () => {})
    await expect(fetchText('https://x.test', { fetchImpl, sleep, retries: 2 })).rejects.toThrow('HTTP 500')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})

describe('fetchJson', () => {
  it('parses JSON and reports non-JSON bodies', async () => {
    const ok = vi.fn<typeof fetch>().mockResolvedValue(response(200, '{"a":1}'))
    await expect(fetchJson('https://x.test', { fetchImpl: ok })).resolves.toEqual({ a: 1 })

    const html = vi.fn<typeof fetch>().mockResolvedValue(response(200, '<html>blocked</html>'))
    await expect(fetchJson('https://x.test', { fetchImpl: html })).rejects.toThrow('Expected JSON')
  })
})
