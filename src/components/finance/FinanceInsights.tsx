'use client'

import { TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import type { Store } from '../../hooks/useStore'
import {
  categoryBudgetRows,
  formatMoney,
  roundMoney,
  spentOnDate,
  totalMonthlyExpenses,
} from '../../utils/finance'
import { addDays, todayDateKey } from '../../utils/time'
import { MeterBar, ProgressRing, Sparkline } from '../ui/Charts'
import { Badge, Card, EmptyState, Stat } from '../ui/Surfaces'

const TREND_DAYS = 30

/**
 * Visual readout for Money.
 *
 * The finance board was accurate but entirely numeric — no way to see a trend
 * or spot the category eating the budget without reading every row.
 */
export function FinanceInsights({ store }: { store: Store }) {
  const ledger = store.financeFor('personal')
  const today = todayDateKey()

  const trend = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const spend of ledger.spends) {
      byDate.set(spend.date, (byDate.get(spend.date) || 0) + spend.amount)
    }
    return Array.from(
      { length: TREND_DAYS },
      (_, i) => byDate.get(addDays(today, i - (TREND_DAYS - 1))) || 0,
    )
  }, [ledger.spends, today])

  const rows = useMemo(() => categoryBudgetRows(ledger, today), [ledger, today])

  const topCategories = useMemo(
    () =>
      [...rows]
        .filter((row) => row.monthlySpent > 0 || row.monthlyBudget > 0)
        .sort((a, b) => b.monthlySpent - a.monthlySpent)
        .slice(0, 6),
    [rows],
  )

  const spentToday = spentOnDate(ledger, today)
  const monthlyBudget = totalMonthlyExpenses(ledger)
  const dailyPace = roundMoney(monthlyBudget / 30)

  const last7 = trend.slice(-7).reduce((s, v) => s + v, 0)
  const prev7 = trend.slice(-14, -7).reduce((s, v) => s + v, 0)
  const delta = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null
  const monthTotal = useMemo(
    () =>
      ledger.spends
        .filter((s) => s.date.startsWith(today.slice(0, 7)))
        .reduce((sum, s) => sum + s.amount, 0),
    [ledger.spends, today],
  )

  const hasAnySpend = ledger.spends.length > 0

  if (!hasAnySpend && monthlyBudget <= 0) {
    return (
      <Card kicker="Money" title="Nothing to chart yet">
        <EmptyState
          icon={<Wallet />}
          title="No budgets or spends yet"
          body="Set your monthly expenses, then log a spend. Trends and pace show up here."
        />
      </Card>
    )
  }

  return (
    <div className="fin-insights">
      <Card
        kicker="Today"
        title="Against pace"
        className="fin-insights-pace"
        action={
          <Badge tone={dailyPace > 0 && spentToday > dailyPace ? 'danger' : 'accent'}>
            {dailyPace > 0 ? (spentToday > dailyPace ? 'Over' : 'On track') : 'No budget'}
          </Badge>
        }
      >
        <div className="fin-pace">
          <ProgressRing
            value={spentToday}
            max={dailyPace > 0 ? dailyPace : Math.max(spentToday, 1)}
            size={132}
            stroke={10}
            tone={dailyPace > 0 && spentToday > dailyPace ? 'danger' : 'accent'}
            label={formatMoney(spentToday)}
            sublabel={dailyPace > 0 ? `of ${formatMoney(dailyPace)}` : 'today'}
          />
          <div className="fin-pace-stats">
            <Stat
              label="Last 7 days"
              value={formatMoney(last7)}
              sub={
                delta == null
                  ? 'no prior week'
                  : `${delta >= 0 ? '+' : ''}${delta}% vs previous 7`
              }
              tone={delta != null && delta > 0 ? 'warn' : 'default'}
              icon={delta != null && delta > 0 ? <TrendingUp /> : <TrendingDown />}
            />
            <Stat
              label="This month"
              value={formatMoney(monthTotal)}
              sub={monthlyBudget > 0 ? `of ${formatMoney(monthlyBudget)} budget` : 'no budget set'}
              tone={monthlyBudget > 0 && monthTotal > monthlyBudget ? 'danger' : 'default'}
            />
          </div>
        </div>
      </Card>

      <Card kicker={`Last ${TREND_DAYS} days`} title="Spend trend">
        <Sparkline values={trend} height={72} tone="brass" />
        <div className="fin-trend-foot">
          <span className="ui-kicker">{TREND_DAYS} days ago</span>
          <span className="ui-kicker">Today</span>
        </div>
      </Card>

      <Card kicker="This month" title="Where it goes">
        {topCategories.length === 0 ? (
          <EmptyState
            icon={<Wallet />}
            title="No category spend this month"
            body="Log a spend against a category to see the breakdown."
          />
        ) : (
          <ul className="fin-breakdown">
            {topCategories.map((row) => (
              <li key={row.id}>
                <div className="fin-breakdown-top">
                  <span className="fin-breakdown-name">{row.name}</span>
                  <span className={`fin-breakdown-amt${row.over ? ' is-over' : ''}`}>
                    {formatMoney(row.monthlySpent)}
                    {row.monthlyBudget > 0 && (
                      <em> / {formatMoney(row.monthlyBudget)}</em>
                    )}
                  </span>
                </div>
                <MeterBar
                  value={row.monthlySpent}
                  max={row.monthlyBudget}
                  tone={row.over ? 'danger' : 'brass'}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
