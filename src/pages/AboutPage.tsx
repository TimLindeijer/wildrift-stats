import { TierBadge } from '../components/TierBadge.tsx'
import { useCoreData } from '../data/hooks.ts'
import { bracketsInLatest } from '../lib/champion.ts'
import { formatLongDate } from '../lib/format.ts'
import { BRACKETS, BRACKET_LABELS } from '../shared/constants.ts'
import { TIER_THRESHOLDS, TIER_WEIGHTS } from '../shared/tiers.ts'

const REPO_URL = 'https://github.com/TimLindeijer/wildrift-stats'

function percent(weight: number): string {
  return `${Math.round(weight * 100)}%`
}

function scoreRange(index: number): string {
  const min = TIER_THRESHOLDS[index]![1]
  const above = TIER_THRESHOLDS[index - 1]?.[1]
  if (above === undefined) return `${min} or more`
  if (index === TIER_THRESHOLDS.length - 1) return `under ${above}`
  return `${min} to under ${above}`
}

function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

export default function AboutPage() {
  const { latest, patches } = useCoreData()
  const firstDate = latest.dates[0] ?? latest.date
  const available = bracketsInLatest(latest)
  const missing = BRACKETS.filter((bracket) => !available.has(bracket)).map((bracket) => BRACKET_LABELS[bracket])
  const patchList = [...patches].sort((a, b) => b.date.localeCompare(a.date))
  const snapshots = latest.dates.length

  return (
    <article className="prose">
      <title>About the data · Wild Rift Stats</title>
      <h1>About the data</h1>
      <p className="lede">
        Wild Rift Stats follows ranked champion win, pick and ban rates on the China server of League of Legends: Wild
        Rift, one daily snapshot at a time.
      </p>

      <h2>Where the numbers come from</h2>
      <p>
        Tencent publishes ranked champion stats for the China server through a public endpoint that only ever returns
        the current day. To build a history, a scheduled GitHub Action fetches the stats twice a day and commits each new
        day to the <a href={REPO_URL}>project’s repository</a> as a JSON snapshot, a technique known as git scraping.
        The site is static: it reads those files and has no server or database.
      </p>
      <p>
        {`Tencent publishes a day’s stats at about 02:00 UTC the next day. History starts on ${formatLongDate(firstDate)}, with ${snapshots} daily ${snapshots === 1 ? 'snapshot' : 'snapshots'} so far. Tencent offers no older data, so earlier days can’t be filled in.`}
      </p>

      <h2>What the numbers mean</h2>
      <dl className="definitions">
        <dt>Win rate</dt>
        <dd>Share of the champion’s games in that role that it won.</dd>
        <dt>Pick rate</dt>
        <dd>
          Share of games in which the champion was played in that role. Both teams fill every role, so a role’s pick rates
          add up to about 200%.
        </dd>
        <dt>Ban rate</dt>
        <dd>
          Share of games in which the champion was banned. Tencent reports one ban rate per champion, so it’s the same in
          every role.
        </dd>
        <dt>Changes</dt>
        <dd>Differences from the previous daily snapshot, in percentage points.</dd>
        <dt>Who’s listed</dt>
        <dd>
          Tencent only lists champions picked in about 1% of a role’s games or more, so rare picks come and go from the
          tables.
        </dd>
      </dl>

      <h2>Brackets</h2>
      <p>
        {`Stats come in five rank brackets: ${listText(BRACKETS.map((bracket) => BRACKET_LABELS[bracket]))}. A bracket with a plus includes every rank above it.`}
        {missing.length > 0 &&
          ` ${listText(missing)} ${missing.length === 1 ? 'is' : 'are'} empty in Tencent’s latest data, so the site shows ${missing.length === 1 ? 'it' : 'them'} but you can’t select ${missing.length === 1 ? 'it' : 'them'}.`}
      </p>

      <h2>How tiers work</h2>
      <p>
        Tiers compare each champion with the others in the same role and bracket on the same day. For win rate, pick rate
        and ban rate, every champion gets a percentile from 0 (lowest in the role) to 1 (highest). The tier score is a
        weighted sum of the three, scaled to 0–100:
      </p>
      <p className="formula">
        {`score = 100 × (${percent(TIER_WEIGHTS.win)} × win percentile + ${percent(TIER_WEIGHTS.pick)} × pick percentile + ${percent(TIER_WEIGHTS.ban)} × ban percentile)`}
      </p>
      <table className="data-table thresholds">
        <caption className="sr-only">Tier score needed for each tier</caption>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {TIER_THRESHOLDS.map(([tier], index) => (
            <tr key={tier}>
              <th scope="row">
                <TierBadge tier={tier} size="sm" />
              </th>
              <td>{scoreRange(index)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Win rate carries most of the weight. Pick and ban rates add how much players trust and fear a champion. The score
        is relative, so a tier says how a champion ranks in its role, not whether it wins more than half its games.
      </p>
      <p>
        <strong>CN tier</strong> is Tencent’s own tier (T0 is the best) and rank within the role, taken from the same data.
        It behaves like fixed-size groups of a ranking that leans heavily on popularity, so the site shows it for reference
        and doesn’t use it.
      </p>

      <h2>Patches</h2>
      <p>Dashed lines on the charts mark patch releases. The list is maintained by hand.</p>
      <ul className="patch-list">
        {patchList.map((patch) => (
          <li key={patch.version}>
            {patch.url ? <a href={patch.url}>{`Patch ${patch.version}`}</a> : `Patch ${patch.version}`}
            {' · '}
            <time dateTime={patch.date}>{formatLongDate(patch.date)}</time>
          </li>
        ))}
      </ul>

      <h2>Limitations</h2>
      <ul>
        <li>China server only. Balance, patch timing and the meta can differ from other regions.</li>
        <li>Ranked games only. Tencent doesn’t publish stats for ARAM or other modes.</li>
        <li>{`History starts on ${formatLongDate(firstDate)}, and earlier days can’t be backfilled.`}</li>
        <li>
          Tencent can change or remove the endpoint without notice. The update job stops with an error when the data
          looks wrong, and the site keeps showing the last good snapshot.
        </li>
      </ul>
      <p>
        Source code and data: <a href={REPO_URL}>github.com/TimLindeijer/wildrift-stats</a>.
      </p>
    </article>
  )
}
