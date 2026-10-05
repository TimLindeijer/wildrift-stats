import { Suspense, useDeferredValue, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ChampionIcon } from '../components/ChampionIcon.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { EmptyState, PageLoading } from '../components/States.tsx'
import { TierBadge } from '../components/TierBadge.tsx'
import { CompareChart, type CompareSeries } from '../components/TrendChart.tsx'
import { useCoreData, useHistories } from '../data/hooks.ts'
import type { CoreData } from '../data/load.ts'
import { useQueryParams } from '../hooks/index.ts'
import { METRICS, METRIC_LABELS, MIN_CHART_POINTS, isMetric, mergeSeries, metricSeries, type Metric } from '../lib/chart.ts'
import { bracketsInLatest, findLatestRow, mainLane } from '../lib/champion.ts'
import { compareSlugs, isCompareLane, mostPicked, type CompareLane } from '../lib/compare.ts'
import { formatLongDate, formatPct } from '../lib/format.ts'
import { bracketOptions, type Option } from '../lib/options.ts'
import { readList, readParam } from '../lib/params.ts'
import { MAX_COMPARE, SERIES_COLORS } from '../lib/palette.ts'
import { championPath } from '../lib/routes.ts'
import { suggest } from '../lib/search.ts'
import { BRACKET_LABELS, LANES, LANE_LABELS, isBracket, type Bracket } from '../shared/constants.ts'
import { addDays } from '../shared/dates.ts'
import type { PublicChampion } from '../shared/types.ts'

const METRIC_OPTIONS: readonly Option<Metric>[] = METRICS.map((value) => ({ value, label: METRIC_LABELS[value] }))

const LANE_OPTIONS: readonly Option<CompareLane>[] = [
  { value: 'main', label: 'Main role' },
  ...LANES.map((lane) => ({ value: lane, label: LANE_LABELS[lane] })),
]

interface Selection {
  slugs: string[]
  metric: Metric
  bracket: Bracket
  lane: CompareLane
}

function readSelection(params: URLSearchParams, bySlug: CoreData['bySlug']): Selection {
  return {
    slugs: compareSlugs(readList(params, 'c'), (slug) => bySlug.has(slug), MAX_COMPARE),
    metric: readParam(params, 'metric', isMetric, 'win'),
    bracket: readParam(params, 'bracket', isBracket, 'all'),
    lane: readParam(params, 'lane', isCompareLane, 'main'),
  }
}

function championsFor(slugs: readonly string[], bySlug: CoreData['bySlug']): PublicChampion[] {
  return slugs.flatMap((slug) => {
    const champion = bySlug.get(slug)
    return champion ? [champion] : []
  })
}

interface PickerProps {
  champions: readonly PublicChampion[]
  selected: readonly PublicChampion[]
  popular: readonly PublicChampion[]
  onAdd: (slug: string) => void
  onRemove: (slug: string) => void
}

