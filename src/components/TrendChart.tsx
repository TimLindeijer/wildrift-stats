import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { usePrefersReducedMotion } from '../hooks/index.ts'
import {
  dateTicks,
  formatMetric,
  niceAxis,
  paddedDomain,
  patchMarkers,
  seriesKey,
  seriesSummary,
  type ChartPoint,
  type Metric,
  type PatchMarker,
} from '../lib/chart.ts'
import { formatLongDate, formatShortDate } from '../lib/format.ts'
import { CHART } from '../lib/palette.ts'
import { dayToIso } from '../shared/dates.ts'
import type { Patch } from '../shared/types.ts'

/* Building blocks shared with CompareChart live here as plain functions and constants (not
   components), so this module still only exports components. */

const TICK_STYLE = { fill: CHART.tick, fontSize: 12 }

function formatDayTick(day: number): string {
  return formatShortDate(dayToIso(day))
}

function formatValueTick(metric: Metric) {
  return (value: number) => (metric === 'score' ? String(value) : `${value}%`)
}

/** Dashed vertical lines at patch releases; labels alternate height so close patches don't collide. */
function patchLines(markers: readonly PatchMarker[]) {
  return markers.map((marker, index) => (
    <ReferenceLine
      key={marker.version}
      x={marker.day}
      stroke={CHART.patch}
      strokeDasharray="4 4"
      label={{
        value: marker.version,
        position: 'top',
        offset: index % 2 === 0 ? 6 : 18,
        fill: CHART.patchLabel,
        fontSize: 11,
      }}
    />
  ))
}

type TrendTooltipProps = Partial<TooltipContentProps<number, string>> & { metric: Metric }

function TrendTooltip({ active, payload, metric }: TrendTooltipProps) {
  const point = payload?.[0]?.payload as ChartPoint | undefined
  if (!active || !point) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__date">{formatLongDate(point.date)}</p>
      <p className="chart-tooltip__value">{formatMetric(point.value, metric)}</p>
    </div>
  )
}

interface TrendChartProps {
  title: string
  metric: Metric
  points: ChartPoint[]
  patches: readonly Patch[]
  height?: number
}

/** One metric over time, with dashed patch markers. Callers show an empty state for short series. */
export function TrendChart({ title, metric, points, patches, height = 220 }: TrendChartProps) {
  const reducedMotion = usePrefersReducedMotion()
  const minDay = points[0]?.day ?? 0
  const maxDay = points.at(-1)?.day ?? 0
  const isWin = metric === 'win'
  const axis = niceAxis(
    paddedDomain(
      points.map((point) => point.value),
      { include: isWin ? [50] : [], minSpan: metric === 'score' ? 10 : isWin ? 4 : 1 },
    ),
    5,
  )

  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <LineChart responsive style={{ width: '100%', height }} data={points} margin={{ top: 30, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="day"
          type="number"
          domain={[minDay, maxDay]}
          ticks={dateTicks(minDay, maxDay)}
          tickFormatter={formatDayTick}
          stroke={CHART.axis}
          tick={TICK_STYLE}
          padding={{ left: 8, right: 8 }}
        />
        <YAxis
          domain={axis.domain}
          ticks={axis.ticks}
          tickFormatter={formatValueTick(metric)}
          stroke={CHART.axis}
          tick={TICK_STYLE}
          width={44}
        />
        {isWin && <ReferenceLine y={50} stroke={CHART.reference} strokeDasharray="2 3" />}
        {patchLines(patchMarkers(patches, minDay, maxDay))}
        <Tooltip
          content={<TrendTooltip metric={metric} />}
          cursor={{ stroke: CHART.cursor, strokeWidth: 1 }}
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="value"
          name={title}
          stroke={CHART.line}
          strokeWidth={2}
          dot={points.length <= 45 ? { r: 2.5, fill: CHART.line, strokeWidth: 0 } : false}
          activeDot={{ r: 5, fill: CHART.line, stroke: CHART.background, strokeWidth: 2 }}
          isAnimationActive={!reducedMotion}
          animationDuration={700}
        />
      </LineChart>
      <p className="sr-only">{seriesSummary(points, metric)}</p>
    </figure>
  )
}

export interface CompareSeries {
  id: string
  name: string
  color: string
  points: ChartPoint[]
}

type CompareTooltipProps = Partial<TooltipContentProps<number, string>> & { metric: Metric }

function CompareTooltip({ active, payload, label, metric }: CompareTooltipProps) {
  if (!active || !payload?.length || typeof label !== 'number') return null
  const entries = payload
    .filter((entry) => typeof entry.value === 'number')
    .sort((a, b) => (b.value as number) - (a.value as number))
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__date">{formatLongDate(dayToIso(label))}</p>
      <ul className="chart-tooltip__list">
        {entries.map((entry) => (
          <li key={String(entry.dataKey)}>
            <span className="swatch" style={{ background: entry.color }} aria-hidden="true" />
            <span className="chart-tooltip__name">{entry.name}</span>
            <span className="chart-tooltip__num">{formatMetric(entry.value as number, metric)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface CompareChartProps {
  title: string
  metric: Metric
  data: Record<string, number>[]
  series: readonly CompareSeries[]
  patches: readonly Patch[]
  height?: number
}

/** Several champions on one chart. `data` comes from mergeSeries(series.map(s => s.points)). */
export function CompareChart({ title, metric, data, series, patches, height = 340 }: CompareChartProps) {
  const reducedMotion = usePrefersReducedMotion()
  const minDay = data[0]?.day ?? 0
  const maxDay = data.at(-1)?.day ?? 0
  const isWin = metric === 'win'
  const axis = niceAxis(
    paddedDomain(
      series.flatMap((item) => item.points.map((point) => point.value)),
      { include: isWin ? [50] : [], minSpan: metric === 'score' ? 10 : isWin ? 4 : 1 },
    ),
    6,
  )

  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <LineChart responsive style={{ width: '100%', height }} data={data} margin={{ top: 30, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="day"
          type="number"
          domain={[minDay, maxDay]}
          ticks={dateTicks(minDay, maxDay)}
          tickFormatter={formatDayTick}
          stroke={CHART.axis}
          tick={TICK_STYLE}
          padding={{ left: 8, right: 8 }}
        />
        <YAxis
          domain={axis.domain}
          ticks={axis.ticks}
          tickFormatter={formatValueTick(metric)}
          stroke={CHART.axis}
          tick={TICK_STYLE}
          width={44}
        />
        {isWin && <ReferenceLine y={50} stroke={CHART.reference} strokeDasharray="2 3" />}
        {patchLines(patchMarkers(patches, minDay, maxDay))}
        <Tooltip
          content={<CompareTooltip metric={metric} />}
          cursor={{ stroke: CHART.cursor, strokeWidth: 1 }}
          isAnimationActive={false}
        />
        {series.map((item, index) => (
          <Line
            key={item.id}
            type="linear"
            dataKey={seriesKey(index)}
            name={item.name}
            stroke={item.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: item.color, stroke: CHART.background, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={!reducedMotion}
            animationDuration={700}
          />
        ))}
      </LineChart>
      <div className="sr-only">
        {series.map((item) => (
          <p key={item.id}>{`${item.name}: ${seriesSummary(item.points, metric)}`}</p>
        ))}
      </div>
    </figure>
  )
}
