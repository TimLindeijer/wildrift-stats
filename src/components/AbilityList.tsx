import { useState } from 'react'
import { usePrefersReducedMotion } from '../hooks/index.ts'
import { ABILITY_SLOT_SHORT, abilityNumbers } from '../lib/abilities.ts'
import { ABILITY_SLOT_LABELS } from '../shared/constants.ts'
import type { ChampionAbility } from '../shared/types.ts'

/** Decorative ability icon (the name is always shown next to it). Falls back to the slot. */
function AbilityIcon({ ability }: { ability: ChampionAbility }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const { icon } = ability
  if (!icon || failedSrc === icon) {
    return (
      <span className="ability__icon ability__icon--fallback" aria-hidden="true">
        {ABILITY_SLOT_SHORT[ability.slot]}
      </span>
    )
  }
  return (
    <img
      className="ability__icon"
      src={icon}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(icon)}
    />
  )
}

/** The video only loads once the reader opens the preview; it plays itself unless motion is reduced. */
function AbilityVideo({ src, name }: { src: string; name: string }) {
  const [open, setOpen] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  return (
    <details className="ability__preview" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        Watch preview<span className="sr-only">{`: ${name}`}</span>
      </summary>
      {open && (
        <video
          className="ability__video"
          src={src}
          aria-label={`${name} preview`}
          controls
          muted
          loop
          playsInline
          autoPlay={!reducedMotion}
          preload="metadata"
        />
      )}
    </details>
  )
}

function AbilityItem({ ability }: { ability: ChampionAbility }) {
  const numbers = abilityNumbers(ability)
  const slot = ABILITY_SLOT_LABELS[ability.slot]
  const name = ability.name ?? ability.nameZh ?? slot
  return (
    <li className="ability">
      <AbilityIcon ability={ability} />
      <div className="ability__body">
        <h3 className="ability__title">
          <span className="ability__slot">
            {slot}
            <span className="sr-only">: </span>
          </span>
          <span className="ability__name" lang={ability.name === null && ability.nameZh !== null ? 'zh-CN' : undefined}>
            {name}
          </span>
        </h3>
        {ability.description.length > 0 ? (
          ability.description.map((paragraph, index) => (
            <p key={index} className="ability__text">
              {paragraph}
            </p>
          ))
        ) : (
          <p className="ability__text muted">No English description yet.</p>
        )}
        {numbers.length > 0 && (
          <dl className="ability__numbers">
            {numbers.map((number) => (
              <div key={number.key}>
                <dt>{number.label}</dt>
                <dd>
                  <span aria-hidden="true">{number.text}</span>
                  <span className="sr-only">{number.spoken}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {ability.video && <AbilityVideo src={ability.video} name={name} />}
      </div>
    </li>
  )
}

/** A champion's passive, three abilities and ultimate. */
export function AbilityList({ abilities }: { abilities: readonly ChampionAbility[] }) {
  return (
    <ol className="abilities">
      {abilities.map((ability) => (
        <AbilityItem key={ability.slot} ability={ability} />
      ))}
    </ol>
  )
}
