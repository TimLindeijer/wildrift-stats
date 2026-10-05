import { BRACKET_LABELS, BRACKETS, LANE_LABELS, LANES } from '../../src/shared/constants.ts'
import type { Snapshot } from '../../src/shared/types.ts'
import { summarizeBrackets, type SnapshotStatus } from './snapshot.ts'
import type { RankListSummary } from './tencent.ts'

export interface ReportInput {
  snapshot: Snapshot
  status: SnapshotStatus
  championsChanged: boolean
  championCount: number
  summary: RankListSummary
  warnings: readonly string[]
  dryRun: boolean
}

function range(min: number | null, max: number | null): string {
  return min === null || max === null ? '–' : `${min} – ${max}`
}

/** Markdown for $GITHUB_STEP_SUMMARY. */
export function renderReport(input: ReportInput): string {
  const { snapshot, status, summary } = input
  const lines: string[] = [
    `## Ranked snapshot ${snapshot.date}${input.dryRun ? ' (dry run)' : ''}`,
    '',
    `- Snapshot: **${status}**; champions.json: **${input.championsChanged ? 'changed' : 'unchanged'}** (${input.championCount} champions)`,
    `- Rows: ${summary.rowCount}; rank keys: ${summary.rankKeys.join(', ')}; lane keys: ${summary.laneKeys.join(', ')}` +
      (summary.emptyBrackets.length > 0 ? `; empty brackets: ${summary.emptyBrackets.join(', ')}` : ''),
    `- dtstatdate values: ${Object.entries(summary.dates)
      .map(([date, count]) => `${date} ×${count}`)
      .join(', ')}`,
    '',
    '| Bracket | Lane | Rows | Win % | Mean win % | Σ pick % | Max pick % | Max ban % | Strength | Levels |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ]
  const stats = summarizeBrackets(snapshot.brackets)
  for (const bracket of BRACKETS) {
    for (const lane of LANES) {
      const s = stats[bracket]?.[lane]
      if (!s) continue
      lines.push(
        `| ${BRACKET_LABELS[bracket]} | ${LANE_LABELS[lane]} | ${s.rows} | ${range(s.winMin, s.winMax)} | ${s.winMean} | ` +
          `${s.pickSum} | ${s.pickMax} | ${s.banMax} | ${range(s.strengthMin, s.strengthMax)} | ${s.strengthLevels.join(' ')} |`,
      )
    }
  }
  if (input.warnings.length > 0) {
    lines.push('', '### Warnings', '', ...input.warnings.map((warning) => `- ${warning}`))
  }
  return `${lines.join('\n')}\n`
}
