import { Suspense, useId } from 'react'
import { Link } from 'react-router'
import { ChampionCell } from '../components/ChampionCell.tsx'
import { ErrorBoundary } from '../components/ErrorBoundary.tsx'
import { RatingPips } from '../components/RatingPips.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { SortHeader } from '../components/SortHeader.tsx'
import { EmptyState, ErrorState, PageLoading } from '../components/States.tsx'
import { useBaseStats, useCoreData } from '../data/hooks.ts'
import { useQueryParams } from '../hooks/index.ts'
import { readParam } from '../lib/params.ts'
import {
  BASE_STAT_LABELS,
  MAX_RATING,
  PROFILE_SORT_DEFAULTS,
  PROFILE_STAT_KEYS,
  RATING_KEYS,
  RATING_LABELS,
  formatStat,
  isProfileSortKey,
  isRatingKey,
  sortProfiles,
  statAt,
  type ChampionProfile,
  type ProfileSortKey,
  type ProfileStatKey,
} from '../lib/profile.ts'
import { championPath } from '../lib/routes.ts'
import { matchesQuery } from '../lib/search.ts'
import { isSortDir, nextSort, type SortState } from '../lib/sort.ts'
import type { BaseStats, PublicChampion } from '../shared/types.ts'

type View = 'ratings' | 'stats'
type LevelChoice = '1' | 'max'

const VIEW_OPTIONS: readonly { value: View; label: string }[] = [
  { value: 'ratings', label: 'Ratings' },
  { value: 'stats', label: 'Base stats' },
]

const RATING_SORT_KEYS: readonly ProfileSortKey[] = ['name', ...RATING_KEYS]
const STAT_SORT_KEYS: readonly ProfileSortKey[] = ['name', ...PROFILE_STAT_KEYS]

/** Column headings; the long names are abbreviated, with the full name for screen readers and on hover. */
const STAT_ABBREVIATIONS: Partial<Record<ProfileStatKey, string>> = { ad: 'AD', mr: 'MR', ms: 'MS' }

function isView(value: unknown): value is View {
  return value === 'ratings' || value === 'stats'
}

function isLevelChoice(value: unknown): value is LevelChoice {
  return value === '1' || value === 'max'
}

function sortLabel(key: ProfileSortKey): string {
  if (key === 'name') return 'name'
  return (isRatingKey(key) ? RATING_LABELS[key] : BASE_STAT_LABELS[key]).toLowerCase()
}

function plural(count: number): string {
  return `${count} ${count === 1 ? 'champion' : 'champions'}`
}

/** The sort for a view, read from the URL. A key from the other view falls back to name. */
function useProfileSort(keys: readonly ProfileSortKey[]): [SortState<ProfileSortKey>, (column: ProfileSortKey) => void] {
  const [params, update] = useQueryParams()
  const requested = readParam(params, 'sort', isProfileSortKey, 'name')
  const key = keys.includes(requested) ? requested : 'name'
  const sort: SortState<ProfileSortKey> = { key, dir: readParam(params, 'dir', isSortDir, PROFILE_SORT_DEFAULTS[key]) }
  const onSort = (column: ProfileSortKey) => {
    const next = nextSort(sort, column, PROFILE_SORT_DEFAULTS)
    update({ sort: next.key, dir: next.dir }, { sort: 'name', dir: PROFILE_SORT_DEFAULTS[next.key] })
  }
  return [sort, onSort]
}

function caption(view: string, sort: SortState<ProfileSortKey>): string {
  return `Champion ${view}, sorted by ${sortLabel(sort.key)}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}.`
}

function NameCell({ champion }: { champion: PublicChampion }) {
  return (
    <th scope="row" className="col-champ">
      <ChampionCell name={champion.name} avatar={champion.avatar} to={championPath(champion.slug)} />
    </th>
  )
}

