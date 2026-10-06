import { useId, useState } from 'react'
import { ChampionCell } from '../components/ChampionCell.tsx'
import { ChampionListItem } from '../components/ChampionListItem.tsx'
import { Delta } from '../components/Delta.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { EmptyState } from '../components/States.tsx'
import { useCoreData } from '../data/hooks.ts'
import type { CoreData } from '../data/load.ts'
import { useQueryParams } from '../hooks/index.ts'
import { bracketsInLatest } from '../lib/champion.ts'
import { formatLongDate, formatPct } from '../lib/format.ts'
import {
  MIN_ELO_PICK,
  MIN_FLEX_SHARE,
  eloRows,
  flexPicks,
  presenceRows,
  roleSplitText,
  splitElo,
  type EloItem,
  type Presence,
} from '../lib/insights.ts'
import { bracketOptions, type Option } from '../lib/options.ts'
import { readParam } from '../lib/params.ts'
import { championPath } from '../lib/routes.ts'
import { unknownChampionName } from '../lib/tierTable.ts'
import { BRACKETS, BRACKET_LABELS, LANE_LABELS, isBracket, type Bracket } from '../shared/constants.ts'

const TOP_CONTESTED = 15
const ELO_LIST_LENGTH = 10

type HighBracket = Exclude<Bracket, 'all'>

const HIGH_BRACKETS = BRACKETS.filter((value): value is HighBracket => value !== 'all')

function isHighBracket(value: unknown): value is HighBracket {
  return isBracket(value) && value !== 'all'
}

/** "across all ranks" or "in Diamond+", to follow "games". */
function inBracket(bracket: Bracket): string {
  return bracket === 'all' ? 'across all ranks' : `in ${BRACKET_LABELS[bracket]}`
}

/** Pick and ban rate drawn to scale: a full bar would be a champion in every game. */
function PresenceBar({ pick, ban }: { pick: number; ban: number }) {
  const pickWidth = Math.min(Math.max(pick, 0), 100)
  const banWidth = Math.min(Math.max(ban, 0), 100 - pickWidth)
  return (
    <span className="presence-bar" aria-hidden="true">
      <span className="presence-bar__pick" style={{ width: `${pickWidth}%` }} />
      {banWidth > 0 && <span className="presence-bar__ban" style={{ width: `${banWidth}%` }} />}
    </span>
  )
}

interface PresenceSectionProps {
  rows: readonly Presence[]
  bracket: Bracket
  byId: CoreData['byId']
}

