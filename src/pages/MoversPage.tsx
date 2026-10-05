import { useId } from 'react'
import { Link } from 'react-router'
import { ChampionIcon } from '../components/ChampionIcon.tsx'
import { Delta } from '../components/Delta.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { EmptyState } from '../components/States.tsx'
import { useCoreData, useMovers } from '../data/hooks.ts'
import type { CoreData } from '../data/load.ts'
import { useQueryParams } from '../hooks/index.ts'
import { bracketsInLatest } from '../lib/champion.ts'
import { formatLongDate, formatPct } from '../lib/format.ts'
import { isMoverWindowId, splitMovers, windowItems, windowReadyDate, type MoverItem } from '../lib/movers.ts'
import { LANE_FILTER_OPTIONS, bracketOptions } from '../lib/options.ts'
import { readParam } from '../lib/params.ts'
import { championPath } from '../lib/routes.ts'
import { isLaneFilter, unknownChampionName } from '../lib/tierTable.ts'
import { BRACKET_LABELS, LANE_LABELS, isBracket, type Bracket } from '../shared/constants.ts'
import type { MoverWindow } from '../shared/types.ts'

const LIST_LENGTH = 10

interface MoverListProps {
  title: string
  emptyText: string
  items: readonly MoverItem[]
  bracket: Bracket
  showLane: boolean
  byId: CoreData['byId']
}

function MoverList({ title, emptyText, items, bracket, showLane, byId }: MoverListProps) {
  const headingId = useId()
  return (
    <section className="movers__column" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ol className="mover-list">
          {items.map((item) => {
            const champion = byId.get(item.heroId)
            const name = champion?.name ?? unknownChampionName(item.heroId)
            return (
              <li key={`${item.lane}:${item.heroId}`} className="mover">
                <ChampionIcon src={champion?.avatar} name={name} size={36} />
                <span className="mover__text">
                  {champion ? (
                    <Link className="mover__name" to={championPath(champion.slug, { bracket, lane: item.lane })}>
                      {name}
                    </Link>
                  ) : (
                    <span className="mover__name">{name}</span>
                  )}
                  <span className="mover__meta">
                    {`${showLane ? `${LANE_LABELS[item.lane]} · ` : ''}${formatPct(item.win)} win · ${formatPct(item.pick)} pick`}
                  </span>
                </span>
                <span className="mover__delta">
                  <Delta value={item.dWin} />
                  <span className="sr-only"> points</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function baseNote(moverWindow: MoverWindow): string {
  const { baseDate, targetDate, patch } = moverWindow
  if (!baseDate || !targetDate || baseDate === targetDate) return ''
  return moverWindow.id === 'patch'
    ? `, the first snapshot since patch ${patch ?? ''} on ${targetDate}`
    : `, the newest snapshot on or before ${targetDate}`
}

export default function MoversPage() {
  const { latest, byId } = useCoreData()
  const movers = useMovers()
  const [params, update] = useQueryParams()

  const defaultWindow = movers.windows[0]?.id ?? '1d'
  const windowId = readParam(params, 'window', isMoverWindowId, defaultWindow)
  const moverWindow = movers.windows.find((item) => item.id === windowId) ?? movers.windows[0]
  const bracket = readParam(params, 'bracket', isBracket, 'all')
  const lane = readParam(params, 'lane', isLaneFilter, 'any')

  let body
  if (!moverWindow) {
    body = <EmptyState title="No comparison windows in the data" />
  } else if (moverWindow.baseDate === null) {
    const ready = windowReadyDate(moverWindow, latest.date, latest.dates[0] ?? latest.date)
    body = (
      <EmptyState title="Not enough history yet">
        <p>
          {ready
            ? `The “${moverWindow.label}” window fills in once the stats for ${formatLongDate(ready)} are published. History started on ${formatLongDate(latest.dates[0] ?? latest.date)}.`
            : `The “${moverWindow.label}” window fills in as daily snapshots build up.`}
        </p>
      </EmptyState>
    )
  } else {
    const { rising, falling } = splitMovers(windowItems(moverWindow, bracket, lane), LIST_LENGTH)
    body = (
      <>
        <p className="table-meta">
          {`Comparing ${latest.date} with ${moverWindow.baseDate}${baseNote(moverWindow)}. Win-rate changes are in percentage points; only champions listed on both dates count.`}
        </p>
        <div className="movers">
          <MoverList
            title="Rising"
            emptyText="No champion gained win rate in this window."
            items={rising}
            bracket={bracket}
            showLane={lane === 'any'}
            byId={byId}
          />
          <MoverList
            title="Falling"
            emptyText="No champion lost win rate in this window."
            items={falling}
            bracket={bracket}
            showLane={lane === 'any'}
            byId={byId}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <title>Movers · Wild Rift Stats</title>
      <div className="page-head">
        <h1>Movers</h1>
        <p className="lede">{`The ${LIST_LENGTH} biggest win-rate gains and drops in ${BRACKET_LABELS[bracket]} over the chosen window.`}</p>
      </div>
      <div className="controls">
        <Segmented
          legend="Window"
          value={windowId}
          options={movers.windows.map((item) => ({ value: item.id, label: item.label }))}
          onChange={(value) => update({ window: value }, { window: defaultWindow })}
        />
        <Segmented
          legend="Bracket"
          value={bracket}
          options={bracketOptions(bracketsInLatest(latest), bracket)}
          onChange={(value) => update({ bracket: value }, { bracket: 'all' })}
        />
        <Segmented
          legend="Role"
          value={lane}
          options={LANE_FILTER_OPTIONS}
          onChange={(value) => update({ lane: value }, { lane: 'any' })}
        />
      </div>
      {body}
    </>
  )
}
