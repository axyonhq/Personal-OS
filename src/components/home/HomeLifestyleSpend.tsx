'use client'

import { useMemo } from 'react'
import type { Store } from '../../hooks/useStore'
import { formatMoney } from '../../utils/finance'
import { lifestyleSpendSeries } from '../../utils/lifestyleSpend'
import { formatDayLabel, todayDateKey } from '../../utils/time'
import { StackedTrend } from '../ui/Charts'

const DAYS = 30

export function HomeLifestyleSpend({ store }: { store: Store }) {
  const today = todayDateKey()
  const series = useMemo(
    () => lifestyleSpendSeries(store.state.personalFinance, today, DAYS),
    [store.state.personalFinance, today],
  )

  const trendDays = series.days.map((day, i) => {
    const { dow, day: d } = formatDayLabel(day.date)
    const showLabel = i === 0 || i === 14 || i === DAYS - 1
    return {
      a: day.food,
      b: day.spendings,
      label: showLabel ? String(d) : '',
      title: `${dow} ${day.date}: food ${formatMoney(day.food)}, spendings ${formatMoney(day.spendings)}`,
      active: i === DAYS - 1,
    }
  })

  const peakLabel = series.peak
    ? `${formatDayLabel(series.peak.date).dow} ${formatDayLabel(series.peak.date).day}`
    : null

  return (
    <section className="home-lifestyle">
      <div className="home-card-head">
        <div>
          <span className="home-kicker">Last {DAYS} days</span>
          <h2>Food, drink & day-to-day</h2>
        </div>
      </div>
      <p className="home-card-copy">
        Rent, motorbike, and other monthly bills stay off this chart. This is food, drink, and
        spendings only.
      </p>

      <div className="home-lifestyle-stats">
        <div>
          <span>Food & drink</span>
          <strong>{formatMoney(series.foodTotal)}</strong>
        </div>
        <div>
          <span>Spendings</span>
          <strong>{formatMoney(series.spendingsTotal)}</strong>
        </div>
        <div>
          <span>Per day</span>
          <strong>{formatMoney(series.avgPerDay)}</strong>
        </div>
      </div>

      {series.total > 0 ? (
        <>
          <StackedTrend
            days={trendDays}
            height={120}
            aLabel="Food & drink"
            bLabel="Spendings"
          />
          <div className="home-lifestyle-legend">
            <span>
              <i className="home-swatch is-food" /> Food & drink
            </span>
            <span>
              <i className="home-swatch is-spend" /> Spendings
            </span>
            {peakLabel && series.peak ? (
              <em>
                Peak {formatMoney(series.peak.total)} on {peakLabel}
              </em>
            ) : null}
          </div>
        </>
      ) : (
        <p className="home-muted">No food, drink, or day-to-day spend in the last {DAYS} days.</p>
      )}
    </section>
  )
}
