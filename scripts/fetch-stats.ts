/**
 * Fetch today's Wild Rift ranked stats (China server) and store them as a dated snapshot.
 *
 *   node scripts/fetch-stats.ts [--data-dir data] [--raw-dir .raw] [--dry-run] [--no-base-stats] [--no-abilities]
 *   node scripts/fetch-stats.ts --stats-file x.json --heroes-file y.json --ddragon-file z.json \
 *     --hero-details-dir dir/ --official-dir dir/   # offline
 *
 * Writes data/snapshots/<dtstatdate>.json (only when the stats changed), and data/champions.json,
 * data/base-stats.json and data/abilities.json (only when they changed), so a scheduled run that
 * finds nothing new leaves the tree untouched. Base stats and abilities are best effort: champions
 * whose files can't be loaded keep their previous values and the run only warns.
 *
 * Abilities combine Tencent's champion files (cooldowns, costs) with the official Wild Rift site
 * (English names, descriptions, icons, videos); --official-dir reads the site's page JSON from
 * <slug>.json files and the champion list from champions.json instead.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { AbilitiesFile, BaseStatsFile, Champion, ChampionsFile, Patch } from '../src/shared/types.ts'
import {
  extractNextData,
  hasEnglishText,
  matchOfficialPages,
  mergeAbilities,
  OFFICIAL_HEADERS,
  OFFICIAL_LIST_URL,
  officialDataUrl,
  officialPageUrl,
  parseAbilitiesFile,
  parseOfficialAbilities,
  parseOfficialList,
  type OfficialAbility,
  type OfficialList,
  type OfficialPage,
} from './lib/abilities.ts'
import { appendSummary, error as reportError, setOutput, warn } from './lib/actions.ts'
import { breaker, mapSettled, SkippedError } from './lib/async.ts'
import { mergeBaseStats, parseBaseStats } from './lib/baseStats.ts'
import { buildChampions, indexDataDragon, type DataDragonIndex } from './lib/champions.ts'
import { listFiles, readJsonFile, readTextFile, writeIfChanged } from './lib/fs.ts'
import { describeError, fetchJson, fetchText, parseJsonText } from './lib/http.ts'
import { formatJson } from './lib/json.ts'
import { renderReport, type FileStatus } from './lib/report.ts'
import { buildSnapshot, isSnapshot, snapshotFileName, snapshotStatus } from './lib/snapshot.ts'
import {
  HERO_LIST_URL,
  heroDetailUrl,
  parseHeroDetail,
  parseHeroList,
  parseHeroSpells,
  parseRankList,
  SchemaError,
  STATS_URL,
  TENCENT_HEADERS,
} from './lib/tencent.ts'

const DDRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json'
const ddragonChampionUrl = (version: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
/** Parallel requests for the ~140 champion files on Tencent's CDN. */
const DETAIL_CONCURRENCY = 6
/** Parallel requests for the ~140 champion pages on the official site. */
const OFFICIAL_CONCURRENCY = 4
/**
 * The champion files and the official site are best effort. Each source stops being asked after this
 * many failures in a row or this long, so a source that blocks or stalls the runner costs a few
 * minutes at most and can't push the run past the workflow's 15-minute timeout.
 */
const SOURCE_LIMITS = { maxConsecutiveFailures: 8, budgetMs: 4 * 60_000 }

const { values: args } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: 'data' },
    'raw-dir': { type: 'string' },
    'stats-file': { type: 'string' },
    'heroes-file': { type: 'string' },
    'ddragon-file': { type: 'string' },
    'hero-details-dir': { type: 'string' },
    'official-dir': { type: 'string' },
    'no-ddragon': { type: 'boolean', default: false },
    'no-base-stats': { type: 'boolean', default: false },
    'no-abilities': { type: 'boolean', default: false },
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

/** One champion's raw file from Tencent's CDN (or --hero-details-dir). */
async function loadHeroFile(heroId: number): Promise<unknown> {
  const dir = args['hero-details-dir']
  if (!dir) return fetchJson(heroDetailUrl(heroId), { headers: TENCENT_HEADERS, retries: 2, log })
  const text = await readTextFile(join(dir, `${heroId}.json`)).catch(() => readTextFile(join(dir, `${heroId}.js`)))
  return parseJsonText(text, `champion file ${heroId}`)
}

