'use client'

/** Compact number field with its own arrows — the native ones do not fit in the slot. */
export default function Stepper({ value, min = 0, max = 10, onChange, prefix, width = '2.4rem' }: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  prefix?: string
  width?: string
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <span className="stepper" onClick={(e) => e.stopPropagation()}>
      {prefix && <span className="stepper-prefix">{prefix}</span>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        style={{ width }}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      <span className="stepper-arrows">
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label="increase"
        >▲</button>
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label="decrease"
        >▼</button>
      </span>
    </span>
  )
}
