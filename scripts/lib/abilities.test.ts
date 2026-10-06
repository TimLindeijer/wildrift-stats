import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AbilitiesFile, ChampionAbilities, ChampionAbility } from '../../src/shared/types.ts'
import {
  cleanText,
  extractNextData,
  hasEnglishText,
  matchOfficialPages,
  mergeAbilities,
  officialDataUrl,
  officialPageUrl,
  officialSlug,
  parseAbilitiesFile,
  parseOfficialAbilities,
  parseOfficialList,
  publicAbilities,
  type OfficialPage,
} from './abilities.ts'
import { SchemaError, type ParsedSpell } from './tencent.ts'

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (name: string): Json =>
  JSON.parse(readFileSync(new URL(`../fixtures/official/${name}`, import.meta.url), 'utf8')) as Json
const garenPage = () => fixture('garen.json')
const abilityGroups = (page: Json): Json[] => page.props.pageProps.page.blades.find((blade: Json) => blade.type === 'iconTab').groups

describe('official URLs', () => {
  it('builds page and data URLs', () => {
    expect(officialPageUrl('garen')).toBe('https://wildrift.leagueoflegends.com/en-us/champions/garen/')
    expect(officialDataUrl('Y4OR6rBZJdkHMNuLoK2Pi', 'nunu-and-willump')).toBe(
      'https://wildrift.leagueoflegends.com/_next/data/Y4OR6rBZJdkHMNuLoK2Pi/en-us/champions/nunu-and-willump.json',
    )
  })
})

describe('extractNextData', () => {
  it('reads the JSON embedded in a Next.js page', () => {
    const html = `<html><script src="x.js"></script><script id="__NEXT_DATA__" type="application/json">{"buildId":"b1"}</script></html>`
    expect(extractNextData(html)).toEqual({ buildId: 'b1' })
  })

  it('fails loudly without valid page data', () => {
    expect(() => extractNextData('<html></html>')).toThrow(SchemaError)
    expect(() => extractNextData('<script id="__NEXT_DATA__">{oops</script>')).toThrow('not valid JSON')
  })
})

describe('parseOfficialList', () => {
  it('lists champions with their page slugs and the build id', () => {
    const list = parseOfficialList(fixture('champions.json'))
    expect(list.buildId).toBe('Y4OR6rBZJdkHMNuLoK2Pi')
    expect(list.champions).toHaveLength(25)
    expect(list.champions).toContainEqual({ title: 'NUNU & WILLUMP', slug: 'nunu-and-willump' })
    expect(list.champions).toContainEqual({ title: "K'Sante", slug: 'ksante' })
  })

  it('accepts the _next/data shape and skips malformed cards', () => {
    const json = fixture('champions.json')
    const grid = json.props.pageProps.page.blades.find((blade: Json) => blade.type === 'characterCardGrid')
    grid.items.push({ title: 'BROKEN', action: { payload: { url: '/en-us/news/' } } }, null)
    const list = parseOfficialList({ pageProps: json.props.pageProps })
    expect(list.champions).toHaveLength(25)
    expect(list.buildId).toBeNull()
  })

  it('fails loudly when the grid is missing or nearly empty', () => {
    const json = fixture('champions.json')
    const grid = json.props.pageProps.page.blades.find((blade: Json) => blade.type === 'characterCardGrid')
    grid.items = grid.items.slice(0, 5)
    expect(() => parseOfficialList(json)).toThrow('only has 5 champions')
    expect(() => parseOfficialList({ props: { pageProps: { page: { blades: [] } } } })).toThrow(SchemaError)
    expect(() => parseOfficialList({})).toThrow('pageProps.page.blades')
  })
})

describe('officialSlug', () => {
  it('matches the slugs the site uses', () => {
    expect(officialSlug('Nunu & Willump')).toBe('nunu-and-willump')
    expect(officialSlug('Dr. Mundo')).toBe('dr-mundo')
    expect(officialSlug("Kai'Sa")).toBe('kaisa')
    expect(officialSlug('K’Sante')).toBe('ksante')
    expect(officialSlug('Jarvan IV')).toBe('jarvan-iv')
    expect(officialSlug('Renata Glasc')).toBe('renata-glasc')
    expect(officialSlug('Nidalée')).toBe('nidalee')
  })
})

