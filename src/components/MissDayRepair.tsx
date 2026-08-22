'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Store } from '../hooks/useStore'
import { isDeepWorkId } from '../types'
import { addDays, formatLongDate, formatMinutes, todayDateKey } from '../utils/time'
import { ModalPortal } from './ui/ModalPortal'

export function MissDayRepair({
  store,
  open,
  onClose,
}: {
  store: Store
  open: boolean
  onClose: () => void
}) {
  const today = todayDateKey()
  const yesterday = addDays(today, -1)
  const [broke, setBroke] = useState('')
  const [oneThing, setOneThing] = useState(store.state.dailyOneThing[today] || '')
  const [finished, setFinished] = useState(false)
  const wasOpen = useRef(false)

  // Reset form only when the overlay opens — not when store updates mid-save.
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true
    setBroke('')
    setOneThing(store.state.dailyOneThing[today] || '')
    setFinished(false)
  }, [open, store.state.dailyOneThing, today])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const yMinutes = useMemo(
    () =>
      store.state.timeEntries
        .filter((e) => e.date === yesterday && isDeepWorkId(e.projectId))
        .reduce((s, e) => s + e.minutes, 0),
    [store.state.timeEntries, yesterday],
  )

  if (!open || typeof document === 'undefined') return null

  const canComplete = broke.trim().length > 2 && oneThing.trim().length > 2

  const complete = () => {
    if (!canComplete) return
    store.setOneThing(today, oneThing.trim())
    store.appendMentorMessage({
      role: 'system',
      text: `Miss-day repair · ${today}. What broke: ${broke.trim()}. Recommit One Thing: ${oneThing.trim()}.`,
    })
    store.completeAutopilot('missRepair', today)
    setFinished(true)
  }

  return (
    <ModalPortal>
      <div className="wind-down-overlay" role="dialog" aria-modal aria-labelledby="miss-repair-title">
        <div className="wind-down-shell miss-repair-shell">
          <header className="wind-down-head">
            <div className="wind-down-brand">
              <span className="wind-down-kicker">Autopilot · Miss-day repair</span>
              <h2 id="miss-repair-title">
                {finished ? 'Back on the rail' : 'Repair the miss'}
              </h2>
              <p className="wind-down-copy">
                {finished
                  ? 'Momentum doesn’t need perfection. It needs re-entry. Go.'
                  : 'A miss without a repair becomes a slide. Three minutes. Recommit.'}
              </p>
            </div>
            <button type="button" className="x-btn visible" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          <div className="wind-down-body">
            {finished ? (
              <div className="wind-down-done">
                <div className="wind-down-done-mark" aria-hidden="true" />
                <p>Repair locked for {formatLongDate(today)}. Protect the One Thing.</p>
                <button type="button" className="btn-primary" onClick={onClose}>
                  Close
                </button>
              </div>
            ) : (
              <div className="miss-repair-panel">
                <div className="miss-repair-signal">
                  <span className="status-pill">YESTERDAY</span>
                  <p>
                    Deep work {formatMinutes(yMinutes)} /{' '}
                    {formatMinutes(store.state.dailyDeepWorkTargetMinutes)} ·{' '}
                    {formatLongDate(yesterday)}
                  </p>
                </div>

                <label className="field">
                  <span className="field-label">What broke</span>
                  <textarea
                    rows={3}
                    value={broke}
                    onChange={(e) => setBroke(e.target.value)}
                    placeholder="Phone? Late start? Sleep? Avoidance? Name it."
                    required
                  />
                  {broke.trim().length > 0 && broke.trim().length <= 2 && (
                    <span className="miss-repair-hint">Name it in a few words.</span>
                  )}
                </label>

                <label className="field">
                  <span className="field-label">Today’s One Thing (cut the day)</span>
                  <input
                    value={oneThing}
                    onChange={(e) => setOneThing(e.target.value)}
                    placeholder="If everything else burns — this still ships."
                  />
                </label>

                <p className="miss-repair-hint">
                  Cut scope. One outcome. Then move — repair is incomplete until you execute.
                </p>
              </div>
            )}
          </div>

          {!finished && (
            <footer className="wind-down-foot">
              <button type="button" className="ghost-btn" onClick={onClose}>
                Later
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!canComplete}
                onClick={complete}
              >
                Lock repair · execute
              </button>
            </footer>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