function ContestedSection({ rows, bracket, byId }: PresenceSectionProps) {
  const id = useId()
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, TOP_CONTESTED)
  return (
    <section className="section" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Most contested</h2>
      <p className="section__note">
        {`The share of games ${inBracket(bracket)} in which each champion was picked or banned. Ranked uses draft pick, so a champion is in a game at most once and its pick rates in different roles add up.`}
      </p>
      <p className="legend" aria-hidden="true">
        <span className="legend__item">
          <span className="swatch swatch--pick" />
          Picked
        </span>
        <span className="legend__item">
          <span className="swatch swatch--ban" />
          Banned
        </span>
      </p>
      <ol id={`${id}-list`} className="mover-list">
        {visible.map((row) => (
          <ChampionListItem
            key={row.heroId}
            heroId={row.heroId}
            champion={byId.get(row.heroId)}
            link={{ bracket }}
            meta={`${formatPct(row.pick)} picked · ${formatPct(row.ban)} banned`}
            details={<PresenceBar pick={row.pick} ban={row.ban} />}
          >
            <span className="mover__value">
              <span className="sr-only">picked or banned in </span>
              {formatPct(row.presence)}
              <span className="sr-only"> of games</span>
            </span>
          </ChampionListItem>
        ))}
      </ol>
      {rows.length > TOP_CONTESTED && (
        <button
          type="button"
          className="button button--quiet list-toggle"
          aria-expanded={showAll}
          aria-controls={`${id}-list`}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? `Show top ${TOP_CONTESTED}` : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  )
}

function FlexSection({ rows, bracket, byId }: PresenceSectionProps) {
  const id = useId()
  const flex = flexPicks(rows)
  return (
    <section className="section" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Flex picks</h2>
      <p className="section__note">
        {`Champions whose second role gets at least ${MIN_FLEX_SHARE}% of their games ${inBracket(bracket)}, most evenly split first. Tencent doesn’t list a role until a champion is picked there in about 1% of games, so rarer roles don’t count.`}
      </p>
      {flex.length === 0 ? (
        <p className="muted">{`No champion splits its games between roles like that ${inBracket(bracket)}.`}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table flex-table">
            <caption className="sr-only">{`Flex picks in ${BRACKET_LABELS[bracket]}, with each champion’s share of games by role`}</caption>
            <thead>
              <tr>
                <th scope="col" className="col-champ">
                  Champion
                </th>
                <th scope="col" className="num">
                  Picked
                </th>
                <th scope="col">Roles</th>
              </tr>
            </thead>
            <tbody>
              {flex.map((row) => {
                const champion = byId.get(row.heroId)
                return (
                  <tr key={row.heroId}>
                    <th scope="row" className="col-champ">
                      <ChampionCell
                        name={champion?.name ?? unknownChampionName(row.heroId)}
                        avatar={champion?.avatar}
                        to={champion ? championPath(champion.slug, { bracket }) : null}
                      />
                    </th>
                    <td className="num">{formatPct(row.pick)}</td>
                    <td>{roleSplitText(row.lanes)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

interface EloListProps {
  title: string
  emptyText: string
  items: readonly EloItem[]
  vs: HighBracket
  byId: CoreData['byId']
}

function EloList({ title, emptyText, items, vs, byId }: EloListProps) {
  const headingId = useId()
  return (
    <section className="movers__column" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ol className="mover-list">
          {items.map((item) => (
            <ChampionListItem
              key={`${item.lane}:${item.heroId}`}
              heroId={item.heroId}
              champion={byId.get(item.heroId)}
              link={{ bracket: vs, lane: item.lane }}
              meta={`${LANE_LABELS[item.lane]} · ${formatPct(item.win)} vs ${formatPct(item.baseWin)}`}
            >
              <span className="mover__delta">
                <Delta value={item.diff} />
                <span className="sr-only"> points</span>
              </span>
            </ChampionListItem>
          ))}
        </ol>
      )}
    </section>
  )
}

interface EloSectionProps {
  latest: CoreData['latest']
  byId: CoreData['byId']
  available: ReadonlySet<Bracket>
}

function EloSection({ latest, byId, available }: EloSectionProps) {
  const [params, update] = useQueryParams()
  const id = useId()
  const highAvailable = HIGH_BRACKETS.filter((value) => available.has(value))
  const defaultVs: HighBracket = highAvailable.includes('master') ? 'master' : (highAvailable[0] ?? 'master')
  const vs = readParam(params, 'vs', isHighBracket, defaultVs)
  const label = BRACKET_LABELS[vs]
  const options = bracketOptions(available, vs).filter(
    (option): option is Option<HighBracket> => option.value !== 'all',
  )

  let body
  if (!available.has('all') || highAvailable.length === 0) {
    body = (
      <EmptyState title="Nothing to compare in this snapshot">
        <p>This needs stats for all ranks and at least one higher bracket.</p>
      </EmptyState>
    )
  } else {
    const { better, worse } = splitElo(eloRows(latest, vs), ELO_LIST_LENGTH)
    body = (
      <>
        <div className="controls">
          <Segmented
            legend="Higher bracket"
            value={vs}
            options={options}
            onChange={(value) => update({ vs: value }, { vs: defaultVs })}
          />
        </div>
        {available.has(vs) ? (
          <div className="movers">
            <EloList
              title={`Better in ${label}`}
              emptyText={`No champion wins more often in ${label} than across all ranks.`}
              items={better}
              vs={vs}
              byId={byId}
            />
            <EloList
              title={`Worse in ${label}`}
              emptyText={`No champion wins less often in ${label} than across all ranks.`}
              items={worse}
              vs={vs}
              byId={byId}
            />
          </div>
        ) : (
          <EmptyState title={`No ${label} stats in this snapshot`}>
            <p>{`Tencent didn’t publish this bracket for ${latest.date}. Pick another bracket.`}</p>
          </EmptyState>
        )}
      </>
    )
  }

  return (
    <section className="section" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>High elo vs all ranks</h2>
      <p className="section__note">
        {`A champion’s win rate in ${label} minus its win rate across all ranks in the same role, in percentage points; each row reads “${label} vs all ranks”. Only roles picked in at least ${MIN_ELO_PICK}% of games in both count. Higher brackets play far fewer games, so their win rates are noisier${vs === 'challenger' ? ', Challenger+ most of all' : ''}.`}
      </p>
      {body}
    </section>
  )
}

export default function InsightsPage() {
  const { latest, byId } = useCoreData()
  const [params, update] = useQueryParams()
  const available = bracketsInLatest(latest)
  const bracket = readParam(params, 'bracket', isBracket, 'all')
  const rows = presenceRows(latest, bracket)

  return (
    <>
      <title>Insights · Wild Rift Stats</title>
      <div className="page-head">
        <h1>Insights</h1>
        <p className="lede">
          {`More from the stats for ${formatLongDate(latest.date)}: who gets drafted most, who plays more than one role and who does better in high elo.`}
        </p>
      </div>
      <div className="controls">
        <Segmented
          legend="Bracket"
          value={bracket}
          options={bracketOptions(available, bracket)}
          onChange={(value) => update({ bracket: value }, { bracket: 'all' })}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState title={`No ${BRACKET_LABELS[bracket]} stats in this snapshot`}>
          <p>{`Tencent didn’t publish this bracket for ${latest.date}. Pick another bracket.`}</p>
        </EmptyState>
      ) : (
        <>
          <ContestedSection rows={rows} bracket={bracket} byId={byId} />
          <FlexSection rows={rows} bracket={bracket} byId={byId} />
        </>
      )}
      <EloSection latest={latest} byId={byId} available={available} />
    </>
  )
}
