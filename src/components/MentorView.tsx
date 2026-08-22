'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Store } from '../hooks/useStore'
import { buildMentorContext } from '../lib/mentor/context'
import { clipMentorContext } from '../lib/mentor/clipContext'
import type { MentorCharge, MentorChargeInstall, MentorInsight } from '../types'
import { addDays, todayDateKey } from '../utils/time'
import { JournalCapture } from './JournalCapture'

function formatInsightTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

export function MentorView({ store }: { store: Store }) {
  const mentor = store.state.mentor
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'chat' | 'analyze' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [installNote, setInstallNote] = useState<string | null>(null)
  const [showCleared, setShowCleared] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  const debriefCount = useMemo(
    () => store.state.timeEntries.filter((e) => e.debrief).length,
    [store.state.timeEntries],
  )
  const journalReady = mentor.journalEntries.filter((j) => j.status === 'extracted').length
  // Memoized so the derived lists below do not recompute on every render.
  const charges = useMemo(() => mentor.charges || [], [mentor.charges])
  const openCharges = useMemo(
    () => charges.filter((c) => c.status === 'open'),
    [charges],
  )
  const clearedCharges = useMemo(
    () =>
      charges
        .filter((c) => c.status === 'actioned' || c.status === 'dismissed')
        .sort((a, b) => (b.actionedAt || b.updatedAt).localeCompare(a.actionedAt || a.updatedAt))
        .slice(0, 20),
    [charges],
  )

  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [mentor.messages, busy])

  const sendChat = async (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setError(null)
    setBusy('chat')
    store.appendMentorMessage({ role: 'user', text })

    try {
      const history = [...store.state.mentor.messages]
        .filter((m) => m.role === 'user' || m.role === 'mentor')
        .slice(-16)
        .map((m) => ({
          role: m.role === 'mentor' ? ('assistant' as const) : ('user' as const),
          content: m.text,
        }))

      const res = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: buildMentorContext(store.state),
          history: history.slice(0, -1),
        }),
      })

      if (!res.ok) {
        // Failures still come back as JSON; only the success path streams.
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Mentor unavailable')
      }

      if (!res.body) throw new Error('Mentor returned no response body')

      // Render tokens as they arrive instead of blocking on the whole reply.
      const messageId = `msg-stream-${Date.now()}`
      store.appendMentorMessage({ id: messageId, role: 'mentor', text: '' })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let reply = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply += decoder.decode(value, { stream: true })
        store.setMentorMessageText(messageId, reply)
      }
      reply += decoder.decode()

      if (reply.includes('[stream-error]')) {
        setError(reply.split('[stream-error]')[1]?.trim() || 'Mentor stream failed')
      }
      store.setMentorMessageText(messageId, reply.trim() || '…')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mentor chat failed'
      setError(message)
      store.appendMentorMessage({
        role: 'system',
        text: `Chat failed: ${message}`,
      })
    } finally {
      setBusy(null)
    }
  }

  const runSynthesis = async () => {
    if (busy) return
    setError(null)
    setBusy('analyze')
    store.appendMentorMessage({
      role: 'system',
      text: 'Running full synthesis across deep work, breaks, debriefs, body, spend, journals, and Sunday logs…',
    })

    try {
      let context = ''
      try {
        // Clip before upload so the request itself stays small/fast.
        context = clipMentorContext(buildMentorContext(store.state))
      } catch (contextErr) {
        throw new Error(
          contextErr instanceof Error
            ? `Could not build mentor dossier: ${contextErr.message}`
            : 'Could not build mentor dossier',
        )
      }

      const res = await fetch('/api/mentor/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
        signal: AbortSignal.timeout(110_000),
      })
      const rawBody = await res.text()
      let data: {
        insight?: {
          summary: string
          weapons: string[]
          drags: string[]
          blindSpots: string[]
          prescriptions: string[]
          chatReply: string
        }
        error?: string
        raw?: string
        code?: string
      } = {}
      try {
        data = rawBody ? (JSON.parse(rawBody) as typeof data) : {}
      } catch {
        // Vercel gateway timeouts often return HTML starting with "An error…"
        if (
          res.status === 504 ||
          res.status === 408 ||
          /timed?\s*out|gateway|an error o/i.test(rawBody.slice(0, 120))
        ) {
          throw new Error(
            'Synthesis timed out. The dossier may be too large — try again in a moment.',
          )
        }
        throw new Error(
          res.ok
            ? 'Synthesis returned an unreadable response'
            : `Synthesis failed (HTTP ${res.status})`,
        )
      }
      if (!res.ok || !data.insight) {
        if (
          res.status === 504 ||
          res.status === 408 ||
          data.code === 'synthesis_timeout'
        ) {
          throw new Error(
            data.error ||
              'Synthesis timed out. The dossier may be too large — try again in a moment.',
          )
        }
        const detail = data.raw?.trim()
          ? `${data.error || 'Synthesis failed'} (${data.raw.slice(0, 160)}…)`
          : data.error
        throw new Error(detail || 'Synthesis failed')
      }

      const weapons = Array.isArray(data.insight.weapons) ? data.insight.weapons : []
      const drags = Array.isArray(data.insight.drags) ? data.insight.drags : []
      const blindSpots = Array.isArray(data.insight.blindSpots) ? data.insight.blindSpots : []
      const prescriptions = Array.isArray(data.insight.prescriptions)
        ? data.insight.prescriptions
        : []

      const saved = store.saveMentorInsight({
        summary: data.insight.summary,
        weapons,
        drags,
        blindSpots,
        prescriptions,
      })
      const openCount = blindSpots.length + prescriptions.length
      store.appendMentorMessage({
        role: 'mentor',
        text: data.insight.chatReply || saved.summary,
      })
      if (openCount > 0) {
        store.appendMentorMessage({
          role: 'system',
          text: `Filed ${blindSpots.length} blind spot${
            blindSpots.length === 1 ? '' : 's'
          } and ${prescriptions.length} prescription${
            prescriptions.length === 1 ? '' : 's'
          } on the accountability board. Mark them actioned when you actually install them.`,
        })
      }
    } catch (err) {
      const message =
        err instanceof Error &&
        (err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          /aborted|timed?\s*out/i.test(err.message))
          ? 'Synthesis timed out. The dossier may be too large — try again in a moment.'
          : err instanceof Error
            ? err.message
            : 'Synthesis failed'
      setError(message)
      store.appendMentorMessage({
        role: 'system',
        text: `Synthesis failed: ${message}`,
      })
    } finally {
      setBusy(null)
    }
  }

  const installCharge = (charge: MentorCharge, kind: MentorChargeInstall) => {
    const clean = charge.text.trim()
    if (!clean) return
    const short = clean.length > 72 ? `${clean.slice(0, 72)}…` : clean
    const today = todayDateKey()
    const tomorrow = addDays(today, 1)

    if (kind === 'habit') {
      store.addHabit(short)
      setInstallNote(`Installed as non-negotiable: ${short}`)
    } else if (kind === 'oneThing') {
      store.setOneThing(today, clean)
      setInstallNote('Set as today’s One Thing.')
    } else if (kind === 'calendar') {
      store.addCalendarBlock({
        title: short,
        date: tomorrow,
        startMinutes: 9 * 60,
        endMinutes: 12 * 60,
      })
      setInstallNote(`Calendar block tomorrow 9:00–12:00: ${short}`)
    } else if (kind === 'reminder') {
      store.addReminder(short)
      setInstallNote(`Reminder added: ${short}`)
    } else {
      setInstallNote('Marked actioned on file.')
    }

    if (charge.sourceInsightId && charge.kind === 'prescription') {
      store.markPrescriptionInstalled(charge.sourceInsightId, charge.text)
    }
    store.actionMentorCharge(charge.id, kind)

    store.appendMentorMessage({
      role: 'system',
      text:
        kind === 'manual'
          ? `Marked actioned on file: ${clean}`
          : `Installed ${charge.kind === 'blindSpot' ? 'blind-spot fix' : 'prescription'} (${kind}): ${clean}`,
    })
  }

  const dismissCharge = (charge: MentorCharge) => {
    store.resolveMentorCharge(charge.id, 'dismissed')
    store.appendMentorMessage({
      role: 'system',
      text: `Dismissed from file: ${charge.text}`,
    })
  }

  const reopenCharge = (charge: MentorCharge) => {
    store.resolveMentorCharge(charge.id, 'open')
    setShowCleared(false)
  }

  const insight = mentor.latestInsight

  return (
    <div className="layout-stack mentor-view">
      <section className="action-board">
        <header className="action-board-head mentor-hero-head">
          <div>
            <h2 className="action-board-title">Mentor</h2>
            <p className="action-board-copy">
              Second set of eyes — sessions, body, breaks, spend, journals, Sunday logs. Spot
              blind spots. File them. Install constraints. Dominate.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary mentor-synthesize-btn"
            onClick={() => void runSynthesis()}
            disabled={busy !== null}
          >
            {busy === 'analyze' ? 'Synthesizing…' : 'Run full synthesis'}
          </button>
        </header>

        <div className="mentor-signal-row" aria-label="Mentor data signals">
          <div className="mentor-signal">
            <span className="mentor-signal-value">{store.state.timeEntries.length}</span>
            <span className="mentor-signal-label">Sessions</span>
          </div>
          <div className="mentor-signal">
            <span className="mentor-signal-value">{debriefCount}</span>
            <span className="mentor-signal-label">Debriefs</span>
          </div>
          <div className="mentor-signal">
            <span className="mentor-signal-value">{journalReady}</span>
            <span className="mentor-signal-label">Journal pages</span>
          </div>
          <div className="mentor-signal">
            <span className="mentor-signal-value">{openCharges.length}</span>
            <span className="mentor-signal-label">Open on file</span>
          </div>
        </div>
      </section>

      {(error || installNote) && (
        <div className={error ? 'mentor-error' : 'mentor-install-toast'} role="status">
          {error || installNote}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setError(null)
              setInstallNote(null)
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mentor-layout">
        <section className="mentor-chat" aria-label="Mentor chat">
          <header className="mentor-panel-head">
            <span className="field-label">Chat</span>
            <span className={`status-pill${busy ? ' live' : ''}`}>
              {busy === 'chat' ? 'THINKING' : busy === 'analyze' ? 'SYNTHESIS' : 'LIVE'}
            </span>
          </header>

          <div className="mentor-thread" ref={threadRef}>
            {mentor.messages.map((msg) => (
              <div key={msg.id} className={`mentor-bubble mentor-bubble-${msg.role}`}>
                <span className="mentor-bubble-role">
                  {msg.role === 'user' ? 'You' : msg.role === 'mentor' ? 'Mentor' : 'System'}
                </span>
                <p>{msg.text}</p>
              </div>
            ))}
            {busy === 'chat' && (
              <div className="mentor-bubble mentor-bubble-mentor mentor-bubble-pending">
                <span className="mentor-bubble-role">Mentor</span>
                <p>Reading the dossier…</p>
              </div>
            )}
          </div>

          <form className="mentor-compose" onSubmit={(e) => void sendChat(e)}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Where am I leaking? What makes me a weapon? What should I install this week?"
              rows={3}
              aria-label="Message mentor"
              disabled={busy !== null}
            />
            <button type="submit" className="btn-primary" disabled={!draft.trim() || busy !== null}>
              Send
            </button>
          </form>
        </section>

        <div className="mentor-side">
          <section className="mentor-insight" aria-label="Accountability file">
            <header className="mentor-panel-head">
              <span className="field-label">On file</span>
              <span className="mentor-insight-when">
                {openCharges.length} open
                {clearedCharges.length > 0 ? ` · ${clearedCharges.length} cleared` : ''}
              </span>
            </header>

            {openCharges.length === 0 ? (
              <div className="mentor-empty-state">
                <span className="mentor-empty-mark" aria-hidden />
                <p className="mentor-empty-title">File is clear</p>
                <p className="mentor-empty">
                  Run full synthesis — blind spots and prescriptions get filed here and stay until
                  you action them.
                </p>
              </div>
            ) : (
              <ul className="mentor-charge-list">
                {openCharges.map((charge) => (
                  <ChargeCard
                    key={charge.id}
                    charge={charge}
                    onInstall={(kind) => installCharge(charge, kind)}
                    onDone={() => installCharge(charge, 'manual')}
                    onDismiss={() => dismissCharge(charge)}
                  />
                ))}
              </ul>
            )}

            {clearedCharges.length > 0 && (
              <div className="mentor-cleared-block">
                <button
                  type="button"
                  className="ghost-btn mentor-cleared-toggle"
                  onClick={() => setShowCleared((v) => !v)}
                >
                  {showCleared ? 'Hide cleared' : `Show cleared (${clearedCharges.length})`}
                </button>
                {showCleared && (
                  <ul className="mentor-charge-list mentor-charge-list-cleared">
                    {clearedCharges.map((charge) => (
                      <li key={charge.id} className={`mentor-charge-item cleared kind-${charge.kind}`}>
                        <div className="mentor-charge-top">
                          <span className="mentor-charge-kind">
                            {charge.kind === 'prescription' ? 'RX' : 'BLIND'} · {charge.status}
                          </span>
                          <button
                            type="button"
                            className="btn-secondary compact"
                            onClick={() => reopenCharge(charge)}
                          >
                            Reopen
                          </button>
                        </div>
                        <p>{charge.text}</p>
                        {(charge.installKind || charge.actionNote) && (
                          <span className="mentor-charge-meta">
                            {[charge.installKind, charge.actionNote].filter(Boolean).join(' — ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {insight && (
            <section className="mentor-insight mentor-insight-latest" aria-label="Latest synthesis">
              <header className="mentor-panel-head">
                <span className="field-label">Latest synthesis</span>
                <span className="mentor-insight-when">{formatInsightTime(insight.createdAt)}</span>
              </header>
              <InsightPanel insight={insight} />
            </section>
          )}

          <section className="mentor-journal" aria-label="Journal photo upload">
            <header className="mentor-panel-head">
              <div className="mentor-panel-titles">
                <span className="field-label">Journal backfill</span>
                <p className="mentor-panel-sub">
                  Pages dated from the header. Mentor reads the real day.
                </p>
              </div>
              <span className="status-pill mentor-pill-soft">DATE OCR</span>
            </header>
            <div className="mentor-journal-body">
              <JournalCapture store={store} defaultDate={todayDateKey()} preferPageDate />
              {mentor.journalEntries.length > 0 && (
                <div className="mentor-journal-archive">
                  <div className="mentor-journal-archive-head">
                    <span className="field-label">In the loop</span>
                    <span className="mentor-journal-archive-count">
                      {mentor.journalEntries.length}
                    </span>
                  </div>
                  <ul className="mentor-journal-list">
                    {mentor.journalEntries.slice(0, 10).map((entry) => (
                      <li key={entry.id} className="mentor-journal-item">
                        <div className="mentor-journal-item-head">
                          <div className="mentor-journal-item-meta">
                            <strong>{entry.date}</strong>
                            {entry.dateSource === 'extracted' && (
                              <span className="mentor-journal-chip">auto-dated</span>
                            )}
                            {entry.detectedDateRaw && (
                              <span className="mentor-journal-chip muted">
                                {entry.detectedDateRaw}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="journal-page-remove subtle"
                            aria-label={`Remove ${entry.sourceName}`}
                            onClick={() => store.removeJournalEntry(entry.id)}
                          >
                            ×
                          </button>
                        </div>
                        <span className="mentor-journal-source">{entry.sourceName}</span>
                        <p>
                          {entry.status === 'failed'
                            ? entry.error || 'Failed'
                            : entry.status === 'pending'
                              ? 'Extracting…'
                              : entry.extractedText.slice(0, 200) || '(empty)'}
                          {entry.status === 'extracted' && entry.extractedText.length > 200
                            ? '…'
                            : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function ChargeCard({
  charge,
  onInstall,
  onDone,
  onDismiss,
}: {
  charge: MentorCharge
  onInstall: (kind: MentorChargeInstall) => void
  onDone: () => void
  onDismiss: () => void
}) {
  return (
    <li className={`mentor-charge-item kind-${charge.kind}`}>
      <div className="mentor-charge-top">
        <span className="mentor-charge-kind">
          {charge.kind === 'prescription' ? 'Prescription' : 'Blind spot'}
        </span>
        <span className="mentor-charge-age">{formatInsightTime(charge.createdAt)}</span>
      </div>
      <p>{charge.text}</p>
      <div className="mentor-rx-actions">
        {charge.kind === 'prescription' && (
          <>
            <button type="button" className="btn-secondary compact" onClick={() => onInstall('habit')}>
              Habit
            </button>
            <button
              type="button"
              className="btn-secondary compact"
              onClick={() => onInstall('oneThing')}
            >
              One Thing
            </button>
            <button
              type="button"
              className="btn-secondary compact"
              onClick={() => onInstall('calendar')}
            >
              Block
            </button>
            <button
              type="button"
              className="btn-secondary compact"
              onClick={() => onInstall('reminder')}
            >
              Reminder
            </button>
          </>
        )}
        <button type="button" className="btn-primary compact" onClick={onDone}>
          Done
        </button>
        <button type="button" className="ghost-btn compact" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </li>
  )
}

function InsightPanel({ insight }: { insight: MentorInsight }) {
  return (
    <div className="mentor-insight-body">
      <p className="mentor-insight-summary">{insight.summary}</p>
      <InsightList title="Weapon conditions" items={insight.weapons} tone="weapon" />
      <InsightList title="What drags you" items={insight.drags} tone="drag" />
    </div>
  )
}

function InsightList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'weapon' | 'drag' | 'blind' | 'rx'
}) {
  if (items.length === 0) return null
  return (
    <div className={`mentor-insight-list tone-${tone}`}>
      <span className="field-label">{title}</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
