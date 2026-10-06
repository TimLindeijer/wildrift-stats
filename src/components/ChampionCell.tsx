import { Link } from 'react-router'
import { ChampionIcon } from './ChampionIcon.tsx'

interface ChampionCellProps {
  name: string
  avatar: string | null | undefined
  /** Champion page link; plain text when null. */
  to: string | null
  /** Small second line, e.g. the role. */
  sub?: string
}

/** Icon and name for the champion column of a data table. */
export function ChampionCell({ name, avatar, to, sub }: ChampionCellProps) {
  const label = (
    <>
      <ChampionIcon src={avatar} name={name} size={32} />
      <span className="champ-cell__text">
        <span className="champ-cell__name">{name}</span>
        {sub && <span className="champ-cell__lane">{sub}</span>}
      </span>
    </>
  )
  return to ? (
    <Link className="champ-cell" to={to}>
      {label}
    </Link>
  ) : (
    <span className="champ-cell">{label}</span>
  )
}