describe('matchOfficialPages', () => {
  const champions = [
    { heroId: 1, name: 'Garen', slug: 'garen' },
    { heroId: 2, name: 'Nunu & Willump', slug: 'nunu-willump' },
    { heroId: 3, name: 'Monkey King', slug: 'wukong' },
    { heroId: 4, name: 'Hwei', slug: 'hwei' },
  ]

  it('matches by name, then by slug, and guesses the rest', () => {
    expect(matchOfficialPages(champions, parseOfficialList(fixture('champions.json')))).toEqual([
      { heroId: 1, slug: 'garen', listed: true },
      { heroId: 2, slug: 'nunu-and-willump', listed: true },
      { heroId: 3, slug: 'wukong', listed: true },
      { heroId: 4, slug: 'hwei', listed: false },
    ])
  })

  it('guesses every slug without a list', () => {
    expect(matchOfficialPages(champions, null).map(({ slug, listed }) => [slug, listed])).toEqual([
      ['garen', false],
      ['nunu-and-willump', false],
      ['monkey-king', false],
      ['hwei', false],
    ])
  })
})

describe('cleanText', () => {
  it('turns CMS text into paragraphs', () => {
    expect(cleanText('First line. \nSecond  line.\r\n\n')).toEqual(['First line.', 'Second line.'])
    expect(cleanText('<p>Deals&nbsp;<b>bonus</b> damage &amp; slows.<br/>Kai&#39;Sa &#x2014; ok &bogus;</p><p> </p>')).toEqual([
      'Deals bonus damage & slows.',
      'Kai\'Sa — ok &bogus;',
    ])
    expect(cleanText('')).toEqual([])
  })
})

describe('parseOfficialAbilities', () => {
  it('reads all five abilities of the real Garen page', () => {
    const abilities = parseOfficialAbilities(garenPage())
    expect(abilities.map((ability) => [ability.slot, ability.name])).toEqual([
      ['passive', 'Perseverance'],
      ['1', 'Decisive Strike'],
      ['2', 'Courage'],
      ['3', 'Judgment'],
      ['ultimate', 'Demacian Justice'],
    ])
    expect(abilities[1]!.description).toEqual([
      'Garen gains a burst of movement speed, breaking free of all slows affecting him. His next attack strikes a vital area of his foe, dealing bonus damage and silencing them.',
    ])
    for (const ability of abilities) {
      expect(ability.icon).toMatch(/^https:\/\/cmsassets\.rgpub\.io\/.+\.jpg/)
      expect(ability.video).toMatch(/^https:\/\/cmsassets\.rgpub\.io\/.+\.mp4/)
    }
  })

  it('falls back to the tab label and drops unsafe media', () => {
    const page = garenPage()
    const [passive] = abilityGroups(page) as [Json]
    passive.content.title = '  '
    passive.content.media.sources = [{ src: 'http://example.com/a.mp4', type: 'video/mp4' }]
    passive.thumbnail.url = 'javascript:alert(1)'
    delete passive.content.description
    expect(parseOfficialAbilities(page)[0]).toEqual({
      slot: 'passive',
      name: 'Perseverance',
      description: [],
      icon: null,
      video: null,
    })
  })

  it('fails loudly when the abilities are missing, incomplete or out of order', () => {
    const missing = garenPage()
    missing.props.pageProps.page.blades = missing.props.pageProps.page.blades.filter((blade: Json) => blade.type !== 'iconTab')
    expect(() => parseOfficialAbilities(missing)).toThrow('none is the abilities one')
    const short = garenPage()
    abilityGroups(short).pop()
    expect(() => parseOfficialAbilities(short)).toThrow('has 4 entries, expected 5')
    const swapped = garenPage()
    abilityGroups(swapped).reverse()
    expect(() => parseOfficialAbilities(swapped)).toThrow('expected "PASSIVE"')
  })
})

const ability = (slot: ChampionAbility['slot'], overrides: Partial<ChampionAbility> = {}): ChampionAbility => ({
  slot,
  name: `Old ${slot}`,
  description: ['Old text.'],
  icon: `https://example.com/${slot}.jpg`,
  video: null,
  nameZh: '旧',
  cooldown: [10],
  cost: { type: 'mana', values: [50] },
  ...overrides,
})
const SLOTS = ['passive', '1', '2', '3', 'ultimate'] as const
const previous = (): AbilitiesFile => ({
  schema: 1,
  champions: [
    { heroId: 30, page: 'gone', abilities: SLOTS.map((slot) => ability(slot)) },
    { heroId: 10, page: 'garen', abilities: SLOTS.map((slot) => ability(slot)) },
  ],
})