function ChampionPicker({ champions, selected, popular, onAdd, onRemove }: PickerProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const full = selected.length >= MAX_COMPARE
  const trimmed = query.trim()
  const selectedSlugs = new Set(selected.map((champion) => champion.slug))
  const matches =
    trimmed && !full
      ? suggest(
          champions.filter((champion) => !selectedSlugs.has(champion.slug)),
          trimmed,
          8,
        )
      : []

  let status = ''
  if (full) status = `${MAX_COMPARE} champions selected, the most a chart can show. Remove one to add another.`
  else if (trimmed) {
    status = matches.length === 0 ? `No champion matches “${trimmed}”.` : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`
  }

  const add = (slug: string) => {
    onAdd(slug)
    setQuery('')
    inputRef.current?.focus()
  }

  const remove = (slug: string) => {
    onRemove(slug)
    inputRef.current?.focus()
  }

  return (
    <section className="picker" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="sr-only">
        Champions
      </h2>
      {selected.length > 0 && (
        <ul className="chips" aria-label="Selected champions">
          {selected.map((champion, index) => (
            <li key={champion.slug} className="chip">
              <span className="swatch" style={{ background: SERIES_COLORS[index] }} aria-hidden="true" />
              <ChampionIcon src={champion.avatar} name={champion.name} size={24} />
              <span className="chip__name">{champion.name}</span>
              <button
                type="button"
                className="chip__remove"
                aria-label={`Remove ${champion.name}`}
                onClick={() => remove(champion.slug)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="picker__form"
        role="search"
        aria-label="Add a champion"
        onSubmit={(event) => {
          event.preventDefault()
          const first = matches[0]
          if (first) add(first.slug)
        }}
      >
        <label className="control-label" htmlFor={`${id}-input`}>
          Add a champion
        </label>
        <input
          ref={inputRef}
          id={`${id}-input`}
          className="input"
          type="search"
          value={query}
          placeholder="Champion name"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-describedby={`${id}-status`}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      <p id={`${id}-status`} className="picker__status" aria-live="polite">
        {status}
      </p>
      {matches.length > 0 && (
        <ul className="pick-list" aria-label="Matching champions">
          {matches.map((champion) => (
            <li key={champion.slug}>
              <button type="button" className="pick" onClick={() => add(champion.slug)}>
                <ChampionIcon src={champion.avatar} name={champion.name} size={24} />
                {champion.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!trimmed && !full && popular.length > 0 && (
        <div className="picker__popular">
          <p className="control-label" id={`${id}-popular`}>
            Most picked
          </p>
          <ul className="pick-list" aria-labelledby={`${id}-popular`}>
            {popular.map((champion) => (
              <li key={champion.slug}>
                <button type="button" className="pick" onClick={() => add(champion.slug)}>
                  <ChampionIcon src={champion.avatar} name={champion.name} size={24} />
                  {champion.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function CompareResults({ search, stale }: { search: string; stale: boolean }) {
  const { latest, bySlug, patches } = useCoreData()
  const selection = readSelection(new URLSearchParams(search), bySlug)
  const champions = championsFor(selection.slugs, bySlug)
  const histories = useHistories(champions.map((champion) => champion.heroId))
  const { bracket, metric } = selection

  if (champions.length === 0) {
    return (
      <EmptyState title="No champions selected">
        <p>{`Add up to ${MAX_COMPARE} champions to see their ${METRIC_LABELS[metric].toLowerCase()} over time.`}</p>
      </EmptyState>
    )
  }

  const entries = champions.map((champion, index) => {
    const history = histories[index]!
    const lane = selection.lane === 'main' ? mainLane(latest, history, bracket, champion.heroId) : selection.lane
    return {
      champion,
      lane,
      color: SERIES_COLORS[index % SERIES_COLORS.length]!,
      row: lane ? findLatestRow(latest, bracket, lane, champion.heroId) : undefined,
      points: lane ? metricSeries(history.series[bracket]?.[lane], metric) : [],
    }
  })
  const series: CompareSeries[] = entries.map(({ champion, color, points }) => ({
    id: champion.slug,
    name: champion.name,
    color,
    points,
  }))
  const longest = Math.max(0, ...series.map((item) => item.points.length))
  const roleTitle = selection.lane === 'main' ? 'main roles' : LANE_LABELS[selection.lane]

  let growText = `The chart starts once there are ${MIN_CHART_POINTS} daily snapshots. `
  growText +=
    longest > 0
      ? `Expect it with the stats for ${formatLongDate(addDays(latest.date, MIN_CHART_POINTS - longest))}.`
      : `None of these champions is listed for ${roleTitle} in ${BRACKET_LABELS[bracket]}.`

  return (
    <div className="compare-results" data-stale={stale || undefined} aria-busy={stale || undefined}>
      {longest < MIN_CHART_POINTS ? (
        <EmptyState title="History grows daily">
          <p>{growText}</p>
        </EmptyState>
      ) : (
        <CompareChart
          title={`${METRIC_LABELS[metric]} · ${BRACKET_LABELS[bracket]} · ${roleTitle}`}
          metric={metric}
          data={mergeSeries(series.map((item) => item.points))}
          series={series}
          patches={patches}
        />
      )}
      <div className="table-scroll">
        <table className="data-table compare-table">
          <caption className="sr-only">{`Stats on ${latest.date} for the selected champions in ${BRACKET_LABELS[bracket]}`}</caption>
          <thead>
            <tr>
              <th scope="col">Champion</th>
              <th scope="col">Role</th>
              <th scope="col">Tier</th>
              <th scope="col" className="num">
                Win
              </th>
              <th scope="col" className="num">
                Pick
              </th>
              <th scope="col" className="num">
                Ban
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ champion, lane, color, row }) => (
              <tr key={champion.slug}>
                <th scope="row" className="col-champ">
                  <Link className="champ-cell" to={championPath(champion.slug, lane ? { bracket, lane } : { bracket })}>
                    <span className="swatch" style={{ background: color }} aria-hidden="true" />
                    <ChampionIcon src={champion.avatar} name={champion.name} size={28} />
                    <span className="champ-cell__name">{champion.name}</span>
                  </Link>
                </th>
                <td>{lane ? LANE_LABELS[lane] : <span className="muted">—</span>}</td>
                <td>{row ? <TierBadge tier={row.tier} size="sm" /> : <span className="muted">not listed</span>}</td>
                <td className="num">{formatPct(row?.win)}</td>
                <td className="num">{formatPct(row?.pick)}</td>
                <td className="num">{formatPct(row?.ban)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ComparePage() {
  const { latest, champions, bySlug, byId } = useCoreData()
  const [params, update] = useQueryParams()
  const selection = readSelection(params, bySlug)
  const search = params.toString()
  // While newly added champions' histories load, keep showing the previous chart.
  const deferredSearch = useDeferredValue(search)

  const selected = championsFor(selection.slugs, bySlug)
  const popular = mostPicked(latest, selection.bracket, 16, selection.lane)
    .flatMap((heroId) => {
      const champion = byId.get(heroId)
      return champion && !selection.slugs.includes(champion.slug) ? [champion] : []
    })
    .slice(0, 8)
  const setSlugs = (slugs: readonly string[]) => update({ c: slugs.join(',') })

  return (
    <>
      <title>Compare champions · Wild Rift Stats</title>
      <div className="page-head">
        <h1>Compare champions</h1>
        <p className="lede">
          {`Up to ${MAX_COMPARE} champions on one chart, each in its main role or in one role you pick.`}
        </p>
      </div>
      <div className="controls">
        <Segmented
          legend="Metric"
          value={selection.metric}
          options={METRIC_OPTIONS}
          onChange={(value) => update({ metric: value }, { metric: 'win' })}
        />
        <Segmented
          legend="Bracket"
          value={selection.bracket}
          options={bracketOptions(bracketsInLatest(latest), selection.bracket)}
          onChange={(value) => update({ bracket: value }, { bracket: 'all' })}
        />
        <Segmented
          legend="Role"
          value={selection.lane}
          options={LANE_OPTIONS}
          onChange={(value) => update({ lane: value }, { lane: 'main' })}
        />
      </div>
      <ChampionPicker
        champions={champions}
        selected={selected}
        popular={popular}
        onAdd={(slug) => setSlugs([...selection.slugs, slug].slice(0, MAX_COMPARE))}
        onRemove={(slug) => setSlugs(selection.slugs.filter((item) => item !== slug))}
      />
      <Suspense fallback={<PageLoading label="Loading history…" />}>
        <CompareResults search={deferredSearch} stale={deferredSearch !== search} />
      </Suspense>
    </>
  )
}
