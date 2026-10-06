import { useId } from 'react'
import { Link } from 'react-router'
import { ChampionCell } from '../components/ChampionCell.tsx'
import { Delta } from '../components/Delta.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { SortHeader } from '../components/SortHeader.tsx'
import { EmptyState } from '../components/States.tsx'
import { TierBadge, TierChange } from '../components/TierBadge.tsx'
import { useCoreData } from '../data/hooks.ts'
import { useQueryParams } from '../hooks/index.ts'
import { bracketsInLatest } from '../lib/champion.ts'
import { formatPct } from '../lib/format.ts'
import { LANE_FILTER_OPTIONS, bracketOptions } from '../lib/options.ts'
import { readParam } from '../lib/params.ts'
import { championPath } from '../lib/routes.ts'
import { matchesQuery } from '../lib/search.ts'
import { isSortDir, nextSort, type SortState } from '../lib/sort.ts'
import {
  DEFAULT_SORT_DIR,
  groupByTier,
  isLaneFilter,
  isSortKey,
  sortTierRows,
  tierRows,
  type SortKey,
  type TierTableRow,
} from '../lib/tierTable.ts'
import { BRACKETS, BRACKET_LABELS, LANE_LABELS, isBracket, type Bracket } from '../shared/constants.ts'
import { TIER_WEIGHTS } from '../shared/tiers.ts'

const SORT_LABELS: Record<SortKey, string> = {
  tier: 'tier',
  name: 'name',
  win: 'win rate',
  dWin: 'win rate change',
  pick: 'pick rate',
  ban: 'ban rate',
  cn: 'CN tier',
}