describe('mergeAbilities', () => {
  const official = (): OfficialPage => ({ page: 'garen', abilities: parseOfficialAbilities(garenPage()) })
  const spells = (): ParsedSpell[] =>
    SLOTS.map((_slot, index) => ({ nameZh: `技能${index}`, cooldown: index === 0 ? null : [index], cost: null }))

  it('takes each source’s own fields and keeps previous data for the rest', () => {
    const merged = mergeAbilities({
      previous: previous(),
      official: new Map([[20, official()]]),
      spells: new Map([[10, spells()]]),
    })
    expect(merged.champions.map((entry) => entry.heroId)).toEqual([10, 20, 30])
    const [ten, twenty, thirty] = merged.champions as [ChampionAbilities, ChampionAbilities, ChampionAbilities]
    // Fresh numbers, previous text.
    expect(ten.page).toBe('garen')
    expect(ten.abilities[1]).toEqual({ ...ability('1'), nameZh: '技能1', cooldown: [1], cost: null })
    // Fresh text, no numbers yet.
    expect(twenty.abilities[4]).toMatchObject({ slot: 'ultimate', name: 'Demacian Justice', nameZh: null, cooldown: null, cost: null })
    // Untouched.
    expect(thirty).toEqual(previous().champions[0])
    expect(hasEnglishText(twenty)).toBe(true)
    expect(parseAbilitiesFile(JSON.parse(JSON.stringify(merged)))).toEqual(merged)
  })

  it('starts empty without a previous file', () => {
    const merged = mergeAbilities({ previous: null, official: new Map(), spells: new Map([[7, spells()]]) })
    expect(merged.champions).toHaveLength(1)
    expect(merged.champions[0]!.page).toBeNull()
    expect(merged.champions[0]!.abilities.every((entry) => entry.name === null && entry.description.length === 0)).toBe(true)
    expect(hasEnglishText(merged.champions[0])).toBe(false)
    expect(hasEnglishText(undefined)).toBe(false)
  })
})

describe('parseAbilitiesFile', () => {
  const broken = (edit: (file: Json) => void): Json => {
    const file = JSON.parse(JSON.stringify(previous())) as Json
    edit(file)
    return file
  }

  it('sorts a valid file by heroId', () => {
    expect(parseAbilitiesFile(previous()).champions.map((entry) => entry.heroId)).toEqual([10, 30])
  })

  it('rejects files in the wrong shape', () => {
    expect(() => parseAbilitiesFile({ schema: 2, champions: [] })).toThrow('schema 1')
    expect(() => parseAbilitiesFile(broken((file) => (file.champions[1].heroId = 30)))).toThrow('duplicate heroId 30')
    expect(() => parseAbilitiesFile(broken((file) => (file.champions[0].page = 'Bad Slug')))).toThrow('page must be a slug')
    expect(() => parseAbilitiesFile(broken((file) => file.champions[0].abilities.pop()))).toThrow('must have 5 abilities')
    expect(() => parseAbilitiesFile(broken((file) => (file.champions[0].abilities[1].slot = '2')))).toThrow('"1" ability')
    expect(() => parseAbilitiesFile(broken((file) => (file.champions[0].abilities[0].icon = 'http://x.test/a.jpg')))).toThrow('https')
    expect(() => parseAbilitiesFile(broken((file) => (file.champions[0].abilities[0].cooldown = ['9'])))).toThrow('cooldown')
    expect(() => parseAbilitiesFile(broken((file) => (file.champions[0].abilities[0].cost.type = 'energy')))).toThrow('cost')
    expect(() => parseAbilitiesFile(broken((file) => (file.champions[0].abilities[0].description = 'text')))).toThrow('description')
  })
})

describe('publicAbilities', () => {
  it('writes one file per champion, with an empty list when nothing is stored', () => {
    const file = previous()
    expect(publicAbilities(file, [10, 40])).toEqual([
      { schema: 1, heroId: 10, page: 'garen', abilities: file.champions[1]!.abilities },
      { schema: 1, heroId: 40, page: null, abilities: [] },
    ])
    expect(publicAbilities(null, new Set([5]))).toEqual([{ schema: 1, heroId: 5, page: null, abilities: [] }])
  })
})