function RatingsView({ champions }: { champions: readonly PublicChampion[] }) {
  const [sort, onSort] = useProfileSort(RATING_SORT_KEYS)
  const profiles = sortProfiles(
    champions.map((champion) => ({ champion, stats: null })),
    sort.key,
    sort.dir,
    1,
    [],
  )
  return (
    <>
      <p className="table-meta">{`${plural(profiles.length)} · Rated from 1 to ${MAX_RATING} in Tencent’s champion list.`}</p>
      <div className="table-scroll">
        <table className="data-table champions-table">
          <caption className="sr-only">{caption('ratings', sort)}</caption>
          <thead>
            <tr>
              <SortHeader column="name" sort={sort} onSort={onSort} className="col-champ">
                Champion
              </SortHeader>
              <th scope="col">Class</th>
              {RATING_KEYS.map((key) => (
                <SortHeader key={key} column={key} sort={sort} onSort={onSort}>
                  {RATING_LABELS[key]}
                </SortHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map(({ champion }) => (
              <tr key={champion.heroId}>
                <NameCell champion={champion} />
                <td>{champion.roles.length > 0 ? champion.roles.join(', ') : <span className="muted">—</span>}</td>
                {RATING_KEYS.map((key) => (
                  <td key={key}>
                    <RatingPips value={champion.ratings?.[key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function StatCell({ stats, statKey, level, growth }: { stats: BaseStats | null; statKey: ProfileStatKey; level: number; growth: readonly number[] }) {
  if (!stats) {
    return (
      <td className="num muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">no data</span>
      </td>
    )
  }
  if (statKey === 'mana' && stats.mana === null) return <td className="num muted">None</td>
  return <td className="num">{formatStat(statAt(stats, statKey, level, growth))}</td>
}

function StatsView({ champions }: { champions: readonly PublicChampion[] }) {
  const { file, byId } = useBaseStats()
  const [params, update] = useQueryParams()
  const [sort, onSort] = useProfileSort(STAT_SORT_KEYS)
  const { growth, version } = file
  const maxLevel = growth.length
  const levelChoice = readParam(params, 'level', isLevelChoice, '1')

  if (maxLevel === 0 || file.champions.length === 0) {
    return (
      <EmptyState title="Base stats aren’t available yet">
        <p>They’re collected with the daily stats update and show up here after the next one.</p>
      </EmptyState>
    )
  }

  const level = levelChoice === 'max' ? maxLevel : 1
  const profiles: ChampionProfile[] = champions.map((champion) => ({ champion, stats: byId.get(champion.heroId) ?? null }))
  const sorted = sortProfiles(profiles, sort.key, sort.dir, level, growth)

  return (
    <>
      <div className="controls">
        <Segmented
          legend="Stats at"
          value={levelChoice}
          options={[
            { value: '1', label: 'Level 1' },
            { value: 'max', label: `Level ${maxLevel}` },
          ]}
          onChange={(value) => update({ level: value }, { level: '1' })}
        />
      </div>
      <p className="table-meta">
        {`${plural(sorted.length)} · Level ${level}${version ? `, patch ${version}` : ''}. Regeneration and growth per level are on each champion’s page.`}
      </p>
      <div className="table-scroll">
        <table className="data-table champions-table">
          <caption className="sr-only">{caption(`base stats at level ${level}`, sort)}</caption>
          <thead>
            <tr>
              <SortHeader column="name" sort={sort} onSort={onSort} className="col-champ">
                Champion
              </SortHeader>
              {PROFILE_STAT_KEYS.map((key) => {
                const short = STAT_ABBREVIATIONS[key]
                return (
                  <SortHeader key={key} column={key} sort={sort} onSort={onSort} className="num">
                    {short ? (
                      <>
                        <abbr title={BASE_STAT_LABELS[key]} aria-hidden="true">
                          {short}
                        </abbr>
                        <span className="sr-only">{BASE_STAT_LABELS[key]}</span>
                      </>
                    ) : (
                      BASE_STAT_LABELS[key]
                    )}
                  </SortHeader>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ champion, stats }) => (
              <tr key={champion.heroId}>
                <NameCell champion={champion} />
                {PROFILE_STAT_KEYS.map((key) => (
                  <StatCell key={key} stats={stats} statKey={key} level={level} growth={growth} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function ChampionsPage() {
  const { champions } = useCoreData()
  const [params, update] = useQueryParams()
  const searchId = useId()
  const view = readParam(params, 'view', isView, 'ratings')
  const query = params.get('q') ?? ''
  const matches = query ? champions.filter((champion) => matchesQuery(champion, query)) : champions

  let body
  if (matches.length === 0) {
    body = (
      <EmptyState title={`No champion matches “${query}”`}>
        <p>Search by English or Chinese name.</p>
        <button type="button" className="button" onClick={() => update({ q: null })}>
          Clear search
        </button>
      </EmptyState>
    )
  } else if (view === 'ratings') {
    body = champions.some((champion) => champion.ratings) ? (
      <RatingsView champions={matches} />
    ) : (
      <EmptyState title="Ratings aren’t available yet">
        <p>They’re collected with the daily stats update and show up here after the next one.</p>
      </EmptyState>
    )
  } else {
    body = (
      <ErrorBoundary fallback={(error, retry) => <ErrorState error={error} retry={retry} />}>
        <Suspense fallback={<PageLoading label="Loading base stats…" />}>
          <StatsView champions={matches} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <>
      <title>Champions · Wild Rift Stats</title>
      <div className="page-head">
        <h1>Champions</h1>
        <p className="lede">
          Official ratings and base stats for every champion, from Tencent’s champion pages.{' '}
          <Link to="/about">About the data</Link>
        </p>
      </div>
      <div className="controls">
        <Segmented
          legend="Show"
          value={view}
          options={VIEW_OPTIONS}
          onChange={(value) => update({ view: value, sort: null, dir: null, level: null }, { view: 'ratings' })}
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
      {body}
    </>
  )
}
