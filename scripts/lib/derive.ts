/**
 * Pure derivations from the committed source data (data/) to the files the frontend loads
 * (public/data/). No I/O here; scripts/build-data.ts reads and writes the files.
 */
import { BRACKETS, LANES, type Bracket, type Lane } from '../../src/shared/constants.ts'
import { addDays, currentPatch } from '../../src/shared/dates.ts'
import { scoreRows, tierForScore } from '../../src/shared/tiers.ts'
import type {
  BracketTable,
  Champion,
  ChampionRatings,
  HistoryFile,
  HistoryPoint,
  LatestFile,
  LatestRow,
  MoverRow,
  MoversFile,
  MoverWindow,
  MoverWindowId,
  Patch,
  PublicChampion,
  Snapshot,
  SnapshotRow,
  Tier,
} from '../../src/shared/types.ts'

export interface ScoredRow extends SnapshotRow {
  score: number
  tier: Tier
}

const round2 = (value: number) => Math.round(value * 100) / 100

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Calls `fn` for every non-empty lane in canonical bracket and lane order. */
export function forEachLane<T>(table: BracketTable<T>, fn: (bracket: Bracket, lane: Lane, rows: T[]) => void): void {
  for (const bracket of BRACKETS) {
    const lanes = table[bracket]
    if (!lanes) continue
    for (const lane of LANES) {
      const rows = lanes[lane]
      if (rows && rows.length > 0) fn(bracket, lane, rows)
    }
  }
}

function setLane<T>(table: BracketTable<T>, bracket: Bracket, lane: Lane, rows: T[]): void {
  ;(table[bracket] ??= {})[lane] = rows
}

/** Re-create a table in canonical bracket and lane order (JSON keeps insertion order). */
function canonicalTable<T>(table: BracketTable<T>): BracketTable<T> {
  const result: BracketTable<T> = {}
  forEachLane(table, (bracket, lane, rows) => setLane(result, bracket, lane, rows))
  return result
}

/** Apply the tier formula to every bracket and lane of a snapshot. */
export function scoreSnapshot(snapshot: Pick<Snapshot, 'brackets'>): BracketTable<ScoredRow> {
  const result: BracketTable<ScoredRow> = {}
  forEachLane(snapshot.brackets, (bracket, lane, rows) => {
    const scores = scoreRows(rows)
    setLane(
      result,
      bracket,
      lane,
      rows.map((row, i) => ({ ...row, score: scores[i]!, tier: tierForScore(scores[i]!) })),
    )
  })
  return result
}

function rowsByHero<T extends { heroId: number }>(rows: readonly T[] | undefined): Map<number, T> {
  return new Map((rows ?? []).map((row) => [row.heroId, row]))
}

const delta = (current: number, previous: number | undefined) =>
  previous === undefined ? null : round2(current - previous)

/** latest.json: the newest snapshot, scored, with changes against the snapshot before it. */
export function buildLatest(snapshots: readonly Snapshot[]): LatestFile {
  const latest = snapshots.at(-1)
  if (!latest) throw new Error('buildLatest needs at least one snapshot')
  const previous = snapshots.at(-2) ?? null
  const before = previous ? scoreSnapshot(previous) : {}

  const brackets: BracketTable<LatestRow> = {}
  forEachLane(scoreSnapshot(latest), (bracket, lane, rows) => {
    const old = rowsByHero(before[bracket]?.[lane])
    const latestRows = rows.map((row): LatestRow => {
      const prev = old.get(row.heroId)
      return {
        heroId: row.heroId,
        win: row.win,
        pick: row.pick,
        ban: row.ban,
        tier: row.tier,
        score: row.score,
        cnRank: row.strength,
        cnTier: row.strengthLevel,
        dWin: delta(row.win, prev?.win),
        dPick: delta(row.pick, prev?.pick),
        dBan: delta(row.ban, prev?.ban),
        prevTier: prev?.tier ?? null,
      }
    })
    latestRows.sort((a, b) => b.score - a.score || a.heroId - b.heroId)
    setLane(brackets, bracket, lane, latestRows)
  })

  return {
    schema: 1,
    date: latest.date,
    previousDate: previous?.date ?? null,
    fetchedAt: latest.fetchedAt,
    dates: snapshots.map((snapshot) => snapshot.date),
    brackets,
  }
}

export { addDays, currentPatch }

export const MOVER_WINDOWS: readonly { id: MoverWindowId; days: number | null; label: string }[] = [
  { id: '1d', days: 1, label: '1 day' },
  { id: '7d', days: 7, label: '7 days' },
  { id: '30d', days: 30, label: '30 days' },
  { id: 'patch', days: null, label: 'This patch' },
]

/** Champions present in the same bracket and lane on both dates, sorted by win-rate change. */
export function moverRows(latest: Pick<Snapshot, 'brackets'>, base: Pick<Snapshot, 'brackets'>): BracketTable<MoverRow> {
  const result: BracketTable<MoverRow> = {}
  forEachLane(latest.brackets, (bracket, lane, rows) => {
    const old = rowsByHero(base.brackets[bracket]?.[lane])
    const movers: MoverRow[] = []
    for (const row of rows) {
      const prev = old.get(row.heroId)
      if (prev) movers.push([row.heroId, row.win, round2(row.win - prev.win), row.pick, round2(row.pick - prev.pick)])
    }
    movers.sort((a, b) => b[2] - a[2] || a[0] - b[0])
    if (movers.length > 0) setLane(result, bracket, lane, movers)
  })
  return result
}

