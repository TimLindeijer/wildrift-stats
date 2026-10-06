/**
 * data/abilities.json: each champion's passive, three abilities and ultimate.
 *
 * English names, descriptions, icons and preview videos come from the official Wild Rift site, a
 * Next.js app whose pages embed their content as JSON (`__NEXT_DATA__`, also served at
 * `/_next/data/<buildId>/…json`). Cooldowns and costs come from Tencent's champion files (see
 * parseHeroSpells). Pure functions; scripts/fetch-stats.ts does the I/O.
 */
import { ABILITY_SLOTS, OFFICIAL_CHAMPIONS_URL, type AbilitySlot } from '../../src/shared/constants.ts'
import type {
  AbilitiesFile,
  AbilityCost,
  AbilityCostType,
  Champion,
  ChampionAbilities,
  ChampionAbility,
  PublicAbilitiesFile,
} from '../../src/shared/types.ts'
import { BROWSER_USER_AGENT, isObject, SchemaError, type JsonObject, type ParsedSpell } from './tencent.ts'

const OFFICIAL_ORIGIN = new URL(OFFICIAL_CHAMPIONS_URL).origin
/** The locale and path of the champion pages, e.g. "en-us/champions". */
const CHAMPIONS_PATH = new URL(OFFICIAL_CHAMPIONS_URL).pathname.replace(/^\/|\/$/g, '')

export const OFFICIAL_LIST_URL = OFFICIAL_CHAMPIONS_URL
export const officialPageUrl = (slug: string): string => `${OFFICIAL_CHAMPIONS_URL}${slug}/`
/** The same page's props as JSON, about a third of the HTML's size. */
export const officialDataUrl = (buildId: string, slug: string): string =>
  `${OFFICIAL_ORIGIN}/_next/data/${buildId}/${CHAMPIONS_PATH}/${slug}.json`

export const OFFICIAL_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept-Language': 'en-US,en;q=0.9',
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const stripAccents = (text: string): string => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')

/** The official page slug for a champion name, e.g. "Nunu & Willump" → "nunu-and-willump". */
export function officialSlug(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const NEXT_DATA = /<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/

/** The JSON a Next.js page embeds in `<script id="__NEXT_DATA__">`. */
export function extractNextData(html: string): unknown {
  const json = NEXT_DATA.exec(html)?.[1]
  if (json === undefined) throw new SchemaError('The page has no __NEXT_DATA__ script')
  try {
    return JSON.parse(json)
  } catch {
    throw new SchemaError('The page’s __NEXT_DATA__ is not valid JSON')
  }
}

/** The CMS blades of a page: `props.pageProps.page` in `__NEXT_DATA__`, `pageProps.page` in `_next/data`. */
function pageBlades(json: unknown): JsonObject[] {
  const root = isObject(json) ? json : {}
  const props = isObject(root.props) ? root.props : root
  const page = isObject(props.pageProps) ? props.pageProps.page : undefined
  if (!isObject(page) || !Array.isArray(page.blades)) throw new SchemaError('The page has no "pageProps.page.blades"')
  return page.blades.filter(isObject)
}

export interface OfficialChampion {
  /** As shown on the site, mostly upper case, e.g. "NUNU & WILLUMP". */
  title: string
  slug: string
}

export interface OfficialList {
  /** Next.js build id, needed for the `_next/data` URLs. */
  buildId: string | null
  champions: OfficialChampion[]
}

/** Fewer champions than this means the list page changed shape. */
export const MIN_OFFICIAL_CHAMPIONS = 20

/** The official champion list page (`/en-us/champions/`). */
export function parseOfficialList(json: unknown): OfficialList {
  const grid = pageBlades(json).find((blade) => blade.type === 'characterCardGrid')
  if (!grid || !Array.isArray(grid.items)) throw new SchemaError('The champion list has no "characterCardGrid" blade')
  const champions: OfficialChampion[] = []
  for (const item of grid.items) {
    if (!isObject(item) || typeof item.title !== 'string' || !isObject(item.action)) continue
    const url = isObject(item.action.payload) ? item.action.payload.url : undefined
    const slug = typeof url === 'string' ? /\/champions\/([a-z0-9-]+)\/?$/.exec(url)?.[1] : undefined
    if (slug && SLUG.test(slug)) champions.push({ title: item.title.trim(), slug })
  }
  if (champions.length < MIN_OFFICIAL_CHAMPIONS) {
    throw new SchemaError(`The champion list only has ${champions.length} champions`)
  }
  const buildId = isObject(json) && typeof json.buildId === 'string' && /^[\w-]+$/.test(json.buildId) ? json.buildId : null
  return { buildId, champions }
}

export interface PageMatch {
  heroId: number
  slug: string
  /** False when the champion isn't in the official list and the slug is a guess. */
  listed: boolean
}

const nameKey = (text: string): string => stripAccents(text).toLowerCase().replace(/[^a-z0-9]/g, '')

/** Find each champion's official page by name, then by slug; otherwise guess it from the name. */
export function matchOfficialPages(
  champions: readonly Pick<Champion, 'heroId' | 'name' | 'slug'>[],
  list: OfficialList | null,
): PageMatch[] {
  const byName = new Map(list?.champions.map((entry) => [nameKey(entry.title), entry.slug] as const))
  const slugs = new Set(list?.champions.map((entry) => entry.slug))
  return champions.map(({ heroId, name, slug }) => {
    const guess = officialSlug(name) || slug
    const found = byName.get(nameKey(name)) ?? [guess, slug].find((candidate) => slugs.has(candidate))
    return { heroId, slug: found ?? guess, listed: found !== undefined }
  })
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#')) {
      const point = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
    }
    const name = code.toLowerCase()
    return Object.hasOwn(ENTITIES, name) ? (ENTITIES[name] as string) : entity
  })
}

