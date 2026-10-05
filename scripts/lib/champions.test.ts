import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Champion } from '../../src/shared/types.ts'
import {
  buildChampions,
  indexDataDragon,
  mapLanes,
  NAME_OVERRIDES,
  posterKey,
  prettifyKey,
  resolveName,
  slugify,
} from './champions.ts'
import { parseHeroList, type RawHero } from './tencent.ts'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'))

const heroes = () => parseHeroList(fixture('hero_list.json')).heroes
const ddragon = () => indexDataDragon(fixture('ddragon_champion.json'))

const hero = (heroId: number, key: string, extra: Partial<RawHero> = {}): RawHero => ({
  heroId,
  name: `英雄${heroId}`,
  title: '',
  roles: [],
  lane: '中路',
  avatar: `https://game.gtimg.cn/H_S_${heroId}.png`,
  poster: `https://game.gtimg.cn/Posters/${key}_0.jpg`,
  ...extra,
})

describe('posterKey', () => {
  it('extracts the asset key from poster URLs', () => {
    expect(posterKey('https://game.gtimg.cn/images/lgamem/act/lrlib/img/Posters/Garen_0.jpg')).toBe('Garen')
    expect(posterKey('https://x/Posters/MonkeyKing_12.png?v=3')).toBe('MonkeyKing')
    expect(posterKey('https://x/Posters/Garen.jpg')).toBeNull()
    expect(posterKey('')).toBeNull()
  })
})

describe('resolveName', () => {
  it('prefers Data Dragon, matching ids case-insensitively', () => {
    const index = ddragon()
    expect(resolveName('MonkeyKing', index)).toEqual({ name: 'Wukong', title: 'the Monkey King', source: 'ddragon' })
    expect(resolveName('Kogmaw', index)).toMatchObject({ name: "Kog'Maw", source: 'ddragon' })
    expect(resolveName('Ksante', index)).toMatchObject({ name: "K'Sante", source: 'ddragon' })
    expect(resolveName('KhaZix', index)).toMatchObject({ name: "Kha'Zix", source: 'ddragon' })
  })

  it('falls back to overrides, then to a prettified key', () => {
    expect(resolveName('Norra', ddragon())).toEqual({ name: 'Norra', title: null, source: 'override' })
    expect(resolveName('KaiSa', null)).toMatchObject({ name: "Kai'Sa", source: 'override' })
    expect(resolveName('DrMundo', null)).toMatchObject({ name: 'Dr. Mundo', source: 'override' })
    expect(resolveName('BrandNewChamp', null)).toEqual({ name: 'Brand New Champ', title: null, source: 'fallback' })
  })

  it('covers every override from the spec', () => {
    for (const key of ['DrMundo', 'Nunu', 'Kaisa', 'Khazix', 'JarvanIV', 'XinZhao', 'TwistedFate', 'MasterYi']) {
      expect(NAME_OVERRIDES[key]).toBeTruthy()
    }
    for (const key of ['MissFortune', 'AurelionSol', 'MonkeyKing', 'KogMaw', 'Chogath', 'KSante', 'LeeSin', 'TahmKench']) {
      expect(NAME_OVERRIDES[key]).toBeTruthy()
    }
  })
})

describe('prettifyKey', () => {
  it('splits CamelCase', () => {
    expect(prettifyKey('MissFortune')).toBe('Miss Fortune')
    expect(prettifyKey('JarvanIV')).toBe('Jarvan IV')
    expect(prettifyKey('garen')).toBe('Garen')
  })
})

describe('slugify', () => {
  it('creates URL-safe slugs', () => {
    expect(slugify("Kai'Sa")).toBe('kaisa')
    expect(slugify('Nunu & Willump')).toBe('nunu-willump')
    expect(slugify('Dr. Mundo')).toBe('dr-mundo')
    expect(slugify('Jarvan IV')).toBe('jarvan-iv')
    expect(slugify('Kog’Maw')).toBe('kogmaw')
  })
})

describe('mapLanes', () => {
  it('maps Chinese lane names and reports unknown ones', () => {
    const warnings: string[] = []
    expect(mapLanes('打野;单人路', warnings, 'x')).toEqual(['jungle', 'baron'])
    expect(mapLanes('射手；辅助;未知', warnings, 'x')).toEqual(['duo', 'support'])
    expect(warnings).toEqual(['Unknown lane "未知" for x'])
  })
})

describe('buildChampions', () => {
  it('resolves every fixture champion to a confident English name', () => {
    const { champions, uncertain, warnings } = buildChampions(heroes(), ddragon())
    expect(uncertain).toEqual([])
    expect(warnings).toEqual([])
    const byKey = Object.fromEntries(champions.map((c) => [c.key, c]))
    expect(byKey.MonkeyKing).toMatchObject({ name: 'Wukong', slug: 'wukong', lanes: ['jungle', 'baron'] })
    expect(byKey.Nunu).toMatchObject({ name: 'Nunu & Willump', slug: 'nunu-willump' })
    expect(byKey.Norra).toMatchObject({ name: 'Norra', nameSource: 'override', slug: 'norra' })
    expect(byKey.Kogmaw).toMatchObject({ name: "Kog'Maw", slug: 'kogmaw' })
    expect(byKey.Garen).toMatchObject({ heroId: 10001, nameZh: expect.any(String), roles: expect.any(Array) })
    expect(byKey.Garen?.roles.every((role) => /^[A-Z][a-z]+$/.test(role))).toBe(true)
    expect(new Set(champions.map((c) => c.slug)).size).toBe(champions.length)
  })

  it('warns about champions without a confident name but never throws', () => {
    const { champions, uncertain, warnings } = buildChampions([hero(1, 'Mysterio'), hero(2, 'Garen')], ddragon())
    expect(champions.map((c) => c.name)).toEqual(['Mysterio', 'Garen'])
    expect(uncertain.map((c) => c.heroId)).toEqual([1])
    expect(warnings.at(-1)).toContain('1 Mysterio')
  })

  it('uses the Chinese name when the poster has no key', () => {
    const { champions, uncertain } = buildChampions([hero(3, 'x', { poster: '' })], null)
    expect(champions[0]).toMatchObject({ name: '英雄3', key: '3', nameSource: 'fallback', slug: 'hero-3' })
    expect(uncertain).toHaveLength(1)
  })

  it('makes colliding slugs unique', () => {
    const { champions } = buildChampions([hero(1, 'Garen'), hero(2, 'Garen')], ddragon())
    expect(champions.map((c) => c.slug)).toEqual(['garen', 'garen-2'])
  })

  it('carries over previous names when Data Dragon is unavailable', () => {
    const previous = buildChampions(heroes(), ddragon()).champions
    const { champions, uncertain } = buildChampions(heroes(), null, previous)
    expect(champions).toEqual(previous)
    expect(uncertain).toEqual([])
  })

  it('keeps champions that disappear from the list', () => {
    const previous: Champion[] = buildChampions([hero(1, 'Garen'), hero(2, 'Ahri')], ddragon()).champions
    const { champions, warnings } = buildChampions([hero(1, 'Garen')], ddragon(), previous)
    expect(champions.map((c) => c.heroId)).toEqual([1, 2])
    expect(warnings.some((w) => w.includes('no longer in'))).toBe(true)
  })
})
