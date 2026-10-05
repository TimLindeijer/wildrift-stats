import { describe, expect, it } from 'vitest'
import { matchesQuery, matchRank, searchKey, suggest } from './search.ts'

const champ = (name: string, slug: string, nameZh = '') => ({ name, slug, nameZh })

const kaisa = champ("Kai'Sa", 'kaisa', '卡莎')
const nunu = champ('Nunu & Willump', 'nunu-willump', '努努和威朗普')
const mundo = champ('Dr. Mundo', 'dr-mundo', '蒙多医生')
const sona = champ('Sona', 'sona')
const ksante = champ("K'Sante", 'ksante')

describe('searchKey', () => {
  it('drops case, accents and punctuation but keeps CJK', () => {
    expect(searchKey("Kai'Sa")).toBe('kaisa')
    expect(searchKey('Nunu & Willump')).toBe('nunuwillump')
    expect(searchKey('Pokémon')).toBe('pokemon')
    expect(searchKey('卡莎')).toBe('卡莎')
  })
})

describe('matchRank', () => {
  it('ranks name prefixes above word prefixes above substrings', () => {
    expect(matchRank(kaisa, 'kai')).toBe(0)
    expect(matchRank(kaisa, "kai'sa")).toBe(0)
    expect(matchRank(nunu, 'willump')).toBe(1)
    expect(matchRank(mundo, 'mundo')).toBe(1)
    expect(matchRank(sona, 'on')).toBe(2)
    expect(matchRank(ksante, 'sante')).toBe(1)
  })

  it('matches the Chinese name and treats an empty query as a match', () => {
    expect(matchesQuery(kaisa, '卡莎')).toBe(true)
    expect(matchesQuery(kaisa, '  ')).toBe(true)
    expect(matchesQuery(kaisa, 'garen')).toBe(false)
  })
})

describe('suggest', () => {
  it('orders by match quality, then name, and respects the limit', () => {
    const list = [sona, kaisa, nunu, mundo, champ('Senna', 'senna'), champ('Seraphine', 'seraphine')]
    expect(suggest(list, 'se', 5).map((c) => c.name)).toEqual(['Senna', 'Seraphine'])
    expect(suggest(list, 'n', 2).map((c) => c.name)).toEqual(['Nunu & Willump', 'Dr. Mundo'])
  })
})
