'use client'

import { useMemo } from 'react'
import type { Store } from '../../hooks/useStore'
import {
  categoryBudgetRows,
  formatMoney,
  roundMoney,
  spentOnDate,
  totalMonthlyExpenses,
} from '../../utils/finance'
import { addDays, formatMinutes, todayDateKey } from '../../utils/time'
import { MeterBar, Sparkline } from '../ui/Charts'

export function HomeMetrics({ store }: { store: Store }) {
  const today = todayDateKey()
  const ledger = store.state.personalFinance
  const rows = useMemo(() => categoryBudgetRows(ledger, today), [ledger, today])

  const spentToday = spentOnDate(ledger, today)
  const monthlyBudget = totalMonthlyExpenses(ledger)
  const dailyPace = roundMoney(monthlyBudget / 30)
  const monthPrefix = today.slice(0, 7)
  const monthSpent = useMemo(
    () => ledger.spends.filter((s) => s.date.startsWith(monthPrefix)).reduce((sum, s) => sum + s.amount, 0),
    [ledger.spends, monthPrefix],
  )
  const weekSpent = rows.reduce((sum, row) => sum + row.weeklySpent, 0)
  const weekBudget = rows.reduce((sum, row) => sum + row.weeklyBudget, 0)
  const anyOver = rows.some((row) => row.budget > 0 && row.over)
  const todayOver = dailyPace > 0 && spentToday > dailyPace
  const monthOver = monthlyBudget > 0 && monthSpent > monthlyBudget
  const over = anyOver || todayOver || monthOver
  const inBudget = monthlyBudget > 0 && !over

  const spendTrend = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const spend of ledger.spends) {
      byDate.set(spend.date, (byDate.get(spend.date) || 0) + spend.amount)
    }
    return Array.from({ length: 7 }, (_, i) => byDate.get(addDays(today, i - 6)) || 0)
  }, [ledger.spends, today])

  const workTrend = useMemo(
    () => Array.from({ length: 7 }, (_, i) => store.deepWorkMinutesForDate(addDays(today, i - 6))),
    [store, today],
  )
  const weekWork = workTrend.reduce((s, v) => s + v, 0)
  const weekSessions = useMemo(() => {
    const days = new Set(Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)))
    return store.state.timeEntries.filter((e) => days.has(e.date)).length
  }, [store.state.timeEntries, today])
  const todayWork = store.deepWorkMinutesForDate(today)
  const topCats = [...rows]
    .filter((row) => row.monthlySpent > 0 || row.monthlyBudget > 0)
    .sort((a, b) => b.monthlySpent - a.monthlySpent)
    .slice(0, 4)

  return (
    <section className="home-metrics" aria-label="This week">
      <article className={`home-status${over ? ' is-over' : inBudget ? ' is-ok' : ''}`}>
        <span className="home-kicker">Budget</span>
        <strong>
          {monthlyBudget <= 0 ? 'No budget set' : over ? 'Over budget' : 'In budget'}
        </strong>
        <p>
          {monthlyBudget <= 0
            ? 'Edit categories to set a line to hold.'
            : `${formatMoney(monthSpent)} of ${formatMoney(monthlyBudget)} this month`}
        </p>
      </article>

      <article className="home-metric">
        <span className="home-kicker">Spend</span>
        <strong>{formatMoney(weekSpent)}</strong>
        <p>
          this week
          {weekBudget > 0 ? ` · ${formatMoney(weekBudget)} pace` : ''}
        </p>
        <div className="home-metric-chart">
          <Sparkline values={spendTrend} height={40} tone={over ? 'danger' : 'accent'} />
        </div>
        {dailyPace > 0 && (
          <MeterBar value={spentToday} max={dailyPace} tone={todayOver ? 'danger' : 'accent'} />
        )}
        <span className="home-metric-foot">
          Today {formatMoney(spentToday)}
          {dailyPace > 0 ? ` / ${formatMoney(dailyPace)}` : ''}
        </span>
      </article>

      <article className="home-metric">
        <span className="home-kicker">Deep work</span>
        <strong>{formatMinutes(weekWork)}</strong>
        <p>
          {weekSessions} session{weekSessions === 1 ? '' : 's'} this week
        </p>
        <div className="home-metric-chart">
          <Sparkline values={workTrend} height={40} />
        </div>
        <span className="home-metric-foot">Today {formatMinutes(todayWork)}</span>
      </article>

      {topCats.length > 0 && (
        <ul className="home-cats">
          {topCats.map((row) => (
            <li key={row.id} className={row.over ? 'is-over' : ''}>
              <span>{row.name}</span>
              <strong>
                {formatMoney(row.monthlySpent)}
                {row.monthlyBudget > 0 ? <em> / {formatMoney(row.monthlyBudget)}</em> : null}
              </strong>
              {row.monthlyBudget > 0 && (
                <MeterBar
                  value={row.monthlySpent}
                  max={row.monthlyBudget}
                  tone={row.over ? 'danger' : 'accent'}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