/** Load every champion's file once, for base stats and abilities. Never throws for a single champion. */
async function loadHeroFiles(heroIds: readonly number[], warnings: string[]): Promise<Map<number, unknown>> {
  const guarded = breaker(loadHeroFile, SOURCE_LIMITS)
  const results = await mapSettled(heroIds, DETAIL_CONCURRENCY, (heroId) => guarded.call(heroId))
  const files = new Map<number, unknown>()
  const failed: number[] = []
  let skipped = 0
  let firstError: unknown
  results.forEach((result, index) => {
    const heroId = heroIds[index] as number
    if (result.status === 'fulfilled') {
      files.set(heroId, result.value)
    } else if (result.reason instanceof SkippedError) {
      skipped++
    } else {
      failed.push(heroId)
      firstError ??= result.reason
    }
  })
  if (failed.length > 0) {
    warnings.push(
      `Couldn't load ${failed.length} of ${heroIds.length} champion files (previous base stats and abilities kept): ` +
        `${failed.join(', ')}. First error: ${describeError(firstError)}`,
    )
  }
  if (guarded.tripped !== null) {
    warnings.push(
      `Stopped loading champion files early (${guarded.tripped}); ${skipped} more champions keep their previous base stats and abilities`,
    )
  }
  log(`Champion files: ${files.size}/${heroIds.length} loaded`)
  return files
}

/** Parse each loaded champion file; files that don't parse are skipped with one warning. */
function parseEach<T>(
  files: ReadonlyMap<number, unknown>,
  parse: (json: unknown, heroId: number) => T,
  what: string,
  warnings: string[],
): Map<number, T> {
  const parsed = new Map<number, T>()
  const failed: number[] = []
  let firstError: unknown
  for (const [heroId, json] of files) {
    try {
      parsed.set(heroId, parse(json, heroId))
    } catch (error) {
      failed.push(heroId)
      firstError ??= error
    }
  }
  if (failed.length > 0) {
    warnings.push(
      `Couldn't read ${what} for ${failed.length} of ${files.size} champions (previous values kept): ` +
        `${failed.join(', ')}. First error: ${describeError(firstError)}`,
    )
  }
  return parsed
}

async function writeDataFile(path: string, json: string): Promise<boolean> {
  return dryRun ? (await readTextFile(path).catch(() => '')) !== json : writeIfChanged(path, json)
}

interface BaseStatsResult {
  status: FileStatus
  file: BaseStatsFile | null
}

/** Refresh data/base-stats.json from the champion files. */
async function updateBaseStats(
  files: ReadonlyMap<number, unknown>,
  heroCount: number,
  warnings: string[],
): Promise<BaseStatsResult> {
  if (args['no-base-stats']) return { status: 'skipped', file: null }

  const path = join(dataDir, 'base-stats.json')
  let previous: BaseStatsFile | null = null
  try {
    const value = await readJsonFile(path)
    if (value !== undefined) previous = parseBaseStats(value)
  } catch (error) {
    warnings.push(`Ignoring invalid data/base-stats.json (${describeError(error)}); rebuilding it`)
  }

  const details = parseEach(files, parseHeroDetail, 'base stats', warnings)
  const merged = mergeBaseStats([...details.values()], previous)
  warnings.push(...merged.warnings)
  const changed = await writeDataFile(path, formatJson(merged.file, 160))
  log(`Base stats: ${details.size}/${heroCount} champions read; base-stats.json ${changed ? 'changed' : 'unchanged'}`)
  return { status: changed ? 'changed' : 'unchanged', file: merged.file }
}

async function loadOfficialList(warnings: string[]): Promise<OfficialList | null> {
  const dir = args['official-dir']
  try {
    const json = dir
      ? parseJsonText(await readTextFile(join(dir, 'champions.json')), 'official champion list')
      : extractNextData(await fetchText(OFFICIAL_LIST_URL, { headers: OFFICIAL_HEADERS, retries: 2, log }))
    return parseOfficialList(json)
  } catch (error) {
    warnings.push(`Couldn't load the official champion list (${describeError(error)}); guessing page addresses from names`)
    return null
  }
}

/**
 * One champion's abilities from the official site: the page's `_next/data` JSON while the build id
 * works, else the HTML page. A new deployment of the site retires the build id mid-run, so once the
 * HTML works where the JSON didn't, the remaining pages skip the JSON.
 */
async function loadOfficialPage(slug: string, route: { buildId: string | null }): Promise<OfficialAbility[]> {
  const dir = args['official-dir']
  if (dir) return parseOfficialAbilities(parseJsonText(await readTextFile(join(dir, `${slug}.json`)), `official page ${slug}`))
  const { buildId } = route
  if (buildId) {
    try {
      return parseOfficialAbilities(await fetchJson(officialDataUrl(buildId, slug), { headers: OFFICIAL_HEADERS, retries: 1, log }))
    } catch {
      // Try the HTML page below.
    }
  }
  const abilities = parseOfficialAbilities(
    extractNextData(await fetchText(officialPageUrl(slug), { headers: OFFICIAL_HEADERS, retries: 2, log })),
  )
  if (buildId && route.buildId === buildId) {
    route.buildId = null
    log(`The official site's data route failed for ${slug} but the page loaded; using HTML pages from now on`)
  }
  return abilities
}

/**
 * English ability text for every champion on the official site. When the champion list loads, only
 * listed champions are requested; champions the site doesn't have yet are reported by the caller.
 */
