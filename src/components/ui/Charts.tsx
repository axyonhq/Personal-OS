'use client'

import { useId, type ReactNode } from 'react'

/**
 * Lightweight SVG charts.
 *
 * Hand-rolled rather than pulling in a charting library: these three shapes
 * cover every readout in the app and add no bundle weight.
 */

/** Circular progress with the headline value in the middle. */
export function ProgressRing({
  value,
  max,
  size = 148,
  stroke = 10,
  label,
  sublabel,
  tone = 'accent',
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  label?: ReactNode
  sublabel?: ReactNode
  tone?: 'accent' | 'warn' | 'danger'
}) {
  const safeMax = max > 0 ? max : 1
  const pct = Math.max(0, Math.min(1, value / safeMax))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = circumference * pct
  const percentLabel = Math.round(pct * 100)

  return (
    <div className="ui-ring" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${percentLabel}% of target`}
      >
        <circle
          className="ui-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className={`ui-ring-value ui-ring-${tone}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          // Start at 12 o'clock instead of 3 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ui-ring-center">
        {label && <span className="ui-ring-label">{label}</span>}
        {sublabel && <span className="ui-ring-sub">{sublabel}</span>}
      </div>
    </div>
  )
}

/** Compact trend line. Flat line when every value is equal. */
export function Sparkline({
  values,
  width = 240,
  height = 48,
  tone = 'accent',
  showArea = true,
}: {
  values: number[]
  width?: number
  height?: number
  tone?: 'accent' | 'brass' | 'danger'
  showArea?: boolean
}) {
  const gradientId = useId()
  if (values.length === 0) return null

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const stepX = values.length > 1 ? width / (values.length - 1) : width

  const points = values.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * height
    return [x, y] as const
  })

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg
      className={`ui-spark ui-spark-${tone}`}
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="ui-spark-stop-top" />
          <stop offset="100%" className="ui-spark-stop-bottom" />
        </linearGradient>
      </defs>
      {showArea && <path d={area} fill={`url(#${gradientId})`} stroke="none" />}
      <path d={line} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Horizontal budget/progress bar that reads as over-budget past 100%. */
export function MeterBar({
  value,
  max,
  tone = 'accent',
  showOverflow = true,
}: {
  value: number
  max: number
  tone?: 'accent' | 'warn' | 'danger' | 'brass'
  showOverflow?: boolean
}) {
  const safeMax = max > 0 ? max : 0
  const pct = safeMax > 0 ? (value / safeMax) * 100 : value > 0 ? 100 : 0
  const over = showOverflow && pct > 100
  return (
    <div
      className={`ui-meter${over ? ' is-over' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
    >
      <span
        className={`ui-meter-fill ui-meter-${over ? 'danger' : tone}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

/** Stacked day columns, used for the week-at-a-glance readout. */
export function BarRow({
  bars,
  height = 72,
}: {
  bars: { label: string; value: number; target?: number; active?: boolean }[]
  height?: number
}) {
  const max = Math.max(...bars.map((b) => Math.max(b.value, b.target || 0)), 1)
  return (
    <div className="ui-bars" style={{ height }}>
      {bars.map((bar) => {
        const pct = (bar.value / max) * 100
        const targetPct = bar.target ? (bar.target / max) * 100 : null
        const hit = bar.target != null && bar.value >= bar.target
        return (
          <div key={bar.label} className={`ui-bar-col${bar.active ? ' is-active' : ''}`}>
            <div className="ui-bar-track">
              {targetPct != null && (
                <span className="ui-bar-target" style={{ bottom: `${Math.min(100, targetPct)}%` }} />
              )}
              <span
                className={`ui-bar-fill${hit ? ' is-hit' : ''}`}
                style={{ height: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className="ui-bar-label">{bar.label}</span>
          </div>
        )
      })}
    </div>
  )
}