/** CMS HTML → plain-text paragraphs: line breaks separate paragraphs, other whitespace collapses. */
export function cleanText(html: string): string[] {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeEntities(text)
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function videoUrl(media: unknown): string | null {
  if (!isObject(media) || media.type !== 'video' || !Array.isArray(media.sources)) return null
  for (const source of media.sources) {
    if (!isObject(source) || typeof source.src !== 'string') continue
    if (source.type === 'video/mp4' || /\.mp4(?:[?#]|$)/i.test(source.src)) return httpsUrl(source.src)
  }
  return null
}

const nonEmpty = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

export interface OfficialAbility {
  slot: AbilitySlot
  name: string
  description: string[]
  icon: string | null
  video: string | null
}

/** How the site labels each slot (`content.subtitle`). */
const SLOT_LABELS: Readonly<Record<AbilitySlot, string>> = {
  passive: 'PASSIVE',
  '1': '1',
  '2': '2',
  '3': '3',
  ultimate: 'ULTIMATE',
}

/** The abilities blade (`iconTab`) of a champion page: one group per slot, in slot order. */
export function parseOfficialAbilities(json: unknown): OfficialAbility[] {
  const tabs = pageBlades(json).filter((blade) => blade.type === 'iconTab' && Array.isArray(blade.groups))
  const title = (blade: JsonObject) => (isObject(blade.header) && typeof blade.header.title === 'string' ? blade.header.title : '')
  const blade = tabs.length === 1 ? tabs[0] : tabs.find((tab) => /abilit/i.test(title(tab)))
  if (!blade) throw new SchemaError(`The page has ${tabs.length} "iconTab" blades and none is the abilities one`)
  const groups = blade.groups as unknown[]
  if (groups.length !== ABILITY_SLOTS.length) {
    throw new SchemaError(`The abilities blade has ${groups.length} entries, expected ${ABILITY_SLOTS.length}`)
  }

  return ABILITY_SLOTS.map((slot, index): OfficialAbility => {
    const group = groups[index]
    const path = `abilities[${index}]`
    if (!isObject(group) || !isObject(group.content)) throw new SchemaError(`${path} has no content`)
    const { content } = group
    const label = typeof content.subtitle === 'string' ? content.subtitle.trim().toUpperCase() : ''
    if (label !== SLOT_LABELS[slot]) {
      throw new SchemaError(`${path} is labelled ${JSON.stringify(content.subtitle)}, expected "${SLOT_LABELS[slot]}"`)
    }
    const name = nonEmpty(content.title) ?? nonEmpty(group.label)
    if (name === null) throw new SchemaError(`${path} has no name`)
    const body = isObject(content.description) ? content.description.body : undefined
    return {
      slot,
      name,
      description: typeof body === 'string' ? cleanText(body) : [],
      icon: isObject(group.thumbnail) ? httpsUrl(group.thumbnail.url) : null,
      video: videoUrl(content.media),
    }
  })
}

export interface OfficialPage {
  /** Slug of the page the text came from. */
  page: string
  abilities: OfficialAbility[]
}

export interface AbilitySources {
  previous: AbilitiesFile | null
  /** Freshly loaded official text, by heroId. */
  official: ReadonlyMap<number, OfficialPage>
  /** Freshly parsed Tencent numbers, by heroId. */
  spells: ReadonlyMap<number, readonly ParsedSpell[]>
}

/**
 * Combine fresh official text and Tencent numbers with the previous file. Each source replaces only
 * its own fields, and champions without fresh data keep their previous entry, so a failed request
 * never deletes data.
 */
export function mergeAbilities({ previous, official, spells }: AbilitySources): AbilitiesFile {
  const before = new Map(previous?.champions.map((entry) => [entry.heroId, entry] as const))
  const heroIds = [...new Set([...before.keys(), ...official.keys(), ...spells.keys()])].sort((a, b) => a - b)
  const champions = heroIds.map((heroId): ChampionAbilities => {
    const old = before.get(heroId)
    const text = official.get(heroId)
    const numbers = spells.get(heroId)
    return {
      heroId,
      page: text ? text.page : (old?.page ?? null),
      abilities: ABILITY_SLOTS.map((slot, index): ChampionAbility => {
        const was = old?.abilities[index]
        const fresh = text?.abilities[index]
        const spell = numbers?.[index]
        return {
          slot,
          name: fresh ? fresh.name : (was?.name ?? null),
          description: fresh ? fresh.description : (was?.description ?? []),
          icon: fresh ? fresh.icon : (was?.icon ?? null),
          video: fresh ? fresh.video : (was?.video ?? null),
          nameZh: spell ? spell.nameZh : (was?.nameZh ?? null),
          cooldown: spell ? spell.cooldown : (was?.cooldown ?? null),
          cost: spell ? spell.cost : (was?.cost ?? null),
        }
      }),
    }
  })
  return { schema: 1, champions }
}

/** True when at least one of the champion's abilities has an English name. */
export const hasEnglishText = (entry: ChampionAbilities | undefined): boolean =>
  entry?.abilities.some((ability) => ability.name !== null) ?? false

const COST_TYPES: readonly AbilityCostType[] = ['mana', 'health', 'health%', 'resource']

const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'number' && Number.isFinite(item))
const isStringOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isUrlOrNull = (value: unknown): value is string | null => value === null || httpsUrl(value) !== null

function parseCost(value: unknown, path: string): AbilityCost | null {
  if (value === null) return null
  if (!isObject(value) || !(COST_TYPES as readonly unknown[]).includes(value.type) || !isNumbers(value.values)) {
    throw new Error(`${path}.cost must be null or { type, values }`)
  }
  return { type: value.type as AbilityCostType, values: [...value.values] }
}

function parseAbility(value: unknown, slot: AbilitySlot, path: string): ChampionAbility {
  if (!isObject(value) || value.slot !== slot) throw new Error(`${path} must be the "${slot}" ability`)
  const { name, description, icon, video, nameZh, cooldown } = value
  if (!isStringOrNull(name) || !isStringOrNull(nameZh)) throw new Error(`${path}: names must be strings or null`)
  if (!Array.isArray(description) || !description.every((line) => typeof line === 'string')) {
    throw new Error(`${path}.description must be an array of strings`)
  }
  if (!isUrlOrNull(icon) || !isUrlOrNull(video)) throw new Error(`${path}: icon and video must be https URLs or null`)
  if (cooldown !== null && !isNumbers(cooldown)) throw new Error(`${path}.cooldown must be null or numbers`)
  return {
    slot,
    name,
    description: [...(description as string[])],
    icon,
    video,
    nameZh,
    cooldown: cooldown === null ? null : [...cooldown],
    cost: parseCost(value.cost, path),
  }
}

/** Validate data/abilities.json; throws on anything hand-edited into the wrong shape. */
export function parseAbilitiesFile(value: unknown): AbilitiesFile {
  if (!isObject(value) || value.schema !== 1 || !Array.isArray(value.champions)) {
    throw new Error('abilities.json must have schema 1 and a "champions" array')
  }
  const ids = new Set<number>()
  const champions = value.champions.map((entry: unknown, index): ChampionAbilities => {
    const path = `abilities.json champions[${index}]`
    if (!isObject(entry) || !Number.isInteger(entry.heroId)) throw new Error(`${path}: missing heroId`)
    const heroId = entry.heroId as number
    if (ids.has(heroId)) throw new Error(`abilities.json: duplicate heroId ${heroId}`)
    ids.add(heroId)
    const { page, abilities } = entry
    if (page !== null && (typeof page !== 'string' || !SLUG.test(page))) throw new Error(`${path}.page must be a slug or null`)
    if (!Array.isArray(abilities) || abilities.length !== ABILITY_SLOTS.length) {
      throw new Error(`${path} must have ${ABILITY_SLOTS.length} abilities`)
    }
    return {
      heroId,
      page,
      abilities: ABILITY_SLOTS.map((slot, i) => parseAbility(abilities[i], slot, `${path}.abilities[${i}]`)),
    }
  })
  champions.sort((a, b) => a.heroId - b.heroId)
  return { schema: 1, champions }
}

/**
 * One public/data/abilities/<heroId>.json per champion, in the given order. Champions without stored
 * abilities get an empty list so the page can tell "none yet" from a failed request.
 */
export function publicAbilities(file: AbilitiesFile | null, heroIds: Iterable<number>): PublicAbilitiesFile[] {
  const byId = new Map(file?.champions.map((entry) => [entry.heroId, entry] as const))
  return [...heroIds].map((heroId) => {
    const entry = byId.get(heroId)
    return { schema: 1, heroId, page: entry?.page ?? null, abilities: entry?.abilities ?? [] }
  })
}
