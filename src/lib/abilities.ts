import type { AbilitySlot } from '../shared/constants.ts'
import type { AbilityCostType, ChampionAbility } from '../shared/types.ts'

/** Shown in place of an icon that's missing or fails to load. */
export const ABILITY_SLOT_SHORT: Record<AbilitySlot, string> = {
  passive: 'P',
  '1': '1',
  '2': '2',
  '3': '3',
  ultimate: 'Ult',
}

const COST_UNITS: Record<AbilityCostType, string> = {
  mana: ' mana',
  health: ' health',
  'health%': '% health',
  resource: ' resource',
}

const abilityNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** The values worth showing: one when every rank is the same, null when there are none. */
function rankValues(values: readonly number[] | null | undefined): number[] | null {
  if (!values || values.length === 0 || !values.every((value) => Number.isFinite(value))) return null
  const [first] = values
  return values.every((value) => value === first) ? [first!] : [...values]
}

/** Per-rank values: [9, 8, 8, 7] -> "9/8/8/7". Equal ranks collapse to one value: [65, 65] -> "65". */
export function formatRanks(values: readonly number[] | null | undefined): string | null {
  return rankValues(values)?.map((value) => abilityNumber.format(value)).join('/') ?? null
}

/** The same for screen readers: [9, 8, 8, 7] -> "9, 8, 8 and 7 by rank"; [65, 65] -> "65". */
function spokenRanks(values: readonly number[], unit: string): string {
  const parts = values.map((value) => abilityNumber.format(value))
  if (parts.length === 1) return `${parts[0]}${unit}`
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}${unit} by rank`
}

export interface AbilityNumber {
  key: 'cooldown' | 'cost'
  label: string
  /** Compact text, e.g. "9/8/8/7 s". */
  text: string
  /** The same for screen readers, e.g. "9, 8, 8 and 7 seconds by rank". */
  spoken: string
}

/** Cooldown and cost lines for an ability; abilities without them (most passives) get none. */
export function abilityNumbers({ cooldown, cost }: Pick<ChampionAbility, 'cooldown' | 'cost'>): AbilityNumber[] {
  const numbers: AbilityNumber[] = []
  const cooldowns = rankValues(cooldown)
  if (cooldowns) {
    const seconds = cooldowns.length === 1 && cooldowns[0] === 1 ? ' second' : ' seconds'
    numbers.push({
      key: 'cooldown',
      label: 'Cooldown',
      text: `${formatRanks(cooldowns)} s`,
      spoken: spokenRanks(cooldowns, seconds),
    })
  }
  const costs = rankValues(cost?.values)
  if (cost && costs) {
    const unit = COST_UNITS[cost.type]
    numbers.push({ key: 'cost', label: 'Cost', text: `${formatRanks(costs)}${unit}`, spoken: spokenRanks(costs, unit) })
  }
  return numbers
}

/** True when an ability costs Tencent's generic resource (energy, fury, …), which needs a note. */
export function usesGenericResource(abilities: readonly Pick<ChampionAbility, 'cost'>[]): boolean {
  return abilities.some((ability) => ability.cost?.type === 'resource')
}

/** True when the official site had English text for at least one ability. */
export function hasEnglishText(abilities: readonly Pick<ChampionAbility, 'name'>[]): boolean {
  return abilities.some((ability) => ability.name !== null)
}
