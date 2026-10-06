/**
 * Derive the frontend's data files from the committed source data.
 *
 *   node scripts/build-data.ts [--data-dir data] [--out public/data]
 *
 * Reads data/snapshots/*.json, data/champions.json, data/patches.json, data/base-stats.json and
 * data/abilities.json, empties the output directory and writes:
 *   latest.json          newest snapshot with tiers and changes vs the previous one (every page)
 *   movers.json          win-rate changes over 1 day, 7 days, 30 days and the current patch
 *   history/<id>.json    one champion's daily series, loaded on demand
 *   abilities/<id>.json  one champion's abilities, loaded on demand (empty until the fetcher stored them)
 *   champions.json       the champion fields the frontend uses
 *   patches.json         patch dates for chart markers
 *   base-stats.json      official base stats (an empty list until the fetcher has stored them)
 *
 * `npm run dev` and `npm run build` run this first; Vite then serves/copies public/ as is.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { PublicChampionsFile, Snapshot } from '../src/shared/types.ts'
import { parseAbilitiesFile, publicAbilities } from './lib/abilities.ts'
import { EMPTY_BASE_STATS, parseBaseStats } from './lib/baseStats.ts'
import { describeError } from './lib/http.ts'
import { buildHistories, buildLatest, buildMovers, forEachLane, parseChampions, parsePatches, publicChampions } from './lib/derive.ts'
import { listFiles, readJsonFile } from './lib/fs.ts'
import { isSnapshot } from './lib/snapshot.ts'

const { values: args } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: 'data' },
    out: { type: 'string', default: 'public/data' },
  },
  strict: true,
})

const dataDir = resolve(args['data-dir'])
const outDir = resolve(args.out)

async function readRequired(path: string): Promise<unknown> {
  const value = await readJsonFile(path)
  if (value === undefined) throw new Error(`Missing ${path}`)
  return value
}

async function loadSnapshots(): Promise<Snapshot[]> {
  const dir = join(dataDir, 'snapshots')
  const snapshots: Snapshot[] = []
  for (const name of (await listFiles(dir)).sort()) {
    const date = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1]
    if (!date) {
      console.warn(`Ignoring unexpected file data/snapshots/${name}`)
      continue
    }
    const value = await readRequired(join(dir, name))
    if (!isSnapshot(value)) throw new Error(`data/snapshots/${name} is not a valid snapshot`)
    if (value.date !== date) throw new Error(`data/snapshots/${name} contains stats for ${value.date}`)
    snapshots.push(value)
  }
  if (snapshots.length === 0) throw new Error(`No snapshots in ${dir}; run \`npm run fetch\` first`)
  return snapshots
}

let bytes = 0
let files = 0
async function writeJson(path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value)
  await writeFile(join(outDir, path), text, 'utf8')
  bytes += Buffer.byteLength(text)
  files++
}

async function main(): Promise<void> {
  const snapshots = await loadSnapshots()
  const champions = parseChampions(await readRequired(join(dataDir, 'champions.json')))
  const patches = parsePatches(await readRequired(join(dataDir, 'patches.json')))
  const baseStatsSource = await readJsonFile(join(dataDir, 'base-stats.json'))
  const baseStats = baseStatsSource === undefined ? EMPTY_BASE_STATS : parseBaseStats(baseStatsSource)
  const abilitiesSource = await readJsonFile(join(dataDir, 'abilities.json'))
  const abilities = abilitiesSource === undefined ? null : parseAbilitiesFile(abilitiesSource)

  const known = new Set(champions.map((champion) => champion.heroId))
  const latest = buildLatest(snapshots)
  const unknown = new Set<number>()
  forEachLane(latest.brackets, (_bracket, _lane, rows) => {
    for (const row of rows) if (!known.has(row.heroId)) unknown.add(row.heroId)
  })
  if (unknown.size > 0) console.warn(`Latest stats include hero ids missing from champions.json: ${[...unknown].join(', ')}`)

  await rm(outDir, { recursive: true, force: true })
  await mkdir(join(outDir, 'history'), { recursive: true })
  await mkdir(join(outDir, 'abilities'), { recursive: true })

  await writeJson('latest.json', latest)
  await writeJson('movers.json', buildMovers(snapshots, patches))
  await writeJson('champions.json', { schema: 1, champions: publicChampions(champions) } satisfies PublicChampionsFile)
  await writeJson('patches.json', patches)
  await writeJson('base-stats.json', baseStats)
  for (const history of buildHistories(snapshots, known)) {
    await writeJson(join('history', `${history.heroId}.json`), history)
  }
  for (const entry of publicAbilities(abilities, known)) {
    await writeJson(join('abilities', `${entry.heroId}.json`), entry)
  }

  console.log(
    `Built ${files} data files (${(bytes / 1024).toFixed(0)} KiB) from ${snapshots.length} snapshot(s), ` +
      `${snapshots[0]!.date} to ${latest.date}, into ${args.out}`,
  )
}

main().catch((error: unknown) => {
  console.error(`build-data failed: ${describeError(error)}`)
  process.exitCode = 1
})
