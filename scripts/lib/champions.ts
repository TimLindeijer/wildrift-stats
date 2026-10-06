/**
 * Pure helpers that turn Tencent's champion list into English-named, slugged champions.
 *
 * English names: poster file name → asset key (e.g. "MonkeyKing") → Riot Data Dragon id
 * (case-insensitive) → manual overrides → prettified key (logged as uncertain).
 */
import type { Lane } from '../../src/shared/constants.ts'
import type { Champion, NameSource } from '../../src/shared/types.ts'
import { isObject, SchemaError, type RawHero } from './tencent.ts'

const POSTER_KEY = /^(.+?)_\d+\.(jpg|png|webp)$/i

/** ".../Posters/Garen_0.jpg" → "Garen" */
export function posterKey(posterUrl: string): string | null {
  const path = posterUrl.split(/[?#]/)[0] ?? ''
  const basename = path.split('/').pop() ?? ''
  return POSTER_KEY.exec(basename)?.[1] ?? null
}

/**
 * Display names for asset keys that Data Dragon may not cover or that can't be prettified.
 * Matched case-insensitively ("Kaisa" and "KaiSa" both hit "Kaisa").
 */
export const NAME_OVERRIDES: Readonly<Record<string, string>> = {
  AurelionSol: 'Aurelion Sol',
  Chogath: "Cho'Gath",
  DrMundo: 'Dr. Mundo',
  JarvanIV: 'Jarvan IV',
  Kaisa: "Kai'Sa",
  Khazix: "Kha'Zix",
  KogMaw: "Kog'Maw",
  KSante: "K'Sante",
  LeeSin: 'Lee Sin',
  MasterYi: 'Master Yi',
  MissFortune: 'Miss Fortune',
  MonkeyKing: 'Wukong',
  // Wild Rift exclusive champion: not in Data Dragon.
  Norra: 'Norra',
  Nunu: 'Nunu & Willump',
  TahmKench: 'Tahm Kench',
  TwistedFate: 'Twisted Fate',
  Velkoz: "Vel'Koz",
  XinZhao: 'Xin Zhao',
}

const OVERRIDES_BY_LOWER_KEY = new Map(Object.entries(NAME_OVERRIDES).map(([key, name]) => [key.toLowerCase(), name]))

/** Tencent's Chinese lane names (hero list `lane` field) → lane ids. */
export const LANE_BY_ZH: Readonly<Record<string, Lane>> = {
  单人路: 'baron',
  上路: 'baron',
  打野: 'jungle',
  中路: 'mid',
  射手: 'duo',
  下路: 'duo',
  辅助: 'support',
}

/** Tencent's Chinese class names → English. */
export const ROLE_BY_ZH: Readonly<Record<string, string>> = {
  战士: 'Fighter',
  法师: 'Mage',
  射手: 'Marksman',
  坦克: 'Tank',
  刺客: 'Assassin',
  辅助: 'Support',
}

export interface DataDragonChampion {
  id: string
  name: string
  title: string
}

/** Lower-cased Data Dragon id → champion. */
export type DataDragonIndex = ReadonlyMap<string, DataDragonChampion>

/** Index Data Dragon's `champion.json` by lower-cased id. */
export function indexDataDragon(json: unknown): DataDragonIndex {
  if (!isObject(json) || !isObject(json.data)) throw new SchemaError('Data Dragon champion.json has no "data" object')
  const index = new Map<string, DataDragonChampion>()
  for (const value of Object.values(json.data)) {
    if (isObject(value) && typeof value.id === 'string' && typeof value.name === 'string') {
      const title = typeof value.title === 'string' ? value.title : ''
      index.set(value.id.toLowerCase(), { id: value.id, name: value.name, title })
    }
  }
  if (index.size === 0) throw new SchemaError('Data Dragon champion.json contains no champions')
  return index
}

/** "MonkeyKing" → "Monkey King", "JarvanIV" → "Jarvan IV" */
export function prettifyKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export interface ResolvedName {
  name: string
  title: string | null
  source: NameSource
}

export function resolveName(key: string, ddragon: DataDragonIndex | null): ResolvedName {
  const lower = key.toLowerCase()
  const fromDataDragon = ddragon?.get(lower)
  if (fromDataDragon) return { name: fromDataDragon.name, title: fromDataDragon.title || null, source: 'ddragon' }
  const override = OVERRIDES_BY_LOWER_KEY.get(lower)
  if (override) return { name: override, title: null, source: 'override' }
  return { name: prettifyKey(key), title: null, source: 'fallback' }
}

/** "Nunu & Willump" → "nunu-willump", "Kai'Sa" → "kaisa", "Dr. Mundo" → "dr-mundo" */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function mapLanes(laneField: string, warnings: string[], context: string): Lane[] {
  const lanes = new Set<Lane>()
  for (const part of laneField.split(/[;；,，/]/)) {
    const zh = part.trim()
    if (!zh) continue
    const lane = LANE_BY_ZH[zh]
    if (lane) lanes.add(lane)
    else warnings.push(`Unknown lane "${zh}" for ${context}`)
  }
  return [...lanes]
}

export interface BuildChampionsResult {
  champions: Champion[]
  warnings: string[]
  /** Champions whose English name is a guess (prettified key or Chinese name). */
  uncertain: Champion[]
}

/**
 * Build the champion list. When Data Dragon is unavailable (`ddragon === null`), names that were
 * previously resolved are carried over so a flaky Data Dragon doesn't churn data/champions.json.
 */
export function buildChampions(
  heroes: readonly RawHero[],
  ddragon: DataDragonIndex | null,
  previous: readonly Champion[] = [],
): BuildChampionsResult {
  const previousById = new Map(previous.map((champion) => [champion.heroId, champion]))
  const usedSlugs = new Set<string>()
  const warnings: string[] = []

  const champions = [...heroes]
    .sort((a, b) => a.heroId - b.heroId)
    .map((hero): Champion => {
      const key = posterKey(hero.poster)
      let resolved: ResolvedName
      if (!key) {
        warnings.push(`Champion ${hero.heroId} (${hero.name}) has no usable poster key: ${JSON.stringify(hero.poster)}`)
        resolved = { name: hero.name, title: null, source: 'fallback' }
      } else {
        const prior = previousById.get(hero.heroId)
        resolved =
          ddragon === null && prior && prior.key === key && prior.nameSource !== 'fallback'
            ? { name: prior.name, title: prior.title, source: prior.nameSource }
            : resolveName(key, ddragon)
      }

      const base = slugify(resolved.name)
      let slug = /[a-z]/.test(base) ? base : `hero-${hero.heroId}`
      if (usedSlugs.has(slug)) slug = `${slug}-${hero.heroId}`
      usedSlugs.add(slug)

      const context = `champion ${hero.heroId} (${resolved.name})`
      return {
        heroId: hero.heroId,
        slug,
        name: resolved.name,
        nameSource: resolved.source,
        title: resolved.title,
        key: key ?? String(hero.heroId),
        nameZh: hero.name,
        titleZh: hero.title,
        avatar: hero.avatar,
        lanes: mapLanes(hero.lane, warnings, context),
        roles: hero.roles.map((role) => ROLE_BY_ZH[role] ?? role),
        ratings: hero.ratings,
      }
    })

  const unrated = champions.filter((champion) => champion.ratings === null)
  if (unrated.length > 0) {
    const list = unrated.map((c) => `${c.heroId} ${c.name}`).join('; ')
    warnings.push(`No complete official ratings for ${unrated.length} champion(s): ${list}`)
  }

  const uncertain = champions.filter((champion) => champion.nameSource === 'fallback')
  if (uncertain.length > 0) {
    const list = uncertain.map((c) => `${c.heroId} ${c.key} → "${c.name}"`).join('; ')
    warnings.push(`No confident English name for ${uncertain.length} champion(s): ${list}`)
  }

  // History still references champions that drop out of Tencent's list, so keep their records.
  const currentIds = new Set(champions.map((champion) => champion.heroId))
  for (const prior of previous) {
    if (currentIds.has(prior.heroId)) continue
    warnings.push(`Champion ${prior.heroId} (${prior.name}) is no longer in Tencent's list; keeping its previous record`)
    if (usedSlugs.has(prior.slug)) continue
    usedSlugs.add(prior.slug)
    // Records written before ratings existed have no `ratings` key.
    champions.push({ ...prior, ratings: prior.ratings ?? null })
  }
  champions.sort((a, b) => a.heroId - b.heroId)

  return { champions, warnings, uncertain }
}
