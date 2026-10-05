/**
 * Fetch today's Wild Rift ranked stats (China server) and store them as a dated snapshot.
 *
 *   node scripts/fetch-stats.ts [--data-dir data] [--raw-dir .raw] [--dry-run]
 *   node scripts/fetch-stats.ts --stats-file x.json --heroes-file y.json --ddragon-file z.json   # offline
 *
 * Writes data/snapshots/<dtstatdate>.json (only when the stats changed) and data/champions.json
 * (only when it changed), so a scheduled run that finds nothing new leaves the tree untouched.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { ChampionsFile, Patch } from '../src/shared/types.ts'
import { appendSummary, error as reportError, setOutput, warn } from './lib/actions.ts'
import { buildChampions, indexDataDragon, type DataDragonIndex } from './lib/champions.ts'
import { listFiles, readJsonFile, readTextFile, writeIfChanged } from './lib/fs.ts'
import { describeError, fetchJson, fetchText, parseJsonText } from './lib/http.ts'
import { formatJson } from './lib/json.ts'
import { renderReport } from './lib/report.ts'
import { buildSnapshot, isSnapshot, snapshotFileName, snapshotStatus } from './lib/snapshot.ts'
import { HERO_LIST_URL, parseHeroList, parseRankList, SchemaError, STATS_URL, TENCENT_HEADERS } from './lib/tencent.ts'

const DDRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json'
const ddragonChampionUrl = (version: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`

const { values: args } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: 'data' },
    'raw-dir': { type: 'string' },
    'stats-file': { type: 'string' },
    'heroes-file': { type: 'string' },
    'ddragon-file': { type: 'string' },
    'no-ddragon': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
  strict: true,
})

const dataDir = resolve(args['data-dir'])
const rawDir = args['raw-dir'] ? resolve(args['raw-dir']) : undefined
const dryRun = args['dry-run']
const log = (message: string) => console.log(message)

async function saveRaw(name: string, text: string): Promise<void> {
  if (!rawDir) return
  await mkdir(rawDir, { recursive: true })
  await writeFile(join(rawDir, name), text, 'utf8')
}

async function loadText(name: string, file: string | undefined, url: string): Promise<string> {
  const text = file ? await readTextFile(file) : await fetchText(url, { headers: TENCENT_HEADERS, log })
  await saveRaw(name, text)
  return text
}

async function loadDataDragon(): Promise<DataDragonIndex | null> {
  if (args['no-ddragon']) return null
  try {
    if (args['ddragon-file']) return indexDataDragon(parseJsonText(await readTextFile(args['ddragon-file']), 'ddragon file'))
    const versions = await fetchJson(DDRAGON_VERSIONS_URL, { retries: 2, log })
    const version = Array.isArray(versions) ? versions[0] : undefined
    if (typeof version !== 'string') throw new Error('Unexpected Data Dragon versions.json')
    const index = indexDataDragon(await fetchJson(ddragonChampionUrl(version), { retries: 2, log }))
    log(`Data Dragon ${version}: ${index.size} champions`)
    return index
  } catch (error) {
    warn(`Data Dragon unavailable (${describeError(error)}); keeping previously resolved English names`)
    return null
  }
}

async function latestStoredDate(): Promise<string | null> {
  const dates = (await listFiles(join(dataDir, 'snapshots')))
    .map((name) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1])
    .filter((date): date is string => Boolean(date))
    .sort()
  return dates.at(-1) ?? null
}

async function main(): Promise<void> {
  const fetchedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const warnings: string[] = []

  const statsText = await loadText('hero_rank_list_v2.json', args['stats-file'], STATS_URL)
  const parsed = parseRankList(parseJsonText(statsText, 'ranked stats'))
  warnings.push(...parsed.warnings)

  const heroesText = await loadText('hero_list.json', args['heroes-file'], HERO_LIST_URL)
  const heroList = parseHeroList(parseJsonText(heroesText, 'hero list'))
  const ddragon = await loadDataDragon()

  const championsPath = join(dataDir, 'champions.json')
  const previousFile = (await readJsonFile(championsPath)) as Partial<ChampionsFile> | undefined
  const previous = Array.isArray(previousFile?.champions) ? previousFile.champions : []
  const { champions, warnings: championWarnings } = buildChampions(heroList.heroes, ddragon, previous)
  warnings.push(...championWarnings)

  const known = new Set(champions.map((champion) => champion.heroId))
  const unknownIds = new Set<number>()
  for (const lanes of Object.values(parsed.brackets)) {
    for (const rows of Object.values(lanes ?? {})) {
      for (const row of rows ?? []) if (!known.has(row.heroId)) unknownIds.add(row.heroId)
    }
  }
  if (unknownIds.size > 0) {
    warnings.push(`Stats include hero ids missing from the champion list: ${[...unknownIds].sort().join(', ')}`)
  }

  const patches = (await readJsonFile(join(dataDir, 'patches.json'))) as Patch[] | undefined
  const knownVersions = new Set((patches ?? []).map((patch) => patch.version.replace(/[a-z]+$/i, '')))
  if (heroList.version && !knownVersions.has(heroList.version)) {
    warnings.push(`Tencent's champion list reports game version ${heroList.version}, which is not in data/patches.json`)
  }

  const snapshot = buildSnapshot(parsed, fetchedAt)
  const snapshotPath = join(dataDir, 'snapshots', snapshotFileName(snapshot.date))
  const existing = await readJsonFile(snapshotPath)
  const status = snapshotStatus(isSnapshot(existing) ? existing : null, snapshot)
  const latest = await latestStoredDate()
  if (latest && snapshot.date < latest) {
    warnings.push(`Tencent returned stats for ${snapshot.date}, older than the latest stored snapshot ${latest}`)
  }

  const championsJson = formatJson({ schema: 1, champions } satisfies ChampionsFile)
  let championsChanged: boolean
  if (dryRun) {
    championsChanged = (await readTextFile(championsPath).catch(() => '')) !== championsJson
  } else {
    if (status !== 'unchanged') await writeIfChanged(snapshotPath, formatJson(snapshot))
    championsChanged = await writeIfChanged(championsPath, championsJson)
  }

  for (const message of warnings) warn(message)
  log(
    `Stats date ${snapshot.date}: ${parsed.summary.rowCount} rows; snapshot ${status}; ` +
      `champions.json ${championsChanged ? 'changed' : 'unchanged'} (${champions.length} champions)` +
      (dryRun ? ' [dry run: nothing written]' : ''),
  )

  await setOutput('date', snapshot.date)
  await setOutput('snapshot', status)
  await setOutput('champions', championsChanged ? 'changed' : 'unchanged')
  await appendSummary(
    renderReport({
      snapshot,
      status,
      championsChanged,
      championCount: champions.length,
      summary: parsed.summary,
      warnings,
      dryRun,
    }),
  )
}

main().catch((error: unknown) => {
  reportError(error instanceof SchemaError ? `Schema drift: ${error.message}` : describeError(error))
  process.exitCode = 1
})
