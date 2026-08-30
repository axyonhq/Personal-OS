'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { uid } from '../../data/seed'
import type { Store } from '../../hooks/useStore'
import { computeFeelingCounts } from '../../utils/debriefAnalytics'
import { formatMoney } from '../../utils/finance'
import { lifestyleSpendByDay, summarizeLifestyleSeries } from '../../utils/lifestyleSpend'
import { aggregateSessionsByHour } from '../../utils/sessionAnalytics'
import {
  SUNDAY_REVIEW_VERSION,
  buildSundayReviewContext,
  computeSundayReviewStats,
  fallbackSundayReview,
  formatReviewCountdown,
  isSundayReviewVisible,
  reviewDateKeys,
  reviewForSlot,
  sessionsInReviewWindow,
  sundayReviewSlot,
} from '../../utils/sundayReview'
import { formatDayLabel, formatMinutes, todayDateKey } from '../../utils/time'
import { BarRow, ClockBars, MixBar, StackedTrend } from '../ui/Charts'

export function HomeSundayReview({ store }: { store: Store }) {
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const slot = sundayReviewSlot(new Date(now))
    const nextFire =
      now < slot.windowEnd.getTime() ? slot.windowEnd.getTime() : slot.visibleUntil.getTime()
    const delay = Math.min(Math.max(nextFire - now + 400, 1_000), 6 * 60 * 60 * 1000)
    const t = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(t)
  }, [now])

  const instant = new Date(now)
  const visible = isSundayReviewVisible(instant)
  const slot = sundayReviewSlot(instant)
  const review = reviewForSlot(store.state.sundayReviews, slot)
  const hasReview = Boolean(review)
  const stale = Boolean(review && (review.version ?? 1) < SUNDAY_REVIEW_VERSION)
  const countdown = formatReviewCountdown(slot.visibleUntil.getTime() - now)

  useEffect(() => {
    if (!store.hydrateReady || !visible || running.current) return
    if (hasReview && !stale) return
    running.current = true
    setBusy(true)
    setError(null)

    const currentSlot = sundayReviewSlot()
    const stats = computeSundayReviewStats(store.state, currentSlot)
    const fallback = fallbackSundayReview(stats, currentSlot)
    const context = buildSundayReviewContext(store.state, currentSlot)

    const save = (
      prose: Partial<
        Pick<
          typeof fallback,
          'spendSummary' | 'workSummary' | 'journalSummary' | 'synthesis' | 'focus' | 'focusWhy'
        >
      >,
    ) => {
      store.saveSundayReview({
        id: uid('sreview'),
        generatedAt: new Date().toISOString(),
        ...fallback,
        ...prose,
        version: SUNDAY_REVIEW_VERSION,
      })
    }

    void fetch('/api/sunday-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { review?: typeof fallback; error?: string }
        if (!res.ok || !data.review) {
          save({})
          if (data.error) setError(data.error)
          return
        }
        save(data.review)
      })
      .catch((err: unknown) => {
        save({})
        setError(err instanceof Error ? err.message : 'Review failed')
      })
      .finally(() => {
        running.current = false
        setBusy(false)
      })
  }, [store.hydrateReady, visible, hasReview, stale, slot.sundayDate, store])

  const visuals = useMemo(() => {
    const current = sundayReviewSlot(new Date(now))
    const days = reviewDateKeys(current.sundayDate)
    const today = todayDateKey(new Date(now))
    const sessions = sessionsInReviewWindow(store.state.timeEntries, current)
    const lifestyle = summarizeLifestyleSeries(
      lifestyleSpendByDay(store.state.personalFinance, days),
    )
    const workByDay = days.map((date) => {
      const minutes = sessions.filter((e) => e.date === date).reduce((sum, e) => sum + e.minutes, 0)
      return { date, minutes }
    })
    const peakWork = workByDay.reduce(
      (best, day) => (day.minutes > best.minutes ? day : best),
      { date: days[0], minutes: 0 },
    )
    const byHour = aggregateSessionsByHour(sessions)
    const peakHour = [...byHour].sort((a, b) => b.totalMinutes - a.totalMinutes)[0]
    const feelings = computeFeelingCounts(sessions)
    return {
      days,
      today,
      lifestyle,
      workByDay,
      peakWork: peakWork.minutes > 0 ? peakWork : null,
      byHour,
      peakHour: peakHour && peakHour.totalMinutes > 0 ? peakHour : null,
      feelings,
      debriefCount: sessions.filter((e) => e.debrief).length,
    }
  }, [now, store.state.personalFinance, store.state.timeEntries])

  if (!visible) return null

  const spendBars = visuals.lifestyle.days.map((day) => ({
    a: day.food,
    b: day.spendings,
    label: formatDayLabel(day.date).dow.slice(0, 2),
    title: `${day.date}: food ${formatMoney(day.food)}, spendings ${formatMoney(day.spendings)}`,
    active: day.date === visuals.today,
  }))
  const workBars = visuals.workByDay.map((day) => ({
    label: formatDayLabel(day.date).dow.slice(0, 2),
    value: day.minutes,
    title: `${day.date}: ${formatMinutes(day.minutes)}`,
    active: day.date === visuals.today || day.date === visuals.peakWork?.date,
  }))
  const clockBuckets = visuals.byHour.map((b) => ({
    hour: b.hour,
    label: b.label,
    value: Math.round(b.totalMinutes),
    peak: visuals.peakHour?.hour === b.hour,
  }))
  const mixParts = visuals.feelings.map((f) => ({
    key: f.feeling,
    label: f.label,
    value: f.count,
    tone:
      f.feeling === 'weapon'
        ? ('accent' as const)
        : f.feeling === 'solid'
          ? ('brass' as const)
          : f.feeling === 'meh'
            ? ('muted' as const)
            : ('danger' as const),
  }))

  return (
    <section className="home-review">
      <div className="home-card-head">
        <div>
          <span className="home-kicker">Sunday review</span>
          <h2>Last 7 days</h2>
        </div>
        <p className="home-review-countdown">
          <span className="home-kicker">Until next review</span>
          <strong>{countdown}</strong>
        </p>
      </div>

      {busy && !review && <p className="home-muted">Reading the week…</p>}
      {busy && review && stale && <p className="home-muted">Sharpening this week’s read…</p>}
      {error && !review?.synthesis && (
        <p className="home-muted">{error}. Showing the numbers.</p>
      )}

      {review && (
        <>
          <div className="home-review-stats">
            <div>
              <span>Spend</span>
              <strong>{formatMoney(review.spendTotal)}</strong>
              <em>{review.inBudget ? 'In budget' : 'Over budget'}</em>
            </div>
            <div>
              <span>Deep work</span>
              <strong>{formatMinutes(review.sessionMinutes)}</strong>
              <em>
                {review.sessionCount} session{review.sessionCount === 1 ? '' : 's'}
              </em>
            </div>
            <div>
              <span>Journal</span>
              <strong>{review.journalCount}</strong>
              <em>page{review.journalCount === 1 ? '' : 's'}</em>
            </div>
          </div>

          {review.synthesis && <p className="home-review-body">{review.synthesis}</p>}

          <div className="home-review-visuals">
            <article className="home-review-chart">
              <span className="home-kicker">Work by day</span>
              <h3>
                {visuals.peakWork
                  ? `${formatDayLabel(visuals.peakWork.date).dow} held the most time`
                  : 'No sessions this week'}
              </h3>
              <BarRow bars={workBars} height={88} />
              {visuals.peakWork && (
                <p>
                  Peak {formatMinutes(visuals.peakWork.minutes)} on{' '}
                  {formatDayLabel(visuals.peakWork.date).dow}
                </p>
              )}
            </article>

            <article className="home-review-chart">
              <span className="home-kicker">Food, drink & day-to-day</span>
              <h3>
                {visuals.lifestyle.total > 0
                  ? `${formatMoney(visuals.lifestyle.foodTotal)} food · ${formatMoney(visuals.lifestyle.spendingsTotal)} spendings`
                  : 'No day-to-day spend this week'}
              </h3>
              <StackedTrend
                days={spendBars}
                height={88}
                aLabel="Food & drink"
                bLabel="Spendings"
              />
              <p>Rent and monthly bills stay off this chart.</p>
            </article>

            <article className="home-review-chart is-wide">
              <span className="home-kicker">When you work</span>
              <h3>
                {visuals.peakHour
                  ? `Most minutes land around ${visuals.peakHour.label}`
                  : 'No clock data yet'}
              </h3>
              <ClockBars buckets={clockBuckets} height={88} />
              {visuals.peakHour && (
                <p>
                  {formatMinutes(Math.round(visuals.peakHour.totalMinutes))} in that hour ·{' '}
                  {visuals.peakHour.sessionCount} session
                  {visuals.peakHour.sessionCount === 1 ? '' : 's'}
                </p>
              )}
            </article>

            {visuals.debriefCount > 0 && (
              <article className="home-review-chart">
                <span className="home-kicker">How it felt</span>
                <h3>
                  {visuals.feelings
                    .filter((f) => f.count > 0)
                    .map((f) => `${f.label} ${f.count}`)
                    .join(' · ') || 'No debriefs'}
                </h3>
                <MixBar parts={mixParts} />
              </article>
            )}
          </div>

          {review.spendSummary && (
            <div className="home-review-block">
              <h3>Spend</h3>
              <p>{review.spendSummary}</p>
            </div>
          )}
          {review.workSummary && (
            <div className="home-review-block">
              <h3>Work</h3>
              <p>{review.workSummary}</p>
            </div>
          )}
          {review.journalSummary && (
            <div className="home-review-block">
              <h3>Journal</h3>
              <p>{review.journalSummary}</p>
            </div>
          )}
          {review.focus && (
            <div className="home-review-focus">
              <span className="home-kicker">Focus this week</span>
              <p>{review.focus}</p>
              {review.focusWhy ? <em>{review.focusWhy}</em> : null}
            </div>
          )}
        </>
      )}
    </section>
  )
}
