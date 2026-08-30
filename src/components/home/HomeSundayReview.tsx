'use client'

import { useEffect, useRef, useState } from 'react'
import { uid } from '../../data/seed'
import type { Store } from '../../hooks/useStore'
import {
  buildSundayReviewContext,
  computeSundayReviewStats,
  fallbackSundayReview,
  isSundayReviewVisible,
  reviewForSlot,
  sundayReviewSlot,
} from '../../utils/sundayReview'
import { formatMinutes } from '../../utils/time'
import { formatMoney } from '../../utils/finance'

export function HomeSundayReview({ store }: { store: Store }) {
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const slot = sundayReviewSlot(new Date(now))
    const nextFire = now < slot.windowEnd.getTime()
      ? slot.windowEnd.getTime()
      : slot.windowEnd.getTime() + 7 * 24 * 60 * 60 * 1000
    const delay = Math.min(Math.max(nextFire - now + 400, 1_000), 6 * 60 * 60 * 1000)
    const t = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(t)
  }, [now])

  const instant = new Date(now)
  const visible = isSundayReviewVisible(instant)
  const slot = sundayReviewSlot(instant)
  const review = reviewForSlot(store.state.sundayReviews, slot)

  const hasReview = Boolean(review)

  useEffect(() => {
    if (!store.hydrateReady || !visible || hasReview || running.current) return
    running.current = true
    setBusy(true)
    setError(null)

    const currentSlot = sundayReviewSlot()
    const stats = computeSundayReviewStats(store.state, currentSlot)
    const fallback = fallbackSundayReview(stats, currentSlot)
    const context = buildSundayReviewContext(store.state, currentSlot)

    const save = (
      prose: Partial<Pick<typeof fallback, 'spendSummary' | 'workSummary' | 'journalSummary' | 'synthesis' | 'focus'>>,
    ) => {
      store.saveSundayReview({
        id: uid('sreview'),
        generatedAt: new Date().toISOString(),
        ...fallback,
        ...prose,
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
  }, [store.hydrateReady, visible, hasReview, slot.sundayDate, store])

  if (!visible) return null

  return (
    <section className="home-review">
      <div className="home-card-head">
        <div>
          <span className="home-kicker">Sunday review</span>
          <h2>Last 7 days</h2>
        </div>
        <span className="home-review-window">Until Monday 4pm Bali</span>
      </div>

      {busy && !review && <p className="home-muted">Reading the week…</p>}
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
            </div>
          )}
        </>
      )}
    </section>
  )
}
