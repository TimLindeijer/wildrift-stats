import { BRACKETS, LANES, type Bracket, type Lane } from '../../src/shared/constants.ts'
import type { BracketTable, LaneTable, Snapshot, SnapshotRow } from '../../src/shared/types.ts'
import { stableStringify } from './json.ts'
import { STATS_SOURCE, type ParsedRankList } from './tencent.ts'

/** Brackets and lanes in canonical order, rows sorted by heroId with a fixed key order. */
export function canonicalBrackets(brackets: BracketTable<SnapshotRow>): BracketTable<SnapshotRow> {
  const result: BracketTable<SnapshotRow> = {}
  for (const bracket of BRACKETS) {
    const lanes = brackets[bracket]
    if (!lanes) continue
    const laneTable: LaneTable<SnapshotRow> = {}
    for (const lane of LANES) {
      const rows = lanes[lane]
      if (!rows) continue
      laneTable[lane] = [...rows]
        .sort((a, b) => a.heroId - b.heroId)
        .map((row) => ({
          heroId: row.heroId,
          win: row.win,
          pick: row.pick,
          ban: row.ban,
          strength: row.strength,
          strengthLevel: row.strengthLevel,
        }))
    }
    result[bracket] = laneTable
  }
  return result
}

export function buildSnapshot(parsed: ParsedRankList, fetchedAt: string): Snapshot {
  return {
    schema: 1,
    date: parsed.date,
    fetchedAt,
    source: STATS_SOURCE,
    brackets: canonicalBrackets(parsed.brackets),
  }
}

/** True when two snapshots hold the same stats (ignores fetchedAt). */
export function sameStats(a: Pick<Snapshot, 'brackets'>, b: Pick<Snapshot, 'brackets'>): boolean {
  return stableStringify(canonicalBrackets(a.brackets)) === stableStringify(canonicalBrackets(b.brackets))
}

export type SnapshotStatus = 'added' | 'updated' | 'unchanged'

/** Decide what to do with a freshly fetched snapshot given the file already stored for its date. */
export function snapshotStatus(existing: Pick<Snapshot, 'brackets'> | null, next: Snapshot): SnapshotStatus {
  if (!existing) return 'added'
  return sameStats(existing, next) ? 'unchanged' : 'updated'
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Snapshot>
  return (
    candidate.schema === 1 &&
    typeof candidate.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.date) &&
    typeof candidate.brackets === 'object' &&
    candidate.brackets !== null
  )
}

export function snapshotFileName(date: string): string {
  return `${date}.json`
}

export interface LaneStats {
  rows: number
  winMin: number
  winMax: number
  winMean: number
  pickSum: number
  pickMax: number
  banMax: number
  strengthMin: number | null
  strengthMax: number | null
  strengthLevels: number[]
}

export type BracketLaneStats = Partial<Record<Bracket, Partial<Record<Lane, LaneStats>>>>

/** Per bracket/lane statistics used for the job summary and sanity checks. */
export function summarizeBrackets(brackets: BracketTable<SnapshotRow>): BracketLaneStats {
  const result: BracketLaneStats = {}
  for (const bracket of BRACKETS) {
    const lanes = brackets[bracket]
    if (!lanes) continue
    const laneStats: Partial<Record<Lane, LaneStats>> = {}
    for (const lane of LANES) {
      const rows = lanes[lane]
      if (!rows || rows.length === 0) continue
      const wins = rows.map((row) => row.win)
      const strengths = rows.map((row) => row.strength).filter((value): value is number => value !== null)
      const levels = new Set(rows.map((row) => row.strengthLevel).filter((value): value is number => value !== null))
      laneStats[lane] = {
        rows: rows.length,
        winMin: Math.min(...wins),
        winMax: Math.max(...wins),
        winMean: round2(wins.reduce((sum, value) => sum + value, 0) / wins.length),
        pickSum: round2(rows.reduce((sum, row) => sum + row.pick, 0)),
        pickMax: Math.max(...rows.map((row) => row.pick)),
        banMax: Math.max(...rows.map((row) => row.ban)),
        strengthMin: strengths.length ? Math.min(...strengths) : null,
        strengthMax: strengths.length ? Math.max(...strengths) : null,
        strengthLevels: [...levels].sort((a, b) => a - b),
      }
    }
    result[bracket] = laneStats
  }
  return result
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
