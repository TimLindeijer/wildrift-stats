import { tierIndex } from '../shared/tiers.ts'
import type { Tier } from '../shared/types.ts'

interface TierBadgeProps {
  tier: Tier
  size?: 'sm' | 'md' | 'lg'
}

export function TierBadge({ tier, size = 'md' }: TierBadgeProps) {
  return (
    <span className={`tier tier--${size}`} data-tier={tier}>
      {tier}
    </span>
  )
}

/** ▲/▼ when the tier changed since the previous snapshot. */
export function TierChange({ tier, previous }: { tier: Tier; previous: Tier | null }) {
  if (previous === null || previous === tier) return null
  const up = tierIndex(tier) < tierIndex(previous)
  return (
    <span className={`tier-change tier-change--${up ? 'up' : 'down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="sr-only">{`${up ? 'up' : 'down'} from ${previous}`}</span>
    </span>
  )
}
