import { MAX_RATING } from '../lib/profile.ts'

/** A 1–3 rating drawn as a row of segments, read out as "2 of 3". */
export function RatingPips({ value, max = MAX_RATING }: { value: number | null | undefined; max?: number }) {
  if (value == null) {
    return (
      <span className="muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">not rated</span>
      </span>
    )
  }
  return (
    <span className="pips">
      <span className="pips__track" aria-hidden="true">
        {Array.from({ length: max }, (_, index) => (
          <span key={index} className={index < value ? 'pip pip--on' : 'pip'} />
        ))}
      </span>
      <span className="sr-only">{`${value} of ${max}`}</span>
    </span>
  )
}
