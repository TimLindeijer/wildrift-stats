import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listFiles, readJsonFile, writeIfChanged } from './fs.ts'
import { formatJson, stableStringify } from './json.ts'

describe('formatJson', () => {
  it('inlines short containers and expands long ones', () => {
    const value = { a: 1, rows: [{ id: 1, v: 'x' }, { id: 2, v: 'y' }], empty: [], nested: { deep: true } }
    expect(formatJson(value, 30)).toBe(
      '{\n  "a": 1,\n  "rows": [\n    {"id":1,"v":"x"},\n    {"id":2,"v":"y"}\n  ],\n  "empty": [],\n  "nested": {"deep":true}\n}\n',
    )
  })

  it('round-trips and drops undefined properties', () => {
    const value = { a: [1, 2, { b: null }], c: undefined, d: 'é' }
    expect(JSON.parse(formatJson(value, 5))).toEqual({ a: [1, 2, { b: null }], d: 'é' })
  })
})

describe('stableStringify', () => {
  it('ignores key order', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }))
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]))
  })
})

describe('file helpers', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wr-fs-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writeIfChanged only writes when content differs', async () => {
    const path = join(dir, 'nested', 'file.json')
    expect(await writeIfChanged(path, 'a')).toBe(true)
    expect(await writeIfChanged(path, 'a')).toBe(false)
    expect(await writeIfChanged(path, 'b')).toBe(true)
    expect(await readFile(path, 'utf8')).toBe('b')
  })

  it('readJsonFile returns undefined for missing files', async () => {
    expect(await readJsonFile(join(dir, 'missing.json'))).toBeUndefined()
    await writeIfChanged(join(dir, 'x.json'), '{"a":1}')
    expect(await readJsonFile(join(dir, 'x.json'))).toEqual({ a: 1 })
  })

  it('listFiles returns [] for missing directories', async () => {
    expect(await listFiles(join(dir, 'nope'))).toEqual([])
    await writeIfChanged(join(dir, 'b.json'), '1')
    expect(await listFiles(dir)).toEqual(['b.json'])
  })
})
