import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HistoryFile, LatestFile, MoversFile, PublicChampionsFile } from '../src/shared/types.ts'

const script = fileURLToPath(new URL('./build-data.ts', import.meta.url))

const snapshot = (date: string, win: number) => ({
  schema: 1,
  date,
  fetchedAt: `${date}T20:00:00Z`,
  source: 'test',
  brackets: {
    all: {
      mid: [
        { heroId: 1, win, pick: 10, ban: 5, strength: 1, strengthLevel: 0 },
        { heroId: 2, win: 50, pick: 5, ban: 1, strength: 2, strengthLevel: 1 },
      ],
    },
  },
})

const champion = (heroId: number, name: string) => ({
  heroId,
  slug: name.toLowerCase(),
  name,
  nameSource: 'ddragon',
  title: null,
  key: name,
  nameZh: name,
  titleZh: name,
  avatar: `https://example.com/${heroId}.png`,
  lanes: ['mid'],
  roles: ['Mage'],
})

describe('build-data CLI', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wr-build-'))
    await mkdir(join(dir, 'data', 'snapshots'), { recursive: true })
    await writeFile(join(dir, 'data', 'patches.json'), JSON.stringify([{ version: '7.3', date: '2026-09-21' }]))
    await writeFile(
      join(dir, 'data', 'champions.json'),
      JSON.stringify({ schema: 1, champions: [champion(2, 'Zed'), champion(1, 'Ahri'), champion(3, 'Lux')] }),
    )
    for (const [date, win] of [
      ['2026-10-01', 52],
      ['2026-10-02', 53.5],
    ] as const) {
      await writeFile(join(dir, 'data', 'snapshots', `${date}.json`), JSON.stringify(snapshot(date, win)))
    }
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const run = () =>
    execFileSync(process.execPath, [script, '--data-dir', join(dir, 'data'), '--out', join(dir, 'out')], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
  const read = async <T,>(path: string) => JSON.parse(await readFile(join(dir, 'out', path), 'utf8')) as T

  it('writes latest, movers, histories and copies of the reference data', async () => {
    await mkdir(join(dir, 'out', 'history'), { recursive: true })
    await writeFile(join(dir, 'out', 'history', 'stale.json'), '{}')

    expect(run()).toMatch(/from 2 snapshot\(s\), 2026-10-01 to 2026-10-02/)

    const latest = await read<LatestFile>('latest.json')
    expect(latest).toMatchObject({ date: '2026-10-02', previousDate: '2026-10-01', dates: ['2026-10-01', '2026-10-02'] })
    expect(latest.brackets.all?.mid?.[0]).toMatchObject({ heroId: 1, win: 53.5, dWin: 1.5, tier: 'S+' })

    const movers = await read<MoversFile>('movers.json')
    expect(movers.windows.find((w) => w.id === '1d')?.brackets.all?.mid?.[0]).toEqual([1, 53.5, 1.5, 10, 0])

    expect((await read<PublicChampionsFile>('champions.json')).champions.map((c) => c.name)).toEqual(['Ahri', 'Lux', 'Zed'])
    expect(await read('patches.json')).toEqual([{ version: '7.3', date: '2026-09-21' }])

    expect((await readdir(join(dir, 'out', 'history'))).sort()).toEqual(['1.json', '2.json', '3.json'])
    const history = await read<HistoryFile>('history/1.json')
    expect(history.series.all?.mid?.map((point) => point[0])).toEqual(['2026-10-01', '2026-10-02'])
    expect(await read<HistoryFile>('history/3.json')).toEqual({ schema: 1, heroId: 3, series: {} })
  }, 30_000)

  it('fails when a snapshot file name does not match its date', async () => {
    await writeFile(join(dir, 'data', 'snapshots', '2026-10-03.json'), JSON.stringify(snapshot('2026-10-04', 50)))
    expect(run).toThrow(/contains stats for 2026-10-04/)
  }, 30_000)
})
