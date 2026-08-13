import { useMemo, useState } from 'react'
import type { Store } from '../../hooks/useStore'
import type { ExpenseFrequency, SpendEntry } from '../../types'
import {
  categoryBudgetRows,
  formatMoney,
  roundMoney,
  spentOnDate,
  unexpectedSpentInFrequency,
} from '../../utils/finance'
import { formatLongDate, todayDateKey, weekDays } from '../../utils/time'

const FREQ_ORDER: ExpenseFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']

function periodWord(frequency: ExpenseFrequency): string {
  if (frequency === 'daily') return 'day'
  if (frequency === 'weekly') return 'week'
  if (frequency === 'yearly') return 'year'
  return 'month'
}

function spendTitle(
  spend: SpendEntry,
  cats: Map<string, { name: string; parentId?: string }>,
): string {
  if (spend.kind === 'unexpected') return spend.label || 'Unexpected'
  const cat = spend.categoryId ? cats.get(spend.categoryId) : null
  if (!cat) return spend.label || spend.note || 'Spend'
  const parent = cat.parentId ? cats.get(cat.parentId) : null
  return parent ? `${parent.name} → ${cat.name}` : cat.name
}

export function PersonalFinanceDashboard({ store }: { store: Store }) {
  const ledger = store.financeFor('personal')
  const date = todayDateKey()
  const [feedScope, setFeedScope] = useState<'today' | 'week' | 'month'>('today')

  const names = useMemo(() => {
    const map = new Map(ledger.categories.map((c) => [c.id, c]))
    return map
  }, [ledger.categories])

  const rows = useMemo(() => categoryBudgetRows(ledger, date), [ledger, date])
  const todaySpent = spentOnDate(ledger, date)
  const dailyBudget = roundMoney(rows.reduce((sum, row) => sum + row.dailyBudget, 0))
  const todayLeft = roundMoney(dailyBudget - todaySpent)
  const todayOver = todayLeft < 0
  const anyOver = rows.some((row) => row.budget > 0 && row.over)
  const monthPrefix = date.slice(0, 7)
  const unexpectedToday = unexpectedSpentInFrequency(ledger, 'daily', date)
  const inBudgetCount = rows.filter((row) => row.budget > 0 && !row.over).length
  const trackedCount = rows.filter((row) => row.budget > 0).length

  const feed = useMemo(() => {
    const week = new Set(weekDays(date))
    return ledger.spends
      .filter((s) => {
        if (feedScope === 'today') return s.date === date
        if (feedScope === 'week') return week.has(s.date)
        return s.date.startsWith(monthPrefix)
      })
      .slice(0, 18)
  }, [ledger.spends, feedScope, date, monthPrefix])

  const grouped = FREQ_ORDER.map((frequency) => ({
    frequency,
    rows: rows.filter((row) => row.frequency === frequency && (row.budget > 0 || row.spent > 0 || row.children.length > 0)),
  })).filter((group) => group.rows.length > 0)

  return (
    <div className="pf-board">
      <section className={`pf-hero${todayOver || anyOver ? ' over' : ' ok'}`}>
        <div className="pf-hero-copy">
          <span className="pf-kicker">{formatLongDate(date)}</span>
          <h2 className="pf-hero-title">Today</h2>
          <p className="pf-hero-lede">
            {dailyBudget <= 0
              ? 'Set budgets, then this board tracks the day against them.'
              : todayOver
                ? `Over today’s pace by ${formatMoney(Math.abs(todayLeft))}.`
                : `${formatMoney(todayLeft)} left in today’s pace.`}
          </p>
        </div>
        <div className="pf-hero-stat">
          <span className="pf-hero-label">Spent today</span>
          <strong className="pf-hero-value">{formatMoney(todaySpent)}</strong>
          <span className="pf-hero-sub">
            {dailyBudget > 0 ? `${formatMoney(dailyBudget)} daily pace` : 'No daily pace yet'}
          </span>
        </div>
        <div className="pf-hero-status">
          <span className={`pf-status-pill${todayOver || anyOver ? ' over' : ' ok'}`}>
            {trackedCount === 0
              ? 'No budgets'
              : anyOver
                ? 'A category is over'
                : todayOver
                  ? 'Over today'
                  : 'In budget'}
          </span>
          {trackedCount > 0 && (
            <span className="pf-hero-meta">
              {inBudgetCount}/{trackedCount} categories on track
            </span>
          )}
        </div>
      </section>

      <section className="pf-metrics">
        <article className="pf-metric">
          <span className="pf-metric-label">This week</span>
          <strong>{formatMoney(rows.reduce((sum, row) => sum + row.weeklySpent, 0) + unexpectedSpentInFrequency(ledger, 'weekly', date))}</strong>
          <em>of {formatMoney(rows.reduce((sum, row) => sum + row.weeklyBudget, 0))} weekly</em>
        </article>
        <article className="pf-metric">
          <span className="pf-metric-label">This month</span>
          <strong>{formatMoney(rows.reduce((sum, row) => sum + row.monthlySpent, 0) + unexpectedSpentInFrequency(ledger, 'monthly', date))}</strong>
          <em>of {formatMoney(rows.reduce((sum, row) => sum + row.monthlyBudget, 0))} monthly</em>
        </article>
        <article className="pf-metric">
          <span className="pf-metric-label">Unexpected today</span>
          <strong>{formatMoney(unexpectedToday)}</strong>
          <em>{unexpectedToday > 0 ? 'Not in a set budget' : 'None logged'}</em>
        </article>
      </section>

      <section className="pf-cats">
        <header className="pf-section-head">
          <h3>Budgets</h3>
          <p>Each category’s real period, plus the day / week / month cut.</p>
        </header>

        {grouped.length === 0 ? (
          <p className="finance-empty">No set expenses yet. Open Set expenses to add them.</p>
        ) : (
          grouped.map((group) => (
            <div key={group.frequency} className="pf-cat-group">
              <span className="pf-cat-group-label">{group.frequency}</span>
              <ul className="pf-cat-grid">
                {group.rows.map((row) => (
                  <li key={row.id} className={`pf-cat${row.over ? ' over' : row.ahead < 0 ? ' hot' : ' ok'}`}>
                    <div className="pf-cat-top">
                      <div>
                        <span className="pf-cat-name">{row.name}</span>
                        <span className="pf-cat-period">
                          {row.over
                            ? `Over this ${periodWord(row.frequency)}`
                            : row.budget <= 0
                              ? 'No budget'
                              : `${formatMoney(row.remaining)} left this ${periodWord(row.frequency)}`}
                        </span>
                      </div>
                      <strong className="pf-cat-amt">
                        {formatMoney(row.spent)}
                        <span> / {formatMoney(row.budget)}</span>
                      </strong>
                    </div>
                    <div className="pf-cat-bar" aria-hidden>
                      <div
                        className="pf-cat-fill"
                        style={{ width: `${Math.min(100, row.pct)}%` }}
                      />
                    </div>
                    <div className="pf-cat-cuts">
                      <span className={row.dailySpent > row.dailyBudget && row.dailyBudget > 0 ? 'over' : ''}>
                        Day {formatMoney(row.dailySpent)}
                        <em>/{formatMoney(row.dailyBudget)}</em>
                      </span>
                      <span className={row.weeklySpent > row.weeklyBudget && row.weeklyBudget > 0 ? 'over' : ''}>
                        Week {formatMoney(row.weeklySpent)}
                        <em>/{formatMoney(row.weeklyBudget)}</em>
                      </span>
                      <span className={row.monthlySpent > row.monthlyBudget && row.monthlyBudget > 0 ? 'over' : ''}>
                        Month {formatMoney(row.monthlySpent)}
                        <em>/{formatMoney(row.monthlyBudget)}</em>
                      </span>
                    </div>
                    {row.budget > 0 && row.frequency !== 'daily' && (
                      <p className="pf-cat-pace">
                        {row.ahead >= 0
                          ? `${formatMoney(row.ahead)} under pace`
                          : `${formatMoney(Math.abs(row.ahead))} ahead of pace`}
                      </p>
                    )}
                    {row.children.length > 0 && (
                      <ul className="pf-cat-kids">
                        {row.children.map((kid) => (
                          <li key={kid.id} className={kid.over ? 'over' : ''}>
                            <span>{kid.name}</span>
                            <span>
                              {formatMoney(kid.spent)} / {formatMoney(kid.budget)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="pf-feed">
        <header className="pf-section-head">
          <h3>Logged spends</h3>
          <div className="pf-feed-toggle" role="group" aria-label="Spend period">
            {(['today', 'week', 'month'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                className={feedScope === scope ? 'active' : ''}
                onClick={() => setFeedScope(scope)}
              >
                {scope === 'today' ? 'Today' : scope === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </header>
        {feed.length === 0 ? (
          <p className="finance-empty">
            {feedScope === 'today' ? 'No spends logged today.' : 'No spends in this period.'}
          </p>
        ) : (
          <ul className="pf-feed-list">
            {feed.map((spend) => (
              <li key={spend.id}>
                <div>
                  <span className="pf-feed-name">{spendTitle(spend, names)}</span>
                  <span className="pf-feed-meta">
                    {feedScope === 'today' ? spend.note || 'Logged spend' : spend.date}
                    {feedScope !== 'today' && spend.note ? ` · ${spend.note}` : ''}
                  </span>
                </div>
                <strong>{formatMoney(spend.amount)}</strong>
                <button
                  type="button"
                  className="x-btn visible"
                  aria-label="Remove spend"
                  onClick={() => store.removeSpend('personal', spend.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