/**
 * movers.json. Each window compares the latest snapshot with an older one:
 * N-day windows use the newest snapshot on or before latest − N days; the patch window uses the
 * first snapshot of the current patch. A window has baseDate null until such a snapshot exists.
 */
export function buildMovers(snapshots: readonly Snapshot[], patches: readonly Patch[]): MoversFile {
  const latest = snapshots.at(-1)
  if (!latest) throw new Error('buildMovers needs at least one snapshot')
  const older = snapshots.slice(0, -1)

  const windows = MOVER_WINDOWS.map(({ id, days, label }): MoverWindow => {
    let targetDate: string | null
    let base: Snapshot | undefined
    let patch: Patch | null = null
    if (days !== null) {
      targetDate = addDays(latest.date, -days)
      base = older.findLast((snapshot) => snapshot.date <= targetDate!)
    } else {
      patch = currentPatch(patches, latest.date)
      targetDate = patch?.date ?? null
      base = patch ? older.find((snapshot) => snapshot.date >= patch!.date) : undefined
    }
    return {
      id,
      label: patch ? `Patch ${patch.version}` : label,
      baseDate: base?.date ?? null,
      targetDate,
      patch: patch?.version ?? null,
      brackets: base ? moverRows(latest, base) : {},
    }
  })

  return { schema: 1, date: latest.date, windows }
}

/** history/<heroId>.json for every champion that has stats or is listed in `heroIds`. */
export function buildHistories(snapshots: readonly Snapshot[], heroIds: Iterable<number> = []): HistoryFile[] {
  const series = new Map<number, BracketTable<HistoryPoint>>()
  for (const heroId of heroIds) series.set(heroId, {})
  for (const snapshot of snapshots) {
    forEachLane(scoreSnapshot(snapshot), (bracket, lane, rows) => {
      for (const row of rows) {
        let table = series.get(row.heroId)
        if (!table) series.set(row.heroId, (table = {}))
        const lanes = (table[bracket] ??= {})
        ;(lanes[lane] ??= []).push([snapshot.date, row.win, row.pick, row.ban, row.score])
      }
    })
  }
  return [...series.entries()]
    .sort(([a], [b]) => a - b)
    .map(([heroId, table]) => ({ schema: 1, heroId, series: canonicalTable(table) }))
}

/** The champion fields the frontend uses, sorted by name. */
export function publicChampions(champions: readonly Champion[]): PublicChampion[] {
  return champions
    .map(({ heroId, slug, name, title, nameZh, avatar, lanes, roles, ratings }) => ({
      heroId,
      slug,
      name,
      title,
      nameZh,
      avatar,
      lanes,
      roles,
      ratings: ratings ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.heroId - b.heroId)
}

/* ------------------------------------------------------------------ */
/* Input validation: fail loudly on hand-edited or drifted files       */
/* ------------------------------------------------------------------ */

/** True for a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}

export function parsePatches(value: unknown): Patch[] {
  if (!Array.isArray(value)) throw new Error('patches.json must be an array')
  const patches = value.map((entry: unknown, index): Patch => {
    const patch = entry as Partial<Patch> | null
    if (typeof patch?.version !== 'string' || patch.version.trim() === '') {
      throw new Error(`patches.json[${index}]: "version" must be a non-empty string`)
    }
    if (!isIsoDate(patch.date)) {
      throw new Error(`patches.json[${index}] (${patch.version}): "date" must be a valid YYYY-MM-DD date`)
    }
    if (patch.url !== undefined && typeof patch.url !== 'string') {
      throw new Error(`patches.json[${index}] (${patch.version}): "url" must be a string`)
    }
    return { version: patch.version, date: patch.date, ...(patch.url ? { url: patch.url } : {}) }
  })
  const versions = new Set<string>()
  for (const patch of patches) {
    if (versions.has(patch.version)) throw new Error(`patches.json: duplicate version ${patch.version}`)
    versions.add(patch.version)
  }
  return patches.sort((a, b) => a.date.localeCompare(b.date))
}

const RATING_KEYS = ['difficulty', 'damage', 'toughness', 'utility'] as const satisfies readonly (keyof ChampionRatings)[]

/** Valid 1–3 ratings, or null (records from before ratings existed, or hand-edited ones). */
export function parseRatingsField(value: unknown): ChampionRatings | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const valid = RATING_KEYS.every((key) => {
    const rating = record[key]
    return typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 3
  })
  if (!valid) return null
  return {
    difficulty: record.difficulty as number,
    damage: record.damage as number,
    toughness: record.toughness as number,
    utility: record.utility as number,
  }
}

export function parseChampions(value: unknown): Champion[] {
  const champions = (value as { champions?: unknown } | null)?.champions
  if (!Array.isArray(champions)) throw new Error('champions.json must have a "champions" array')
  const slugs = new Set<string>()
  const ids = new Set<number>()
  for (const [index, champion] of (champions as Partial<Champion>[]).entries()) {
    if (typeof champion.heroId !== 'number' || typeof champion.name !== 'string' || typeof champion.slug !== 'string') {
      throw new Error(`champions.json[${index}]: missing heroId, name or slug`)
    }
    if (slugs.has(champion.slug)) throw new Error(`champions.json: duplicate slug ${champion.slug}`)
    if (ids.has(champion.heroId)) throw new Error(`champions.json: duplicate heroId ${champion.heroId}`)
    slugs.add(champion.slug)
    ids.add(champion.heroId)
  }
  return (champions as Champion[]).map((champion) => ({ ...champion, ratings: parseRatingsField(champion.ratings) }))
}
