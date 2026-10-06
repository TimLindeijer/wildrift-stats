import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { championPath } from '../lib/routes.ts'
import { unknownChampionName } from '../lib/tierTable.ts'
import type { Bracket, Lane } from '../shared/constants.ts'
import type { PublicChampion } from '../shared/types.ts'
import { ChampionIcon } from './ChampionIcon.tsx'

interface ChampionListItemProps {
  heroId: number
  champion: PublicChampion | undefined
  /** Bracket and role to open on the champion page. */
  link: { bracket?: Bracket; lane?: Lane }
  meta: string
  /** Extra content under the meta line, e.g. a bar. */
  details?: ReactNode
  /** The number on the right. */
  children: ReactNode
}

/** One row of a numbered champion list (`ol.mover-list`): icon, linked name, a meta line and a number. */
export function ChampionListItem({ heroId, champion, link, meta, details, children }: ChampionListItemProps) {
  const name = champion?.name ?? unknownChampionName(heroId)
  return (
    <li className="mover">
      <ChampionIcon src={champion?.avatar} name={name} size={36} />
      <span className="mover__text">
        {champion ? (
          <Link className="mover__name" to={championPath(champion.slug, link)}>
            {name}
          </Link>
        ) : (
          <span className="mover__name">{name}</span>
        )}
        <span className="mover__meta">{meta}</span>
        {details}
      </span>
      {children}
    </li>
  )
}