async function loadOfficialAbilities(champions: readonly Champion[], warnings: string[]): Promise<Map<number, OfficialPage>> {
  const list = await loadOfficialList(warnings)
  const targets = matchOfficialPages(champions, list).filter((match) => match.listed || list === null)
  const route = { buildId: list?.buildId ?? null }
  const guarded = breaker((slug: string) => loadOfficialPage(slug, route), SOURCE_LIMITS)
  const results = await mapSettled(targets, OFFICIAL_CONCURRENCY, (match) => guarded.call(match.slug))

  const names = new Map(champions.map((champion) => [champion.heroId, champion.name]))
  const pages = new Map<number, OfficialPage>()
  const failed: string[] = []
  let skipped = 0
  let firstError: unknown
  results.forEach((result, index) => {
    const { heroId, slug } = targets[index] as (typeof targets)[number]
    if (result.status === 'fulfilled') {
      pages.set(heroId, { page: slug, abilities: result.value })
    } else if (result.reason instanceof SkippedError) {
      skipped++
    } else {
      failed.push(names.get(heroId) ?? String(heroId))
      firstError ??= result.reason
    }
  })
  if (failed.length > 0) {
    warnings.push(
      `Couldn't load official ability text for ${failed.length} of ${targets.length} champions (previous text kept): ` +
        `${failed.join(', ')}. First error: ${describeError(firstError)}`,
    )
  }
  if (guarded.tripped !== null) {
    warnings.push(`Stopped loading the official site early (${guarded.tripped}); ${skipped} more champions keep their previous text`)
  }
  return pages
}

interface AbilitiesResult {
  status: FileStatus
  file: AbilitiesFile | null
}

/** Refresh data/abilities.json from the champion files and the official site. */
async function updateAbilities(
  champions: readonly Champion[],
  files: ReadonlyMap<number, unknown>,
  warnings: string[],
): Promise<AbilitiesResult> {
  if (args['no-abilities']) return { status: 'skipped', file: null }

  const path = join(dataDir, 'abilities.json')
  let previous: AbilitiesFile | null = null
  try {
    const value = await readJsonFile(path)
    if (value !== undefined) previous = parseAbilitiesFile(value)
  } catch (error) {
    warnings.push(`Ignoring invalid data/abilities.json (${describeError(error)}); rebuilding it`)
  }

  const spells = parseEach(files, parseHeroSpells, 'cooldowns and costs', warnings)
  const official = await loadOfficialAbilities(champions, warnings)
  const file = mergeAbilities({ previous, official, spells })
  const byId = new Map(file.champions.map((entry) => [entry.heroId, entry]))
  const missing = champions.filter((champion) => !hasEnglishText(byId.get(champion.heroId)))
  if (missing.length > 0) {
    warnings.push(
      `No English ability text for ${missing.length} champions (not on the official site yet?): ` +
        missing.map((champion) => champion.name).join(', '),
    )
  }
  const changed = await writeDataFile(path, formatJson(file, 160))
  log(
    `Abilities: official text for ${official.size}/${champions.length} champions, cooldowns and costs for ` +
      `${spells.size}; abilities.json ${changed ? 'changed' : 'unchanged'}`,
  )
  return { status: changed ? 'changed' : 'unchanged', file }
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
  const heroIds = heroList.heroes.map((hero) => hero.heroId)
  const needFiles = !args['no-base-stats'] || !args['no-abilities']
  const heroFiles = needFiles ? await loadHeroFiles(heroIds, warnings) : new Map<number, unknown>()
  const baseStats = await updateBaseStats(heroFiles, heroIds.length, warnings)
  const abilities = await updateAbilities(champions, heroFiles, warnings)

  for (const message of warnings) warn(message)
  log(
    `Stats date ${snapshot.date}: ${parsed.summary.rowCount} rows; snapshot ${status}; ` +
      `champions.json ${championsChanged ? 'changed' : 'unchanged'} (${champions.length} champions)` +
      (dryRun ? ' [dry run: nothing written]' : ''),
  )
  if (parsed.summary.emptyBrackets.length > 0) {
    log(`Brackets with no rows in Tencent's response: ${parsed.summary.emptyBrackets.join(', ')}`)
  }

  await setOutput('date', snapshot.date)
  await setOutput('snapshot', status)
  await setOutput('champions', championsChanged ? 'changed' : 'unchanged')
  await setOutput('base_stats', baseStats.status)
  await setOutput('abilities', abilities.status)
  const abilityEntries = abilities.file?.champions ?? []
  await appendSummary(
    renderReport({
      snapshot,
      status,
      championsChanged,
      championCount: champions.length,
      baseStats: {
        status: baseStats.status,
        championCount: baseStats.file?.champions.length ?? 0,
        version: baseStats.file?.version ?? null,
      },
      abilities: {
        status: abilities.status,
        championCount: abilityEntries.length,
        withText: abilityEntries.filter(hasEnglishText).length,
        withNumbers: abilityEntries.filter((entry) =>
          entry.abilities.some((ability) => ability.cooldown !== null || ability.cost !== null),
        ).length,
      },
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
