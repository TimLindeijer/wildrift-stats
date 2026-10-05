import { deltaDirection, formatDelta } from '../lib/format.ts'

interface DeltaProps {
  value: number | null | undefined
  /** Text after the number, e.g. " pts". */
  unit?: string
}

/** A signed change in percentage points: teal and "+" when up, coral and "−" when down. */
export function Delta({ value, unit = '' }: DeltaProps) {
  const direction = deltaDirection(value)
  if (direction === 'none') {
    return (
      <span className="delta delta--none">
        <span aria-hidden="true">—</span>
        <span className="sr-only">no data</span>
      </span>
    )
  }
  return <span className={`delta delta--${direction}`}>{`${formatDelta(value)}${unit}`}</span>
}
