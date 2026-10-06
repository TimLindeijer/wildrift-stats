import { Suspense, useId, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { ChampionIcon } from '../components/ChampionIcon.tsx'
import { Delta } from '../components/Delta.tsx'
import { ErrorBoundary } from '../components/ErrorBoundary.tsx'
import { RatingPips } from '../components/RatingPips.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { EmptyState, ErrorState, PageLoading } from '../components/States.tsx'
import { TierBadge, TierChange } from '../components/TierBadge.tsx'
import { TrendChart } from '../components/TrendChart.tsx'
import { useBaseStats, useCoreData, useHistory } from '../data/hooks.ts'
import { usePrefersReducedMotion, useQueryParams } from '../hooks/index.ts'
import { MIN_CHART_POINTS, metricSeries } from '../lib/chart.ts'
import { bracketsWithData, findLatestRow, lanesWithData, mainLane } from '../lib/champion.ts'
import { formatLongDate, formatPct } from '../lib/format.ts'
import { eloDiff, presenceFor, roleSplitText, type EloDiff, type Presence } from '../lib/insights.ts'
import { bracketOptions } from '../lib/options.ts'
import { readParam } from '../lib/params.ts'
import { MAX_RATING, RATING_KEYS, RATING_LABELS, formatGrowth, formatStat, statLines } from '../lib/profile.ts'
import { championPath, comparePath } from '../lib/routes.ts'
import {
  BRACKET_LABELS,
  BRACKET_SHORT_LABELS,
  LANES,
  LANE_LABELS,
  isBracket,
  isLane,
  type Bracket,
} from '../shared/constants.ts'
import { addDays } from '../shared/dates.ts'
import type { LatestRow, PublicChampion } from '../shared/types.ts'

const LISTING_RULE = 'Tencent only lists champions picked in about 1% of a role’s games or more.'

function CnTierValue({ row }: { row: LatestRow }) {
  if (row.cnTier === null || row.cnRank === null) return <span className="muted">—</span>
  return (
    <>
      <span aria-hidden="true">{`T${row.cnTier} · #${row.cnRank}`}</span>
      <span className="sr-only">{`T${row.cnTier}, rank ${row.cnRank} in the role`}</span>
    </>
  )
}

function Readout({ row, elo }: { row: LatestRow; elo: EloDiff | null }) {
  return (
    <dl className="stats">
      <div className="stat">
        <dt>Tier</dt>
        <dd className="stat__tier">
          <TierBadge tier={row.tier} size="lg" />
          <span className="stat__sub">{`score ${Math.round(row.score)}`}</span>
          <TierChange tier={row.tier} previous={row.prevTier} />
        </dd>
      </div>
      <div className="stat">
        <dt>Win rate</dt>
        <dd>
          <span className="stat__value">{formatPct(row.win)}</span>
          <Delta value={row.dWin} />
        </dd>
      </div>
      <div className="stat">
        <dt>Pick rate</dt>
        <dd>
          <span className="stat__value">{formatPct(row.pick)}</span>
          <Delta value={row.dPick} />
        </dd>
      </div>
      <div className="stat">
        <dt>Ban rate</dt>
        <dd>
          <span className="stat__value">{formatPct(row.ban)}</span>
          <Delta value={row.dBan} />
        </dd>
      </div>
      <div className="stat">
        <dt>CN tier</dt>
        <dd>
          <span className="stat__value">
            <CnTierValue row={row} />
          </span>
        </dd>
      </div>
      {elo && (
        <div className="stat">
          <dt>Win rate vs all ranks</dt>
          <dd>
            <span className="stat__value">
              <Delta value={elo.diff} unit=" pts" />
            </span>
            {elo.lowSample && <span className="stat__sub">small sample</span>}
          </dd>
        </div>
      )}
    </dl>
  )
}

function PresenceFacts({ presence }: { presence: Presence }) {
  return (
    <dl className="facts">
      <div>
        <dt>Picked or banned</dt>
        <dd>
          {`${formatPct(presence.presence)} of games `}
          <span className="muted">{`· ${formatPct(presence.pick)} picked, ${formatPct(presence.ban)} banned, all roles`}</span>
        </dd>
      </div>
      {presence.lanes.length > 1 && (
        <div>
          <dt>Role split</dt>
          <dd>{roleSplitText(presence.lanes)}</dd>
        </div>
      )}
    </dl>
  )
}

function ChampionStats({ champion }: { champion: PublicChampion }) {
  const { latest, patches } = useCoreData()
  const history = useHistory(champion.heroId)
  const [params, update] = useQueryParams()
  const reducedMotion = usePrefersReducedMotion()
  const readoutRef = useRef<HTMLElement>(null)
  const id = useId()
  const { heroId, name, slug } = champion

  const brackets = bracketsWithData(latest, history, heroId)
  if (brackets.length === 0) {
    return (
      <EmptyState title={`${name} isn’t in the ranked stats yet`}>
        <p>{`${LISTING_RULE} ${name} hasn’t reached that in any role or bracket since tracking started on ${latest.dates[0] ?? latest.date}.`}</p>
      </EmptyState>
    )
  }

  const defaultBracket: Bracket = brackets.includes('all') ? 'all' : brackets[0]!
  const bracket = readParam(params, 'bracket', isBracket, defaultBracket)
  const lanes = lanesWithData(latest, history, bracket, heroId)
  const defaultLane = mainLane(latest, history, bracket, heroId) ?? champion.lanes[0] ?? 'mid'
  const lane = readParam(params, 'lane', isLane, defaultLane)
  const row = findLatestRow(latest, bracket, lane, heroId)
  const points = history.series[bracket]?.[lane] ?? []
  const elo = eloDiff(latest, bracket, lane, heroId)
  const presence = presenceFor(latest, bracket, heroId)

  const changeBracket = (next: Bracket) => {
    const nextLanes = lanesWithData(latest, history, next, heroId)
    const nextDefaultLane = mainLane(latest, history, next, heroId) ?? ''
    update(
      { bracket: next, lane: nextLanes.includes(lane) ? lane : null },
      { bracket: defaultBracket, lane: nextDefaultLane },
    )
  }

  const showReadout = () => {
    readoutRef.current?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
    readoutRef.current?.focus({ preventScroll: true })
  }

  const matrixLanes = LANES.filter((value) => brackets.some((b) => lanesWithData(latest, history, b, heroId).includes(value)))
  const lanesByBracket = new Map(brackets.map((b) => [b, new Set(lanesWithData(latest, history, b, heroId))]))
  const mainLaneByBracket = new Map(brackets.map((b) => [b, mainLane(latest, history, b, heroId)]))

  let growText = `Trend charts start once there are ${MIN_CHART_POINTS} daily snapshots for this role and bracket. `
  if (points.length === 0) growText += 'There are none yet.'
  else growText += `There ${points.length === 1 ? 'is 1' : `are ${points.length}`} so far`
  if (row && points.length > 0) {
    growText += `, so expect them with the stats for ${formatLongDate(addDays(latest.date, MIN_CHART_POINTS - points.length))}.`
  } else if (points.length > 0) growText += '.'

  return (
    <>
      <div className="controls">
        <Segmented
          legend="Bracket"
          value={bracket}
          options={bracketOptions(new Set(brackets), bracket)}
          onChange={changeBracket}
        />
        <Segmented
          legend="Role"
          value={lane}
          options={LANES.map((value) => ({
            value,
            label: LANE_LABELS[value],
            disabled: !lanes.includes(value) && value !== lane,
          }))}
          onChange={(value) => update({ lane: value }, { lane: defaultLane })}
        />
      </div>

      <section className="readout" ref={readoutRef} tabIndex={-1} aria-labelledby={`${id}-readout`}>
        <h2 id={`${id}-readout`} className="readout__heading">
          {`${LANE_LABELS[lane]} · ${BRACKET_LABELS[bracket]}`}
        </h2>
        {row ? (
          <>
            <Readout row={row} elo={elo} />
            {presence && <PresenceFacts presence={presence} />}
            <p className="readout__note">
              {latest.previousDate
                ? `Stats for ${latest.date}. Changes compare with ${latest.previousDate}.`
                : `Stats for ${latest.date}. Changes appear after the next daily snapshot.`}
            </p>
          </>
        ) : (
          <>
            <p className="readout__note">{`Not listed on ${latest.date}. ${LISTING_RULE}`}</p>
            {presence && <PresenceFacts presence={presence} />}
          </>
        )}
      </section>

      <section className="section" aria-labelledby={`${id}-trends`}>
        <h2 id={`${id}-trends`}>Trends</h2>
        {points.length < MIN_CHART_POINTS ? (
          <EmptyState title="History grows daily">
            <p>{growText}</p>
          </EmptyState>
        ) : (
          <div className="chart-grid">
            <div className="chart-grid__wide">
              <TrendChart title="Win rate" metric="win" points={metricSeries(points, 'win')} patches={patches} height={260} />
            </div>
            <TrendChart title="Pick rate" metric="pick" points={metricSeries(points, 'pick')} patches={patches} />
            <TrendChart title="Ban rate" metric="ban" points={metricSeries(points, 'ban')} patches={patches} />
          </div>
        )}
      </section>

      <section className="section" aria-labelledby={`${id}-matrix`}>
        <h2 id={`${id}-matrix`}>Every role and bracket</h2>
        <p className="section__note">{`Tier and win rate on ${latest.date}. Pick a cell to show its numbers and trends.`}</p>
        <div className="table-scroll">
          <table className="data-table matrix">
            <caption className="sr-only">{`${name}’s tier and win rate by role and bracket`}</caption>
            <thead>
              <tr>
                <td />
                {brackets.map((b) => (
                  <th key={b} scope="col">
                    {BRACKET_SHORT_LABELS[b]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixLanes.map((laneKey) => (
                <tr key={laneKey}>
                  <th scope="row">{LANE_LABELS[laneKey]}</th>
                  {brackets.map((b) => {
                    const cell = findLatestRow(latest, b, laneKey, heroId)
                    if (!lanesByBracket.get(b)?.has(laneKey)) {
                      return (
                        <td key={b} className="matrix__none">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">no data</span>
                        </td>
                      )
                    }
                    return (
                      <td key={b}>
                        <Link
                          className="matrix__cell"
                          to={championPath(slug, {
                            bracket: b,
                            lane: laneKey === mainLaneByBracket.get(b) ? undefined : laneKey,
                          })}
                          replace
                          preventScrollReset
                          aria-current={b === bracket && laneKey === lane ? 'true' : undefined}
                          onClick={showReadout}
                        >
                          {cell ? (
                            <>
                              <TierBadge tier={cell.tier} size="sm" />
                              <span>{formatPct(cell.win)}</span>
                            </>
                          ) : (
                            <span className="muted">not listed</span>
                          )}
                        </Link>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function NoValue({ label }: { label: string }) {
  return (
    <span className="muted">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

function BaseStatsTable({ champion }: { champion: PublicChampion }) {
  const { file, byId } = useBaseStats()
  const stats = byId.get(champion.heroId)
  const { growth, version } = file
  const maxLevel = growth.length
  if (!stats || maxLevel < 2) {
    return (
      <>
        <h3>Base stats</h3>
        <p className="muted">Base stats aren’t available yet.</p>
      </>
    )
  }
  const lines = statLines(stats, growth)
  const first = growth[1]
  const last = growth[maxLevel - 1]
  return (
    <>
      <h3>{version ? `Base stats · patch ${version}` : 'Base stats'}</h3>
      <div className="table-scroll">
        <table className="data-table profile-table">
          <caption className="sr-only">{`${champion.name}’s base stats at level 1 and level ${maxLevel}`}</caption>
          <thead>
            <tr>
              <th scope="col">Stat</th>
              <th scope="col" className="num">
                Level 1
              </th>
              <th scope="col" className="num">
                Per level
              </th>
              <th scope="col" className="num">
                {`Level ${maxLevel}`}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <th scope="row">{line.label}</th>
                {line.key === 'mana' && stats.mana === null ? (
                  <td className="muted" colSpan={3}>
                    No mana
                  </td>
                ) : (
                  <>
                    <td className="num">{formatStat(line.first)}</td>
                    <td className="num">{line.perLevel === null ? <NoValue label="none" /> : formatGrowth(line.perLevel)}</td>
                    <td className="num">{formatStat(line.last)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="profile__note">
        {`Regeneration is per 5 seconds. Per level is the average gain per level-up${
          first !== undefined && last !== undefined
            ? `: early levels give less and later ones more (×${first} at level 2 up to ×${last} at level ${maxLevel})`
            : ''
        }.`}
      </p>
    </>
  )
}

function ProfileSection({ champion }: { champion: PublicChampion }) {
  const id = useId()
  const { ratings } = champion
  return (
    <section className="section" aria-labelledby={`${id}-profile`}>
      <h2 id={`${id}-profile`}>Profile</h2>
      <p className="section__note">
        From Tencent’s champion pages. <Link to="/champions">Compare every champion</Link>
      </p>
      <div className="profile">
        <div>
          <h3>Ratings</h3>
          {ratings ? (
            <>
              <dl className="ratings">
                {RATING_KEYS.map((key) => (
                  <div key={key}>
                    <dt>{RATING_LABELS[key]}</dt>
                    <dd>
                      <RatingPips value={ratings[key]} />
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="profile__note">{`From 1 to ${MAX_RATING}.`}</p>
            </>
          ) : (
            <p className="muted">Ratings aren’t available yet.</p>
          )}
        </div>
        <div>
          <ErrorBoundary fallback={(error, retry) => <ErrorState error={error} retry={retry} />}>
            <Suspense fallback={<PageLoading label="Loading base stats…" />}>
              <BaseStatsTable champion={champion} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </section>
  )
}

function ChampionView({ champion }: { champion: PublicChampion }) {
  return (
    <>
      <title>{`${champion.name} stats · Wild Rift Stats`}</title>
      <div className="champ-head">
        <ChampionIcon src={champion.avatar} name={champion.name} size={72} />
        <div className="champ-head__text">
          <h1 className="champ-head__name">{champion.name}</h1>
          <p className="champ-head__meta">
            {champion.title && <span className="champ-head__title">{champion.title}</span>}
            <span lang="zh-CN">{champion.nameZh}</span>
            {champion.roles.length > 0 && <span>{champion.roles.join(', ')}</span>}
          </p>
        </div>
        <Link className="button button--quiet" to={comparePath([champion.slug])}>
          Compare
        </Link>
      </div>
      <Suspense fallback={<PageLoading label={`Loading ${champion.name}’s stats…`} />}>
        <ChampionStats champion={champion} />
      </Suspense>
      <ProfileSection champion={champion} />
    </>
  )
}

export default function ChampionPage() {
  const { slug = '' } = useParams()
  const { bySlug } = useCoreData()
  const champion = bySlug.get(slug.toLowerCase())
  if (!champion) {
    return (
      <>
        <title>Champion not found · Wild Rift Stats</title>
        <div className="page-head">
          <h1>Champion not found</h1>
          <p className="lede">
            {`No champion in the stats matches “${slug}”. `}
            <Link to="/">Browse the tier list</Link>
          </p>
        </div>
      </>
    )
  }
  return <ChampionView key={champion.heroId} champion={champion} />
}
