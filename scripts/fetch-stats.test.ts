import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BaseStatsFile, ChampionsFile, Snapshot } from '../src/shared/types.ts'

const script = fileURLToPath(new URL('./fetch-stats.ts', import.meta.url))
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

describe('fetch-stats CLI (offline fixtures)', () => {
  let dir: string
  let outputFile: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wr-fetch-'))
    outputFile = join(dir, 'github_output')
    await writeFile(join(dir, 'patches.json'), JSON.stringify([{ version: '7.3', date: '2026-09-21' }]))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const run = async (...extra: string[]) => {
    await writeFile(outputFile, '')
    execFileSync(
      process.execPath,
      [
        script,
        '--data-dir',
        dir,
        '--stats-file',
        fixture('hero_rank_list_v2.json'),
        '--heroes-file',
        fixture('hero_list.json'),
        '--ddragon-file',
        fixture('ddragon_champion.json'),
        ...extra,
      ],
      { env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_OUTPUT: outputFile, GITHUB_STEP_SUMMARY: '' }, stdio: 'pipe' },
    )
    const outputs = Object.fromEntries(
      (await readFile(outputFile, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => line.split('=') as [string, string]),
    )
    return outputs
  }

  it('writes a snapshot and champions.json, then is idempotent', async () => {
    const details = ['--hero-details-dir', fixture('hero_details')]
    const added = { date: '2026-10-03', snapshot: 'added', champions: 'changed', base_stats: 'changed' }
    expect(await run('--dry-run', ...details)).toEqual(added)
    expect(await readdir(dir)).not.toContain('snapshots')
    expect(await readdir(dir)).not.toContain('base-stats.json')

    expect(await run(...details)).toEqual(added)
    const snapshotPath = join(dir, 'snapshots', '2026-10-03.json')
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as Snapshot
    expect(snapshot.brackets.all?.mid?.length).toBe(6)
    const champions = JSON.parse(await readFile(join(dir, 'champions.json'), 'utf8')) as ChampionsFile
    expect(champions.champions).toHaveLength(25)
    expect(champions.champions.every((c) => c.nameSource !== 'fallback')).toBe(true)
    expect(champions.champions.every((c) => c.ratings !== null)).toBe(true)
    // Only Garen has a fixture file; the other champions fail without failing the run.
    const baseStats = JSON.parse(await readFile(join(dir, 'base-stats.json'), 'utf8')) as BaseStatsFile
    expect(baseStats).toMatchObject({ schema: 1, version: '7.3' })
    expect(baseStats.champions).toEqual([expect.objectContaining({ heroId: 10001, hp: [690, 128], ms: 350 })])

    const before = await readFile(snapshotPath, 'utf8')
    expect(await run(...details)).toEqual({
      date: '2026-10-03',
      snapshot: 'unchanged',
      champions: 'unchanged',
      base_stats: 'unchanged',
    })
    expect(await readFile(snapshotPath, 'utf8')).toBe(before)
  }, 30_000)

  it('can skip base stats', async () => {
    expect(await run('--no-base-stats')).toEqual({
      date: '2026-10-03',
      snapshot: 'added',
      champions: 'changed',
      base_stats: 'skipped',
    })
    expect(await readdir(dir)).not.toContain('base-stats.json')
  }, 30_000)
})
