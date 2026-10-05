import { useId, type ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

interface SegmentedProps<T extends string> {
  /** Visible group label (the fieldset legend). */
  legend: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
}

/** A radio group drawn as a row of segments. Arrow keys move between options. */
export function Segmented<T extends string>({ legend, value, options, onChange }: SegmentedProps<T>) {
  const name = useId()
  return (
    <fieldset className="segmented">
      <legend className="control-label">{legend}</legend>
      <div className="segmented__track">
        {options.map((option) => (
          <label key={option.value} className="segmented__option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