function percent(weight: number): string {
  return `${Math.round(weight * 100)}%`
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function CnTier({ row }: { row: TierTableRow }) {
  if (row.cnTier === null || row.cnRank === null) {
    return (
      <span className="muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">none</span>
      </span>
    )
  }
  return (
    <>
      <span aria-hidden="true">{`T${row.cnTier} · #${row.cnRank}`}</span>
      <span className="sr-only">{`T${row.cnTier}, rank ${row.cnRank}`}</span>
    </>
  )
}

interface TierRowProps {
  row: TierTableRow
  rank: number
  bracket: Bracket
  showLane: boolean
}

function TierRow({ row, rank, bracket, showLane }: TierRowProps) {
  return (
    <tr>
      <td className="col-rank">{rank}</td>
      <th scope="row" className="col-champ">
        <ChampionCell
          name={row.name}
          avatar={row.champion?.avatar}
          to={row.slug ? championPath(row.slug, { bracket, lane: row.lane }) : null}
          sub={showLane ? LANE_LABELS[row.lane] : undefined}
        />
      </th>
      <td className="col-tier">
        <span className="tier-cell">
          <TierBadge tier={row.tier} size="sm" />
          <span className="tier-cell__score">
            <span className="sr-only">score </span>
            {Math.round(row.score)}
          </span>
          <TierChange tier={row.tier} previous={row.prevTier} />
        </span>
      </td>
      <td className="num">{formatPct(row.win)}</td>
      <td className="num">
        <Delta value={row.dWin} />
      </td>
      <td className="num">{formatPct(row.pick)}</td>
      <td className="num">{formatPct(row.ban)}</td>
      <td className="num col-cn">
        <CnTier row={row} />
      </td>
    </tr>
  )
}

export function TierListPage() {
  const { latest, byId } = useCoreData()
  const [params, update] = useQueryParams()
  const searchId = useId()

  const bracket = readParam(params, 'bracket', isBracket, 'all')
  const lane = readParam(params, 'lane', isLaneFilter, 'any')
  const sortKey = readParam(params, 'sort', isSortKey, 'tier')
  const sort: SortState<SortKey> = { key: sortKey, dir: readParam(params, 'dir', isSortDir, DEFAULT_SORT_DIR[sortKey]) }
  const query = params.get('q') ?? ''

  const available = bracketsInLatest(latest)
  const missingBrackets = BRACKETS.filter((value) => !available.has(value))

  const allRows = tierRows(latest, bracket, lane, (heroId) => byId.get(heroId))
  const rows = query
    ? allRows.filter((row) => matchesQuery({ name: row.name, slug: row.slug ?? '', nameZh: row.nameZh }, query))
    : allRows
  const sorted = sortTierRows(rows, sort.key, sort.dir)
  const rankOf = new Map(sorted.map((row, index) => [row.key, index + 1]))
  const groups =
    sort.key === 'tier'
      ? groupByTier(sorted).map((group, index) => ({ key: `${group.tier}-${index}`, rows: group.rows }))
      : [{ key: 'all', rows: sorted }]

  const onSort = (column: SortKey) => {
    const next = nextSort(sort, column, DEFAULT_SORT_DIR)
    update({ sort: next.key, dir: next.dir }, { sort: 'tier', dir: DEFAULT_SORT_DIR[next.key] })
  }

  const count =
    lane === 'any' ? `${plural(rows.length, 'entry', 'entries')} across all roles` : plural(rows.length, 'champion', 'champions')
  const changeNote = latest.previousDate
    ? `Δ Win compares with ${latest.previousDate}.`
    : 'The Δ Win column fills in after the next daily snapshot.'
  const caption = `Tier list for ${BRACKET_LABELS[bracket]}, ${lane === 'any' ? 'all roles' : LANE_LABELS[lane]}, sorted by ${SORT_LABELS[sort.key]}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}.`

  return (
    <>
      <title>Ranked tier list · Wild Rift Stats</title>
      <div className="page-head">
        <h1>Ranked tier list</h1>
        <p className="lede">
          Each champion is ranked against the others in the same role and bracket, weighting win rate{' '}
          {percent(TIER_WEIGHTS.win)}, pick rate {percent(TIER_WEIGHTS.pick)} and ban rate {percent(TIER_WEIGHTS.ban)}.{' '}
          <Link to="/about">How tiers work</Link>
        </p>
      </div>

      <div className="controls">
        <Segmented
          legend="Bracket"
          value={bracket}
          options={bracketOptions(available, bracket)}
          onChange={(value) => update({ bracket: value }, { bracket: 'all' })}
        />
        <Segmented
          legend="Role"
          value={lane}
          options={LANE_FILTER_OPTIONS}
          onChange={(value) => update({ lane: value }, { lane: 'any' })}
        />
        <div className="field">
          <label className="control-label" htmlFor={searchId}>
            Search
          </label>
          <input
            id={searchId}
            className="input"
            type="search"
            value={query}
            placeholder="Champion name"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => update({ q: event.target.value })}
          />
        </div>
      </div>
      {missingBrackets.length > 0 && (
        <p className="control-note">
          {`No data from Tencent for ${missingBrackets.map((value) => BRACKET_LABELS[value]).join(', ')} in this snapshot.`}
        </p>
      )}

      {allRows.length === 0 ? (
        <EmptyState title={`No ${BRACKET_LABELS[bracket]} stats in this snapshot`}>
          <p>{`Tencent didn’t publish this bracket for ${latest.date}. Pick another bracket.`}</p>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={`No champion matches “${query}”`}>
          <p>Search by English or Chinese name.</p>
          <button type="button" className="button" onClick={() => update({ q: null })}>
            Clear search
          </button>
        </EmptyState>
      ) : (
        <>
          <p className="table-meta">
            {count} · {changeNote}
          </p>
          <div className="table-scroll">
            <table className="data-table tier-table">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr>
                  <th scope="col" className="col-rank">
                    <span aria-hidden="true">#</span>
                    <span className="sr-only">Position</span>
                  </th>
                  <SortHeader column="name" sort={sort} onSort={onSort} className="col-champ">
                    Champion
                  </SortHeader>
                  <SortHeader column="tier" sort={sort} onSort={onSort} className="col-tier">
                    Tier
                  </SortHeader>
                  <SortHeader column="win" sort={sort} onSort={onSort} className="num">
                    Win
                  </SortHeader>
                  <SortHeader column="dWin" sort={sort} onSort={onSort} className="num">
                    <span aria-hidden="true">Δ Win</span>
                    <span className="sr-only">Win rate change</span>
                  </SortHeader>
                  <SortHeader column="pick" sort={sort} onSort={onSort} className="num">
                    Pick
                  </SortHeader>
                  <SortHeader column="ban" sort={sort} onSort={onSort} className="num">
                    Ban
                  </SortHeader>
                  <SortHeader column="cn" sort={sort} onSort={onSort} className="num col-cn">
                    CN tier
                  </SortHeader>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.key}>
                  {group.rows.map((row) => (
                    <TierRow
                      key={row.key}
                      row={row}
                      rank={rankOf.get(row.key) ?? 0}
                      bracket={bracket}
                      showLane={lane === 'any'}
                    />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}
    </>
  )
}
